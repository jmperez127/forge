package db

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

// MigrationResult represents the result of a migration operation.
type MigrationResult struct {
	Applied    int
	Skipped    int
	Statements []StatementResult
}

// StatementResult represents the result of a single migration statement.
type StatementResult struct {
	Statement string
	Applied   bool
	Error     error
}

// ApplyMigrationWithLog applies migration and logs progress.
func ApplyMigrationWithLog(ctx context.Context, db Database, migration *Migration, logger *slog.Logger) (*MigrationResult, error) {
	if migration == nil {
		return &MigrationResult{}, nil
	}

	result := &MigrationResult{
		Statements: make([]StatementResult, 0, len(migration.Up)),
	}

	logger.Info("applying migration", "version", migration.Version, "statements", len(migration.Up))

	for i, stmt := range migration.Up {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" || strings.HasPrefix(stmt, "--") {
			continue
		}

		stmtResult := StatementResult{
			Statement: truncateSQL(stmt),
		}

		_, err := db.Exec(ctx, stmt)
		if err != nil {
			// Check if it's an "already exists" error - that's OK
			if isAlreadyExistsError(err) {
				stmtResult.Applied = false
				result.Skipped++
				logger.Debug("skipped (already exists)", "statement", i+1)
			} else {
				stmtResult.Error = err
				result.Statements = append(result.Statements, stmtResult)
				return result, fmt.Errorf("migration statement %d failed: %w", i+1, err)
			}
		} else {
			stmtResult.Applied = true
			result.Applied++
			logger.Debug("applied", "statement", i+1)
		}

		result.Statements = append(result.Statements, stmtResult)
	}

	logger.Info("migration complete", "applied", result.Applied, "skipped", result.Skipped)
	return result, nil
}

// ValidateMigration checks if migration would be safe to apply.
// Returns list of dangerous changes that require acknowledgment.
type DangerousChange struct {
	Statement string
	Reason    string
}

func ValidateMigration(migration *Migration) []DangerousChange {
	if migration == nil {
		return nil
	}

	var dangerous []DangerousChange

	for _, stmt := range migration.Up {
		stmt = strings.ToUpper(strings.TrimSpace(stmt))
		if stmt == "" {
			continue
		}

		// Check for dangerous operations
		if strings.HasPrefix(stmt, "DROP TABLE") {
			dangerous = append(dangerous, DangerousChange{
				Statement: truncateSQL(stmt),
				Reason:    "drops table and all data",
			})
		}

		if strings.HasPrefix(stmt, "DROP COLUMN") || strings.Contains(stmt, "DROP COLUMN") {
			dangerous = append(dangerous, DangerousChange{
				Statement: truncateSQL(stmt),
				Reason:    "drops column and all data",
			})
		}

		if strings.HasPrefix(stmt, "ALTER") && strings.Contains(stmt, "TYPE") {
			dangerous = append(dangerous, DangerousChange{
				Statement: truncateSQL(stmt),
				Reason:    "changes column type (may lose data)",
			})
		}

		if strings.HasPrefix(stmt, "TRUNCATE") {
			dangerous = append(dangerous, DangerousChange{
				Statement: truncateSQL(stmt),
				Reason:    "deletes all data from table",
			})
		}
	}

	return dangerous
}

// CreateMigrationTable ensures the migration tracking table exists.
func CreateMigrationTable(ctx context.Context, db Database) error {
	_, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS _forge_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

// GetAppliedMigrations returns list of already applied migration versions.
func GetAppliedMigrations(ctx context.Context, db Database) ([]string, error) {
	rows, err := db.Query(ctx, "SELECT version FROM _forge_migrations ORDER BY applied_at")
	if err != nil {
		// Table might not exist yet
		if strings.Contains(err.Error(), "does not exist") {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()

	var versions []string
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}

	return versions, rows.Err()
}

// RecordMigration records that a migration version was applied.
func RecordMigration(ctx context.Context, db Database, version string) error {
	_, err := db.Exec(ctx, "INSERT INTO _forge_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING", version)
	return err
}
