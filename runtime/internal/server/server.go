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
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/forge-lang/forge/runtime/internal/config"
	"github.com/forge-lang/forge/runtime/internal/db"
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
	Name        string   `json:"name"`
	InputEntity string   `json:"input_entity"`
	Rules       []string `json:"rules"`
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
	Name         string   `json:"name"`
	Source       string   `json:"source"`
	Fields       []string `json:"fields"`
	Query        string   `json:"query"`
	Dependencies []string `json:"dependencies"`
}

// JobSchema represents a job.
type JobSchema struct {
	Name         string   `json:"name"`
	InputEntity  string   `json:"input_entity"`
	Capabilities []string `json:"capabilities"`
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

	s := &Server{
		config:      cfg,
		runtimeConf: runtimeConf,
		artifact:    &artifact,
		db:          database,
		router:      chi.NewRouter(),
		hub:         NewHub(),
		logger:      logger,
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

// Run starts the server.
func (s *Server) Run() error {
	// Start WebSocket hub
	go s.hub.Run()

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
	if s.db != nil {
		return s.db.Close()
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
