// Package server provides the FORGE HTTP and WebSocket server.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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
	db           db.Database
	router       *chi.Mux
	hub          *Hub
	logger       *slog.Logger
}

// Artifact represents the loaded runtime artifact.
type Artifact struct {
	Version   string                    `json:"version"`
	AppName   string                    `json:"app_name"`
	Auth      string                    `json:"auth"`
	Database  string                    `json:"database"`
	Entities  map[string]*EntitySchema  `json:"entities"`
	Actions   map[string]*ActionSchema  `json:"actions"`
	Rules     []*RuleSchema             `json:"rules"`
	Access    map[string]*AccessSchema  `json:"access"`
	Views     map[string]*ViewSchema    `json:"views"`
	Jobs      map[string]*JobSchema     `json:"jobs"`
	Hooks     []*HookSchema             `json:"hooks"`
	Messages  map[string]*MessageSchema `json:"messages"`
	Migration *MigrationSchema          `json:"migration"`
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

	// Health check
	r.Get("/health", s.handleHealth)

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

	// Artifact info (debug)
	r.Get("/debug/artifact", s.handleArtifact)
}

// Run starts the server.
func (s *Server) Run() error {
	// Start WebSocket hub
	go s.hub.Run()

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

	s.logger.Info("starting server", "addr", addr, "app", s.artifact.AppName)

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}

	<-done
	return nil
}

// Close closes the server and releases resources.
func (s *Server) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
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
	s.respond(w, http.StatusOK, map[string]string{
		"status":  "healthy",
		"app":     s.artifact.AppName,
		"version": s.artifact.Version,
	})
}

func (s *Server) handleArtifact(w http.ResponseWriter, r *http.Request) {
	s.respond(w, http.StatusOK, s.artifact)
}

func (s *Server) handleAction(w http.ResponseWriter, r *http.Request) {
	actionName := chi.URLParam(r, "action")

	action, ok := s.artifact.Actions[actionName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ACTION_NOT_FOUND",
			Message: fmt.Sprintf("action %s not found", actionName),
		})
		return
	}

	// Parse input
	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_INPUT",
			Message: "invalid JSON input",
		})
		return
	}

	s.logger.Info("action.started", "action", actionName, "input", input)

	// TODO: Execute action with rules and access control
	// For now, just acknowledge
	_ = action

	s.logger.Info("action.completed", "action", actionName)

	s.respond(w, http.StatusOK, map[string]string{
		"message": fmt.Sprintf("action %s executed", actionName),
	})
}

func (s *Server) handleView(w http.ResponseWriter, r *http.Request) {
	viewName := chi.URLParam(r, "view")

	view, ok := s.artifact.Views[viewName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "VIEW_NOT_FOUND",
			Message: fmt.Sprintf("view %s not found", viewName),
		})
		return
	}

	// TODO: Execute view query with access control
	// For now, return empty array
	_ = view

	s.respond(w, http.StatusOK, []interface{}{})
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// TODO: Query database with access control
	_ = entity

	s.respond(w, http.StatusOK, []interface{}{})
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")
	id := chi.URLParam(r, "id")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// TODO: Query database with access control
	_ = entity
	_ = id

	s.respondError(w, http.StatusNotFound, Message{
		Code:    "NOT_FOUND",
		Message: "record not found",
	})
}

func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_INPUT",
			Message: "invalid JSON input",
		})
		return
	}

	// TODO: Insert into database with rules and access control
	_ = entity

	s.respond(w, http.StatusCreated, input)
}

func (s *Server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")
	id := chi.URLParam(r, "id")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_INPUT",
			Message: "invalid JSON input",
		})
		return
	}

	// TODO: Update in database with rules and access control
	_ = entity
	_ = id

	s.respond(w, http.StatusOK, input)
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")
	id := chi.URLParam(r, "id")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// TODO: Delete from database with rules and access control
	_ = entity
	_ = id

	s.respond(w, http.StatusOK, nil)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ServeWs(s.hub, w, r)
}
