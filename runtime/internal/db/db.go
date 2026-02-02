// Package db provides database abstraction for the FORGE runtime.
//
// FORGE supports three database modes:
//   - embedded: Zero-config PostgreSQL for development/testing
//   - postgres: External PostgreSQL for production
//   - postgres:sharded: Sharded PostgreSQL for scale
//
// Configuration lives in forge.runtime.toml, NOT in the .forge spec.
// The spec never sees secrets - that separation is non-negotiable.
package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// Database is the interface for all database adapters.
// FORGE runtime uses this to execute queries regardless of the underlying
// database mode (embedded, external, or sharded).
type Database interface {
	// Connect establishes the database connection.
	// For embedded mode, this starts the embedded PostgreSQL server.
	Connect(ctx context.Context) error

	// Close closes the database connection.
	// For embedded mode, this stops the embedded PostgreSQL server.
	Close() error

	// ApplyMigration applies the schema from the artifact.
	// This is called on startup to ensure the database matches the spec.
	ApplyMigration(ctx context.Context, migration *Migration) error

	// WithUser returns a database context scoped to a specific user.
	// This sets app.user_id for PostgreSQL RLS policies.
	WithUser(userID uuid.UUID) Database

	// Query executes a SELECT query and returns rows.
	Query(ctx context.Context, query string, args ...any) (Rows, error)

	// QueryRow executes a SELECT query expecting exactly one row.
	QueryRow(ctx context.Context, query string, args ...any) Row

	// Exec executes a non-SELECT query (INSERT, UPDATE, DELETE).
	Exec(ctx context.Context, query string, args ...any) (Result, error)

	// Begin starts a new transaction.
	Begin(ctx context.Context) (Tx, error)

	// IsEmbedded returns true if this is an embedded database.
	// Used for cleanup and test mode detection.
	IsEmbedded() bool
}

// Tx represents a database transaction.
type Tx interface {
	// Query executes a SELECT query within the transaction.
	Query(ctx context.Context, query string, args ...any) (Rows, error)

	// QueryRow executes a SELECT query expecting exactly one row.
	QueryRow(ctx context.Context, query string, args ...any) Row

	// Exec executes a non-SELECT query within the transaction.
	Exec(ctx context.Context, query string, args ...any) (Result, error)

	// Commit commits the transaction.
	Commit(ctx context.Context) error

	// Rollback aborts the transaction.
	Rollback(ctx context.Context) error
}

// Rows represents a result set from a query.
type Rows interface {
	// Next advances to the next row. Returns false when done.
	Next() bool

	// Scan copies the current row's columns into dest.
	Scan(dest ...any) error

	// Values returns all column values for the current row.
	Values() ([]any, error)

	// FieldDescriptions returns metadata about the columns.
	FieldDescriptions() []FieldDescription

	// Close closes the rows, releasing resources.
	Close() error

	// Err returns any error encountered during iteration.
	Err() error
}

// FieldDescription describes a column in a result set.
type FieldDescription struct {
	Name string
}

// Row represents a single row result.
type Row interface {
	// Scan copies the row's columns into dest.
	Scan(dest ...any) error
}

// Result represents the result of an Exec operation.
type Result interface {
	// RowsAffected returns the number of rows affected.
	RowsAffected() int64
}

// Migration represents a database migration from the artifact.
type Migration struct {
	Version string   `json:"version"`
	Up      []string `json:"up"`
	Down    []string `json:"down"`
}

// Config holds database configuration parsed from forge.runtime.toml.
type Config struct {
	// Adapter specifies the database mode: "embedded", "postgres", or "postgres:sharded"
	Adapter string `toml:"adapter"`

	// Embedded configuration (used when adapter = "embedded")
	Embedded EmbeddedConfig `toml:"embedded"`

	// Postgres configuration (used when adapter = "postgres")
	Postgres PostgresConfig `toml:"postgres"`

	// Sharded configuration (used when adapter = "postgres:sharded")
	Sharded ShardedConfig `toml:"sharded"`
}

// EmbeddedConfig holds configuration for embedded PostgreSQL.
type EmbeddedConfig struct {
	// DataDir is where embedded PostgreSQL stores data.
	// Default: .forge-runtime/data
	DataDir string `toml:"data_dir"`

	// Port for embedded PostgreSQL. Default: 5432
	Port int `toml:"port"`

	// Ephemeral means the database is deleted on shutdown (for tests).
	Ephemeral bool `toml:"ephemeral"`
}

// PostgresConfig holds configuration for external PostgreSQL.
type PostgresConfig struct {
	// URL is the connection string. Supports "env:VAR_NAME" to read from environment.
	URL string `toml:"url"`

	// PoolSize is the maximum number of connections. Default: 20
	PoolSize int `toml:"pool_size"`

	// SSLMode for the connection. Default: "prefer"
	SSLMode string `toml:"ssl_mode"`
}

// ShardedConfig holds configuration for sharded PostgreSQL.
type ShardedConfig struct {
	// ShardKey is the field used for sharding (e.g., "org_id").
	ShardKey string `toml:"shard_key"`

	// Shards is the list of shard configurations.
	Shards []ShardConfig `toml:"shards"`

	// AllowCrossShard lists views that can query across all shards.
	AllowCrossShard []string `toml:"allow_cross_shard"`
}

// ShardConfig holds configuration for a single shard.
type ShardConfig struct {
	// Name identifies the shard (e.g., "shard_0").
	Name string `toml:"name"`

	// URL is the connection string for this shard.
	URL string `toml:"url"`

	// Range is the UUID byte range this shard handles [min, max].
	Range [2]int `toml:"range"`
}

// Defaults fills in default values for the config.
func (c *Config) Defaults() {
	if c.Adapter == "" {
		c.Adapter = "embedded"
	}

	if c.Embedded.DataDir == "" {
		c.Embedded.DataDir = ".forge-runtime/data"
	}
	if c.Embedded.Port == 0 {
		c.Embedded.Port = 5432
	}

	if c.Postgres.PoolSize == 0 {
		c.Postgres.PoolSize = 20
	}
	if c.Postgres.SSLMode == "" {
		c.Postgres.SSLMode = "prefer"
	}
}

// New creates a new database based on the configuration.
func New(cfg *Config) (Database, error) {
	cfg.Defaults()

	switch cfg.Adapter {
	case "embedded":
		return NewEmbedded(&cfg.Embedded)
	case "postgres":
		return NewPostgres(&cfg.Postgres)
	case "postgres:sharded":
		return nil, fmt.Errorf("sharded postgres not yet implemented")
	default:
		return nil, fmt.Errorf("unknown database adapter: %s", cfg.Adapter)
	}
}
