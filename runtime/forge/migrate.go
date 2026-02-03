// Package forge provides the public API for the FORGE runtime.
package forge

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/forge-lang/forge/runtime/internal/config"
	"github.com/forge-lang/forge/runtime/internal/db"
)

// MigrationResult contains the result of a migration operation.
type MigrationResult struct {
	Version  string
	Applied  int
	Skipped  int
	Duration time.Duration
	Error    error
}

// MigrationConfig holds configuration for migration operations.
type MigrationConfig struct {
	ArtifactPath string
	ProjectDir   string
	DatabaseURL  string // Optional override
	DryRun       bool   // If true, show what would be done without applying
	Verbose      bool   // If true, log each statement
}

// ApplyMigration loads the artifact and applies migrations to the database.
func ApplyMigration(cfg *MigrationConfig) (*MigrationResult, error) {
	start := time.Now()
	result := &MigrationResult{}

	// Load artifact
	artifactData, err := os.ReadFile(cfg.ArtifactPath)
	if err != nil {
		result.Error = fmt.Errorf("failed to load artifact: %w", err)
		return result, result.Error
	}

	var artifact struct {
		Migration *db.Migration `json:"migration"`
	}
	if err := json.Unmarshal(artifactData, &artifact); err != nil {
		result.Error = fmt.Errorf("failed to parse artifact: %w", err)
		return result, result.Error
	}

	if artifact.Migration == nil {
		return result, nil // No migrations to apply
	}

	result.Version = artifact.Migration.Version

	// If dry run, just return the plan
	if cfg.DryRun {
		result.Applied = len(artifact.Migration.Up)
		return result, nil
	}

	// Load runtime configuration
	runtimeConf, err := config.Load(cfg.ProjectDir)
	if err != nil {
		runtimeConf = config.LoadFromEnv()
	}

	// Override database URL if provided
	if cfg.DatabaseURL != "" {
		runtimeConf.Database.Adapter = "postgres"
		runtimeConf.Database.Postgres.URL = cfg.DatabaseURL
	}

	// Resolve secrets from environment
	runtimeConf.ResolveSecrets()

	// Create database connection
	database, err := db.New(&runtimeConf.Database)
	if err != nil {
		result.Error = fmt.Errorf("failed to create database: %w", err)
		return result, result.Error
	}

	// Connect to database
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := database.Connect(ctx); err != nil {
		result.Error = fmt.Errorf("failed to connect to database: %w", err)
		return result, result.Error
	}
	defer database.Close()

	// Setup logger
	logLevel := slog.LevelInfo
	if cfg.Verbose {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))

	// Apply migration
	migrationResult, err := db.ApplyMigrationWithLog(ctx, database, artifact.Migration, logger)
	if err != nil {
		result.Error = fmt.Errorf("migration failed: %w", err)
		return result, result.Error
	}

	result.Applied = migrationResult.Applied
	result.Skipped = migrationResult.Skipped
	result.Duration = time.Since(start)

	return result, nil
}

// GetMigrationStatus returns information about the current migration state.
type MigrationStatus struct {
	ArtifactVersion    string
	PendingStatements  int
	AppliedVersions    []string
	HasPendingChanges  bool
	DangerousChanges   []DangerousChange
}

type DangerousChange struct {
	Statement string
	Reason    string
}

// CheckMigration checks the migration status without applying changes.
func CheckMigration(cfg *MigrationConfig) (*MigrationStatus, error) {
	status := &MigrationStatus{}

	// Load artifact
	artifactData, err := os.ReadFile(cfg.ArtifactPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load artifact: %w", err)
	}

	var artifact struct {
		Migration *db.Migration `json:"migration"`
	}
	if err := json.Unmarshal(artifactData, &artifact); err != nil {
		return nil, fmt.Errorf("failed to parse artifact: %w", err)
	}

	if artifact.Migration == nil {
		return status, nil
	}

	status.ArtifactVersion = artifact.Migration.Version
	status.PendingStatements = len(artifact.Migration.Up)
	status.HasPendingChanges = len(artifact.Migration.Up) > 0

	// Check for dangerous changes
	dangerous := db.ValidateMigration(artifact.Migration)
	for _, d := range dangerous {
		status.DangerousChanges = append(status.DangerousChanges, DangerousChange{
			Statement: d.Statement,
			Reason:    d.Reason,
		})
	}

	return status, nil
}
