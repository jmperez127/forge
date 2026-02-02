package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/google/uuid"
)

// Embedded implements Database using an embedded PostgreSQL server.
// This provides zero-config database for development and testing.
//
// Philosophy from HOW_FORGE_WAS_CONCIEVED.html:
// - "Delete work" - Tests shouldn't require manual database setup
// - "Remove decisions" - Developers shouldn't configure databases
// - "Make the right thing the default" - Just run, it works
type Embedded struct {
	config   *EmbeddedConfig
	postgres *embeddedpostgres.EmbeddedPostgres
	inner    *Postgres // Delegate to Postgres for actual queries
	dataDir  string    // Actual data directory (may be temp for ephemeral)
}

// NewEmbedded creates a new embedded PostgreSQL adapter.
func NewEmbedded(config *EmbeddedConfig) (*Embedded, error) {
	return &Embedded{
		config: config,
	}, nil
}

// Connect starts the embedded PostgreSQL server and establishes connection.
func (e *Embedded) Connect(ctx context.Context) error {
	// Determine data directory
	e.dataDir = e.config.DataDir
	if e.config.Ephemeral {
		// Create temporary directory for ephemeral mode
		tempDir, err := os.MkdirTemp("", "forge-test-*")
		if err != nil {
			return fmt.Errorf("failed to create temp directory: %w", err)
		}
		e.dataDir = tempDir
	}

	// Ensure data directory exists
	if err := os.MkdirAll(e.dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	// Configure embedded PostgreSQL
	pgConfig := embeddedpostgres.DefaultConfig().
		Port(uint32(e.config.Port)).
		DataPath(filepath.Join(e.dataDir, "pgdata")).
		RuntimePath(filepath.Join(e.dataDir, "runtime")).
		Database("forge").
		Username("forge").
		Password("forge").
		StartTimeout(60 * time.Second)

	e.postgres = embeddedpostgres.NewDatabase(pgConfig)

	// Start embedded PostgreSQL
	if err := e.postgres.Start(); err != nil {
		// Clean up temp directory on failure
		if e.config.Ephemeral {
			os.RemoveAll(e.dataDir)
		}
		return fmt.Errorf("failed to start embedded postgres: %w", err)
	}

	// Create inner Postgres adapter to handle actual queries
	innerConfig := &PostgresConfig{
		URL:      fmt.Sprintf("postgres://forge:forge@localhost:%d/forge?sslmode=disable", e.config.Port),
		PoolSize: 10, // Lower pool size for embedded
	}

	inner, err := NewPostgres(innerConfig)
	if err != nil {
		e.postgres.Stop()
		if e.config.Ephemeral {
			os.RemoveAll(e.dataDir)
		}
		return fmt.Errorf("failed to create postgres adapter: %w", err)
	}

	if err := inner.Connect(ctx); err != nil {
		e.postgres.Stop()
		if e.config.Ephemeral {
			os.RemoveAll(e.dataDir)
		}
		return fmt.Errorf("failed to connect to embedded postgres: %w", err)
	}

	e.inner = inner
	return nil
}

// Close stops the embedded PostgreSQL server.
func (e *Embedded) Close() error {
	if e.inner != nil {
		e.inner.Close()
	}

	if e.postgres != nil {
		if err := e.postgres.Stop(); err != nil {
			return fmt.Errorf("failed to stop embedded postgres: %w", err)
		}
	}

	// Clean up ephemeral data directory
	if e.config.Ephemeral && e.dataDir != "" {
		os.RemoveAll(e.dataDir)
	}

	return nil
}

// ApplyMigration delegates to the inner Postgres adapter.
func (e *Embedded) ApplyMigration(ctx context.Context, migration *Migration) error {
	return e.inner.ApplyMigration(ctx, migration)
}

// WithUser delegates to the inner Postgres adapter.
func (e *Embedded) WithUser(userID uuid.UUID) Database {
	return &Embedded{
		config:   e.config,
		postgres: e.postgres,
		inner:    e.inner.WithUser(userID).(*Postgres),
		dataDir:  e.dataDir,
	}
}

// Query delegates to the inner Postgres adapter.
func (e *Embedded) Query(ctx context.Context, query string, args ...any) (Rows, error) {
	return e.inner.Query(ctx, query, args...)
}

// QueryRow delegates to the inner Postgres adapter.
func (e *Embedded) QueryRow(ctx context.Context, query string, args ...any) Row {
	return e.inner.QueryRow(ctx, query, args...)
}

// Exec delegates to the inner Postgres adapter.
func (e *Embedded) Exec(ctx context.Context, query string, args ...any) (Result, error) {
	return e.inner.Exec(ctx, query, args...)
}

// Begin delegates to the inner Postgres adapter.
func (e *Embedded) Begin(ctx context.Context) (Tx, error) {
	return e.inner.Begin(ctx)
}

// IsEmbedded returns true for embedded PostgreSQL.
func (e *Embedded) IsEmbedded() bool {
	return true
}

// ConnectionURL returns the connection URL for the embedded database.
// Useful for debugging or external tools.
func (e *Embedded) ConnectionURL() string {
	return fmt.Sprintf("postgres://forge:forge@localhost:%d/forge?sslmode=disable", e.config.Port)
}
