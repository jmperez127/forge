// Package server provides the FORGE HTTP and WebSocket server.
package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/forge-lang/forge/runtime/internal/config"
	"github.com/forge-lang/forge/runtime/internal/db"
	"github.com/forge-lang/forge/runtime/internal/jobs"
	"github.com/forge-lang/forge/runtime/internal/provider"
	"github.com/forge-lang/forge/runtime/internal/provider/builtin"
	"github.com/forge-lang/forge/runtime/internal/security"
)

// Config holds server configuration.
type Config struct {
	Port         int
	ArtifactPath string
	DatabaseURL  string
	RedisURL     string
	LogLevel     string
	ProjectDir   string // Project directory containing forge.runtime.toml
}

// Server is the FORGE runtime server.
type Server struct {
	config       *Config
	runtimeConf  *config.Config
	artifact     *Artifact
	artifactMu   sync.RWMutex // Protects artifact access
	db           db.Database
	router       *chi.Mux
	hub          *Hub
	logger       *slog.Logger
	watcher      *ArtifactWatcher
	turnstile    *security.TurnstileVerifier
	executor     *jobs.Executor // Job execution engine
}

// Artifact represents the loaded runtime artifact.
type Artifact struct {
	Version   string                     `json:"version"`
	AppName   string                     `json:"app_name"`
	Auth      string                     `json:"auth"`
	Database  string                     `json:"database"`
	Entities  map[string]*EntitySchema   `json:"entities"`
	Actions   map[string]*ActionSchema   `json:"actions"`
	Rules     []*RuleSchema              `json:"rules"`
	Access    map[string]*AccessSchema   `json:"access"`
	Views     map[string]*ViewSchema     `json:"views"`
	Jobs      map[string]*JobSchema      `json:"jobs"`
	Hooks     []*HookSchema              `json:"hooks"`
	Webhooks  map[string]*WebhookSchema  `json:"webhooks"`
	Messages  map[string]*MessageSchema  `json:"messages"`
	Migration *MigrationSchema           `json:"migration"`
}

// MigrationSchema represents the database migration.
type MigrationSchema struct {
	Version string   `json:"version"`
	Up      []string `json:"up"`
	Down    []string `json:"down"`
}

// EntitySchema represents an entity.
type EntitySchema struct {
	Name      string                   `json:"name"`
	Table     string                   `json:"table"`
	Fields    map[string]*FieldSchema  `json:"fields"`
	Relations map[string]*RelSchema    `json:"relations"`
}

// FieldSchema represents a field.
type FieldSchema struct {
	Name       string      `json:"name"`
	Type       string      `json:"type"`
	SQLType    string      `json:"sql_type"`
	Nullable   bool        `json:"nullable"`
	Unique     bool        `json:"unique"`
	Default    interface{} `json:"default,omitempty"`
	EnumValues []string    `json:"enum_values,omitempty"`
}

// RelSchema represents a relation.
type RelSchema struct {
	Name        string `json:"name"`
	Target      string `json:"target"`
	TargetTable string `json:"target_table"`
	ForeignKey  string `json:"foreign_key"`
	IsMany      bool   `json:"is_many"`
	OnDelete    string `json:"on_delete"`
}

// ActionSchema represents an action.
type ActionSchema struct {
	Name         string   `json:"name"`
	InputEntity  string   `json:"input_entity"`
	Operation    string   `json:"operation,omitempty"`     // "create", "update", "delete"
	TargetEntity string   `json:"target_entity,omitempty"` // entity being created/updated/deleted
	Rules        []string `json:"rules"`
}

// RuleSchema represents a rule.
type RuleSchema struct {
	ID           string `json:"id"`
	Entity       string `json:"entity"`
	Operation    string `json:"operation"`
	Condition    string `json:"condition"`
	SQLPredicate string `json:"sql_predicate"`
	EmitCode     string `json:"emit_code,omitempty"`
	IsForbid     bool   `json:"is_forbid"`
}

// AccessSchema represents access control.
type AccessSchema struct {
	Entity   string `json:"entity"`
	Table    string `json:"table"`
	ReadSQL  string `json:"read_sql"`
	WriteSQL string `json:"write_sql"`
}

// ViewSchema represents a view.
type ViewSchema struct {
	Name         string      `json:"name"`
	Source       string      `json:"source"`
	SourceTable  string      `json:"source_table"`
	Fields       []ViewField `json:"fields"`
	Joins        []ViewJoin  `json:"joins,omitempty"`
	Filter       string      `json:"filter,omitempty"`
	Params       []string    `json:"params,omitempty"`
	DefaultSort  []ViewSort  `json:"default_sort,omitempty"`
	Dependencies []string    `json:"dependencies"`
}

// ViewField represents a resolved field in a view.
type ViewField struct {
	Name       string `json:"name"`
	Column     string `json:"column"`
	Alias      string `json:"alias"`
	Type       string `json:"type"`
	Filterable bool   `json:"filterable"`
	Sortable   bool   `json:"sortable"`
}

// ViewJoin represents a JOIN required by a view.
type ViewJoin struct {
	Table string `json:"table"`
	Alias string `json:"alias"`
	On    string `json:"on"`
	Type  string `json:"type"`
}

// ViewSort represents a default sort field.
type ViewSort struct {
	Column    string `json:"column"`
	Direction string `json:"direction"`
}

// JobSchema represents a job.
type JobSchema struct {
	Name          string            `json:"name"`
	InputEntity   string            `json:"input_entity"`
	Capabilities  []string          `json:"capabilities"`
	TargetEntity  string            `json:"target_entity,omitempty"`
	FieldMappings map[string]string `json:"field_mappings,omitempty"`
}

// HookSchema represents a hook.
type HookSchema struct {
	Entity    string   `json:"entity"`
	Timing    string   `json:"timing"`
	Operation string   `json:"operation"`
	Jobs      []string `json:"jobs"`
}

// MessageSchema represents a message.
type MessageSchema struct {
	Code    string `json:"code"`
	Level   string `json:"level"`
	Default string `json:"default"`
}

// WebhookSchema represents a webhook.
// The provider normalizes data to standard field names - no mappings needed.
type WebhookSchema struct {
	Name     string   `json:"name"`
	Route    string   `json:"route"`
	Provider string   `json:"provider"`
	Events   []string `json:"events"`
	Action   string   `json:"action"`
}

// New creates a new Server.
func New(cfg *Config) (*Server, error) {
	// Setup logger first
	var level slog.Level
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))

	// Load artifact
	artifactData, err := os.ReadFile(cfg.ArtifactPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load artifact: %w", err)
	}

	var artifact Artifact
	if err := json.Unmarshal(artifactData, &artifact); err != nil {
		return nil, fmt.Errorf("failed to parse artifact: %w", err)
	}

	// Determine project directory from artifact path
	projectDir := cfg.ProjectDir
	if projectDir == "" {
		projectDir = filepath.Dir(filepath.Dir(cfg.ArtifactPath))
	}

	// Load runtime configuration from forge.runtime.toml
	runtimeConf, err := config.Load(projectDir)
	if err != nil {
		logger.Warn("failed to load forge.runtime.toml, using defaults", "error", err)
		runtimeConf = config.LoadFromEnv()
	}

	// Override database URL from command line if provided
	if cfg.DatabaseURL != "" && cfg.DatabaseURL != "postgres://localhost:5432/forge?sslmode=disable" {
		runtimeConf.Database.Adapter = "postgres"
		runtimeConf.Database.Postgres.URL = cfg.DatabaseURL
	}

	// Resolve secrets from environment
	runtimeConf.ResolveSecrets()

	logger.Info("loaded runtime configuration",
		"adapter", runtimeConf.Database.Adapter,
		"project_dir", projectDir,
	)

	// Create database connection
	database, err := db.New(&runtimeConf.Database)
	if err != nil {
		return nil, fmt.Errorf("failed to create database: %w", err)
	}

	// Connect to database
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := database.Connect(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	if database.IsEmbedded() {
		logger.Info("using embedded PostgreSQL", "data_dir", runtimeConf.Database.Embedded.DataDir)
	} else {
		logger.Info("connected to external PostgreSQL")
	}

	// Apply migrations from artifact
	if artifact.Migration != nil {
		migration := &db.Migration{
			Version: artifact.Migration.Version,
			Up:      artifact.Migration.Up,
			Down:    artifact.Migration.Down,
		}

		result, err := db.ApplyMigrationWithLog(ctx, database, migration, logger)
		if err != nil {
			database.Close()
			return nil, fmt.Errorf("failed to apply migration: %w", err)
		}

		logger.Info("schema ready", "applied", result.Applied, "skipped", result.Skipped)
	}

	// Initialize provider registry with config from forge.runtime.toml
	providerConfigs := runtimeConf.GetProviderConfigs()
	registry := provider.Global()
	if err := registry.Init(providerConfigs); err != nil {
		logger.Warn("provider registry initialization failed", "error", err)
		// Non-fatal: jobs that need uninitialized providers will fail at execution time
	}
	logger.Info("provider registry initialized",
		"providers", registry.Providers(),
		"capabilities", registry.Capabilities(),
	)

	// Create and start job executor
	workerCount := runtimeConf.Jobs.Concurrency
	if workerCount <= 0 {
		workerCount = 10
	}
	executor := jobs.NewExecutor(registry, logger, workerCount)

	s := &Server{
		config:      cfg,
		runtimeConf: runtimeConf,
		artifact:    &artifact,
		db:          database,
		router:      chi.NewRouter(),
		hub:         NewHub(),
		logger:      logger,
		executor:    executor,
	}

	// Wire up the entity provider with the server's database writer.
	// The entity provider is registered during init() and needs a concrete
	// EntityWriter implementation to perform INSERT operations from jobs.
	if ep := registry.GetProvider("entity"); ep != nil {
		if entityProv, ok := ep.(*builtin.EntityProvider); ok {
			entityProv.SetWriter(s)
			logger.Info("entity provider wired with database writer")
		}
	}

	// Initialize Turnstile verifier if configured
	if runtimeConf.Security.Turnstile.SecretKey != "" {
		s.turnstile = security.NewTurnstileVerifier(runtimeConf.Security.Turnstile.SecretKey)
		logger.Info("turnstile verification enabled")
	}

	s.setupRoutes()
	s.setupDevRoutes()

	return s, nil
}

func (s *Server) setupRoutes() {
	r := s.router

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// Security: rate limiting + bot filter
	secEnabled := true
	if s.runtimeConf.Security.Enabled != nil {
		secEnabled = *s.runtimeConf.Security.Enabled
	}
	botEnabled := true
	if s.runtimeConf.Security.BotFilter.Enabled != nil {
		botEnabled = *s.runtimeConf.Security.BotFilter.Enabled
	}
	r.Use(security.NewMiddleware(&security.MiddlewareConfig{
		Enabled:          secEnabled,
		AuthWindow:       s.runtimeConf.Security.RateLimit.AuthWindow,
		AuthBurst:        s.runtimeConf.Security.RateLimit.AuthBurst,
		APIWindow:        s.runtimeConf.Security.RateLimit.APIWindow,
		APIBurst:         s.runtimeConf.Security.RateLimit.APIBurst,
		BotFilterEnabled: botEnabled,
		Logger:           s.logger,
	}))

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Request-ID")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	// Auth middleware - extract user from Authorization header
	r.Use(s.authMiddleware)

	// Health check
	r.Get("/health", s.handleHealth)

	// Auth routes (when password auth enabled)
	if s.runtimeConf.Auth.Provider == "password" {
		r.Route("/auth", func(r chi.Router) {
			r.Get("/config", s.handleAuthConfig)
			r.Post("/register", s.handleRegister)
			r.Post("/login", s.handleLogin)
			r.Post("/logout", s.handleLogout)
			r.Post("/refresh", s.handleRefresh)
			r.Group(func(r chi.Router) {
				r.Use(s.requireAuth)
				r.Get("/me", s.handleMe)
				r.Post("/change-password", s.handleChangePassword)
			})
		})
	}

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Actions
		r.Post("/actions/{action}", s.handleAction)

		// Views
		r.Get("/views/{view}", s.handleView)

		// Entities (CRUD)
		r.Route("/entities/{entity}", func(r chi.Router) {
			r.Get("/", s.handleList)
			r.Get("/{id}", s.handleGet)
			r.Post("/", s.handleCreate)
			r.Put("/{id}", s.handleUpdate)
			r.Delete("/{id}", s.handleDelete)
		})
	})

	// WebSocket
	r.Get("/ws", s.handleWebSocket)

	// Webhooks - external integrations
	r.Post("/webhooks/{webhook}", s.handleWebhook)

	// Artifact info (debug)
	r.Get("/debug/artifact", s.handleArtifact)
}

// drainJobResults reads from the executor results channel and logs outcomes.
func (s *Server) drainJobResults() {
	for result := range s.executor.Results() {
		if result.Success {
			s.logger.Info("job.completed",
				"job_id", result.JobID,
				"duration_ms", result.Duration.Milliseconds(),
			)
		} else {
			s.logger.Error("job.failed",
				"job_id", result.JobID,
				"error", result.Error,
				"duration_ms", result.Duration.Milliseconds(),
			)
		}
	}
}

// Run starts the server.
func (s *Server) Run() error {
	// Start WebSocket hub
	go s.hub.Run()

	// Start job executor and result drain
	if s.executor != nil {
		s.executor.Start()
		go s.drainJobResults()
	}

	// Start artifact watcher for hot reload (development mode only)
	s.startWatcher()

	addr := fmt.Sprintf(":%d", s.config.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: s.router,
	}

	// Graceful shutdown
	done := make(chan bool, 1)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		s.logger.Info("shutting down server")

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			s.logger.Error("server shutdown error", "error", err)
		}

		// Stop job executor (drain in-flight jobs)
		if s.executor != nil {
			s.logger.Info("stopping job executor")
			s.executor.Stop()
		}

		// Close database connection
		if s.db != nil {
			s.logger.Info("closing database connection")
			if err := s.db.Close(); err != nil {
				s.logger.Error("database close error", "error", err)
			}
		}

		close(done)
	}()

	s.logger.Info("starting server", "addr", addr, "app", s.getArtifact().AppName)

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}

	<-done
	return nil
}

// Close closes the server and releases resources.
func (s *Server) Close() error {
	if s.watcher != nil {
		s.watcher.Stop()
	}
	if s.executor != nil {
		s.executor.Stop()
	}
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// InsertEntity implements builtin.EntityWriter. It builds a parameterized INSERT
// statement from the given table and fields and executes it against the server's
// database. Column order is deterministic (sorted) to produce stable queries.
func (s *Server) InsertEntity(ctx context.Context, table string, fields map[string]any) error {
	if len(fields) == 0 {
		return fmt.Errorf("InsertEntity: no fields provided")
	}

	// Sort column names for deterministic query ordering.
	columns := make([]string, 0, len(fields))
	for col := range fields {
		columns = append(columns, col)
	}
	sort.Strings(columns)

	// Build parameterized INSERT: INSERT INTO table (c1, c2) VALUES ($1, $2)
	placeholders := make([]string, len(columns))
	args := make([]any, len(columns))
	for i, col := range columns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = fields[col]
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	s.logger.Debug("entity.insert",
		"table", table,
		"columns", columns,
		"query", query,
	)

	_, err := s.db.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("InsertEntity into %s: %w", table, err)
	}
	return nil
}

// getArtifact returns the current artifact with read lock protection.
func (s *Server) getArtifact() *Artifact {
	s.artifactMu.RLock()
	defer s.artifactMu.RUnlock()
	return s.artifact
}

// ReloadArtifact reloads the artifact from disk and broadcasts the change.
func (s *Server) ReloadArtifact() error {
	artifactData, err := os.ReadFile(s.config.ArtifactPath)
	if err != nil {
		return fmt.Errorf("failed to read artifact: %w", err)
	}

	var newArtifact Artifact
	if err := json.Unmarshal(artifactData, &newArtifact); err != nil {
		return fmt.Errorf("failed to parse artifact: %w", err)
	}

	// Swap artifact atomically
	s.artifactMu.Lock()
	s.artifact = &newArtifact
	s.artifactMu.Unlock()

	s.logger.Info("artifact reloaded", "app", newArtifact.AppName, "version", newArtifact.Version)

	// Broadcast reload event to all connected WebSocket clients
	s.hub.BroadcastToAll("artifact_reload", map[string]string{
		"app":     newArtifact.AppName,
		"version": newArtifact.Version,
	})

	return nil
}

// startWatcher starts the artifact file watcher if in development mode.
func (s *Server) startWatcher() {
	env := os.Getenv("FORGE_ENV")
	if env != "" && env != "development" {
		return
	}

	s.watcher = NewArtifactWatcher(s.config.ArtifactPath, s.ReloadArtifact, s.logger)
	if err := s.watcher.Start(); err != nil {
		s.logger.Warn("failed to start artifact watcher", "error", err)
	}
}

// Response types

// APIResponse is the standard API response.
type APIResponse struct {
	Status   string      `json:"status"`
	Data     interface{} `json:"data,omitempty"`
	Messages []Message   `json:"messages,omitempty"`
}

// Message represents an error/info message.
type Message struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (s *Server) respond(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{
		Status: "ok",
		Data:   data,
	})
}

func (s *Server) respondError(w http.ResponseWriter, status int, messages ...Message) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{
		Status:   "error",
		Messages: messages,
	})
}

// Handlers

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	artifact := s.getArtifact()
	s.respond(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"app":     artifact.AppName,
		"version": artifact.Version,
	})
}

func (s *Server) handleArtifact(w http.ResponseWriter, r *http.Request) {
	s.respond(w, http.StatusOK, s.getArtifact())
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ServeWs(s.hub, w, r)
}

// userContextKey is the context key for user ID
type userContextKey struct{}

// authMiddleware extracts user ID from Authorization header
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" {
			next.ServeHTTP(w, r)
			return
		}

		// Extract Bearer token
		if len(auth) > 7 && auth[:7] == "Bearer " {
			token := auth[7:]

			// Use proper JWT validation when password auth is enabled with a secret
			if s.runtimeConf.Auth.Provider == "password" && s.runtimeConf.Auth.JWT.Secret != "" {
				claims, err := s.validateToken(token)
				if err == nil && claims.TokenType == "access" {
					ctx := context.WithValue(r.Context(), userContextKey{}, claims.UserID)
					r = r.WithContext(ctx)
				}
			} else {
				// Fallback: Decode base64 JWT payload (simple mock JWT for testing)
				if decoded, err := base64Decode(token); err == nil {
					var claims map[string]interface{}
					if err := json.Unmarshal(decoded, &claims); err == nil {
						if sub, ok := claims["sub"].(string); ok {
							// Add user ID to context
							ctx := context.WithValue(r.Context(), userContextKey{}, sub)
							r = r.WithContext(ctx)
						}
					}
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

// getUserID extracts user ID from request context
func getUserID(r *http.Request) string {
	if id, ok := r.Context().Value(userContextKey{}).(string); ok {
		return id
	}
	return ""
}

// base64Decode decodes a base64 string (handles both standard and URL-safe)
func base64Decode(s string) ([]byte, error) {
	// Add padding if needed
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}

	// Try standard base64 first
	if decoded, err := base64.StdEncoding.DecodeString(s); err == nil {
		return decoded, nil
	}

	// Try URL-safe base64
	return base64.URLEncoding.DecodeString(s)
}
