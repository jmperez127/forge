package db

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres implements Database using an external PostgreSQL server.
type Postgres struct {
	config *PostgresConfig
	pool   *pgxpool.Pool
	userID *uuid.UUID // For RLS context
}

// NewPostgres creates a new Postgres database adapter.
func NewPostgres(config *PostgresConfig) (*Postgres, error) {
	return &Postgres{
		config: config,
	}, nil
}

// Connect establishes the connection pool to PostgreSQL.
func (p *Postgres) Connect(ctx context.Context) error {
	url := resolveEnvValue(p.config.URL)
	if url == "" {
		return fmt.Errorf("database URL is required")
	}

	poolConfig, err := pgxpool.ParseConfig(url)
	if err != nil {
		return fmt.Errorf("failed to parse database URL: %w", err)
	}

	poolConfig.MaxConns = int32(p.config.PoolSize)

	// Set up connection initialization for RLS
	poolConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		// Enable application name for debugging
		_, err := conn.Exec(ctx, "SET application_name = 'forge-runtime'")
		return err
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return fmt.Errorf("failed to ping database: %w", err)
	}

	p.pool = pool
	return nil
}

// Close closes the connection pool.
func (p *Postgres) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}

// ApplyMigration applies the schema from the artifact.
func (p *Postgres) ApplyMigration(ctx context.Context, migration *Migration) error {
	if migration == nil {
		return nil
	}

	// Execute all migration statements in order
	for _, stmt := range migration.Up {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		if _, err := p.pool.Exec(ctx, stmt); err != nil {
			// Check if error is "already exists" type - that's OK
			if !isAlreadyExistsError(err) {
				return fmt.Errorf("migration failed on statement: %s: %w", truncateSQL(stmt), err)
			}
		}
	}

	return nil
}

// WithUser returns a new Postgres instance scoped to the given user.
func (p *Postgres) WithUser(userID uuid.UUID) Database {
	return &Postgres{
		config: p.config,
		pool:   p.pool,
		userID: &userID,
	}
}

// setUserContext sets the app.user_id session variable for RLS.
func (p *Postgres) setUserContext(ctx context.Context, conn *pgxpool.Conn) error {
	if p.userID == nil {
		return nil
	}
	_, err := conn.Exec(ctx, fmt.Sprintf("SET LOCAL app.user_id = '%s'", p.userID.String()))
	return err
}

// Query executes a SELECT query.
func (p *Postgres) Query(ctx context.Context, query string, args ...any) (Rows, error) {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	// If we have a user context, we need to run in a transaction so SET LOCAL persists
	if p.userID != nil {
		// Begin transaction
		if _, err := conn.Exec(ctx, "BEGIN"); err != nil {
			return nil, err
		}

		// Set user context
		if err := p.setUserContext(ctx, conn); err != nil {
			conn.Exec(ctx, "ROLLBACK")
			return nil, err
		}

		// Execute query
		rows, err := conn.Query(ctx, query, args...)
		if err != nil {
			conn.Exec(ctx, "ROLLBACK")
			return nil, err
		}

		// Collect all rows before committing (needed because rows iterator needs the transaction)
		collectedRows, err := collectRows(rows)
		if err != nil {
			conn.Exec(ctx, "ROLLBACK")
			return nil, err
		}

		// Commit transaction
		if _, err := conn.Exec(ctx, "COMMIT"); err != nil {
			return nil, err
		}

		return collectedRows, nil
	}

	// No user context - direct query
	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	return &pgxRows{rows: rows}, nil
}

// QueryRow executes a SELECT query expecting one row.
func (p *Postgres) QueryRow(ctx context.Context, query string, args ...any) Row {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return &pgxRow{err: err}
	}
	defer conn.Release()

	if err := p.setUserContext(ctx, conn); err != nil {
		return &pgxRow{err: err}
	}

	row := conn.QueryRow(ctx, query, args...)
	return &pgxRow{row: row}
}

// Exec executes a non-SELECT query.
func (p *Postgres) Exec(ctx context.Context, query string, args ...any) (Result, error) {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	// If we have a user context, we need to run in a transaction so SET LOCAL persists
	if p.userID != nil {
		// Begin transaction
		if _, err := conn.Exec(ctx, "BEGIN"); err != nil {
			return nil, err
		}

		// Set user context
		if err := p.setUserContext(ctx, conn); err != nil {
			conn.Exec(ctx, "ROLLBACK")
			return nil, err
		}

		// Execute query
		tag, err := conn.Exec(ctx, query, args...)
		if err != nil {
			conn.Exec(ctx, "ROLLBACK")
			return nil, err
		}

		// Commit transaction
		if _, err := conn.Exec(ctx, "COMMIT"); err != nil {
			return nil, err
		}

		return &pgxResult{rowsAffected: tag.RowsAffected()}, nil
	}

	// No user context - direct query
	tag, err := conn.Exec(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	return &pgxResult{rowsAffected: tag.RowsAffected()}, nil
}

// Begin starts a new transaction.
func (p *Postgres) Begin(ctx context.Context) (Tx, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}

	// Set user context in transaction
	if p.userID != nil {
		if _, err := tx.Exec(ctx, fmt.Sprintf("SET LOCAL app.user_id = '%s'", p.userID.String())); err != nil {
			tx.Rollback(ctx)
			return nil, err
		}
	}

	return &pgxTx{tx: tx}, nil
}

// IsEmbedded returns false for external PostgreSQL.
func (p *Postgres) IsEmbedded() bool {
	return false
}

// collectRows reads all rows from a pgx.Rows into memory.
// This is needed when we need to close the transaction before returning rows.
func collectRows(rows pgx.Rows) (*collectedRows, error) {
	defer rows.Close()

	fieldDescs := rows.FieldDescriptions()
	fields := make([]FieldDescription, len(fieldDescs))
	for i, f := range fieldDescs {
		fields[i] = FieldDescription{Name: string(f.Name)}
	}

	var allValues [][]any
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		allValues = append(allValues, values)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &collectedRows{
		fields:  fields,
		values:  allValues,
		current: -1,
	}, nil
}

// collectedRows holds pre-fetched rows in memory.
type collectedRows struct {
	fields  []FieldDescription
	values  [][]any
	current int
}

func (r *collectedRows) Next() bool {
	r.current++
	return r.current < len(r.values)
}

func (r *collectedRows) Scan(dest ...any) error {
	if r.current < 0 || r.current >= len(r.values) {
		return fmt.Errorf("no current row")
	}
	row := r.values[r.current]
	if len(dest) != len(row) {
		return fmt.Errorf("scan target count mismatch: %d vs %d", len(dest), len(row))
	}
	for i, v := range row {
		// Simple assignment - might need more sophisticated type handling
		switch d := dest[i].(type) {
		case *any:
			*d = v
		default:
			return fmt.Errorf("unsupported scan destination type %T", d)
		}
	}
	return nil
}

func (r *collectedRows) Values() ([]any, error) {
	if r.current < 0 || r.current >= len(r.values) {
		return nil, fmt.Errorf("no current row")
	}
	return r.values[r.current], nil
}

func (r *collectedRows) FieldDescriptions() []FieldDescription {
	return r.fields
}

func (r *collectedRows) Close() error {
	return nil
}

func (r *collectedRows) Err() error {
	return nil
}

// pgxRows wraps pgx.Rows to implement the Rows interface.
type pgxRows struct {
	rows pgx.Rows
}

func (r *pgxRows) Next() bool             { return r.rows.Next() }
func (r *pgxRows) Scan(dest ...any) error { return r.rows.Scan(dest...) }
func (r *pgxRows) Close() error           { r.rows.Close(); return nil }
func (r *pgxRows) Err() error             { return r.rows.Err() }

func (r *pgxRows) Values() ([]any, error) {
	return r.rows.Values()
}

func (r *pgxRows) FieldDescriptions() []FieldDescription {
	pgxFields := r.rows.FieldDescriptions()
	fields := make([]FieldDescription, len(pgxFields))
	for i, f := range pgxFields {
		fields[i] = FieldDescription{Name: string(f.Name)}
	}
	return fields
}

// pgxRow wraps pgx.Row to implement the Row interface.
type pgxRow struct {
	row pgx.Row
	err error
}

func (r *pgxRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	return r.row.Scan(dest...)
}

// pgxResult implements the Result interface.
type pgxResult struct {
	rowsAffected int64
}

func (r *pgxResult) RowsAffected() int64 {
	return r.rowsAffected
}

// pgxTx wraps pgx.Tx to implement the Tx interface.
type pgxTx struct {
	tx pgx.Tx
}

func (t *pgxTx) Query(ctx context.Context, query string, args ...any) (Rows, error) {
	rows, err := t.tx.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return &pgxRows{rows: rows}, nil
}

func (t *pgxTx) QueryRow(ctx context.Context, query string, args ...any) Row {
	return &pgxRow{row: t.tx.QueryRow(ctx, query, args...)}
}

func (t *pgxTx) Exec(ctx context.Context, query string, args ...any) (Result, error) {
	tag, err := t.tx.Exec(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return &pgxResult{rowsAffected: tag.RowsAffected()}, nil
}

func (t *pgxTx) Commit(ctx context.Context) error {
	return t.tx.Commit(ctx)
}

func (t *pgxTx) Rollback(ctx context.Context) error {
	return t.tx.Rollback(ctx)
}

// Helper functions

// resolveEnvValue resolves "env:VAR_NAME" to the actual environment variable value.
func resolveEnvValue(value string) string {
	if strings.HasPrefix(value, "env:") {
		envVar := strings.TrimPrefix(value, "env:")
		return os.Getenv(envVar)
	}
	return value
}

// isAlreadyExistsError checks if the error is a "already exists" type.
func isAlreadyExistsError(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "already exists") ||
		strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "42P07") || // relation already exists
		strings.Contains(msg, "42710")    // duplicate object
}

// truncateSQL truncates a SQL statement for error messages.
func truncateSQL(sql string) string {
	sql = strings.ReplaceAll(sql, "\n", " ")
	if len(sql) > 100 {
		return sql[:100] + "..."
	}
	return sql
}
