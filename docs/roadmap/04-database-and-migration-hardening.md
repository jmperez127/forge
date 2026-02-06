# 04 - Database & Migration Hardening

> **Status**: Planning
> **Priority**: Critical
> **Author**: Principal Engineering Review
> **Last Updated**: 2026-02-05

---

## 1. Current State Assessment

### 1.1 What Works

**Database abstraction layer** (`runtime/internal/db/db.go`):
- Clean `Database` interface with `Connect`, `Close`, `Query`, `QueryRow`, `Exec`, `Begin`.
- Adapter pattern: `New(cfg)` dispatches to `NewEmbedded` or `NewPostgres` based on config.
- `WithUser(userID)` scopes queries with `SET LOCAL app.user_id` for RLS context.
- Connection pooling via `pgxpool` with configurable `PoolSize` and `SSLMode`.

**SQL generation** (`compiler/internal/emitter/emitter.go`):
- Emits `CREATE TABLE IF NOT EXISTS`, `CREATE TYPE ... AS ENUM`, `CREATE INDEX IF NOT EXISTS`.
- Generates RLS policies (`CREATE POLICY ... USING ... WITH CHECK`), `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Generates `updated_at` triggers with a helper plpgsql function.
- Topological sort of tables by foreign key dependencies for correct creation order.

**Migration tracking table** (`runtime/internal/db/migrate.go`):
- `_forge_migrations` table with `version TEXT PRIMARY KEY` and `applied_at TIMESTAMPTZ`.
- `CreateMigrationTable`, `GetAppliedMigrations`, `RecordMigration` functions exist.
- `ValidateMigration` detects dangerous changes (DROP TABLE, DROP COLUMN, type changes, TRUNCATE).
- `ApplyMigrationWithLog` applies statements sequentially, skips "already exists" errors.

**Runtime configuration** (`runtime/internal/config/config.go`):
- TOML-based config with `env:` prefix resolution for secrets.
- Environment-specific overrides (`[environments.production]`).
- Defaults to embedded Postgres in development.

### 1.2 What Is Broken

**Embedded Postgres is unreliable**:
- Uses `github.com/fergusstrange/embedded-postgres` v1.25.0, which downloads and unpacks a PostgreSQL binary per data directory.
- Hard-codes port 5432 by default. If any other Postgres (system or another FORGE dev server) is on 5432, startup fails with a port conflict. No automatic port selection.
- The `.forge-runtime/data/` directory contains a full PostgreSQL installation (~200MB). It persists between runs. If the process is killed (SIGKILL, OOM, power loss), the embedded Postgres leaves behind a `postmaster.pid` lock file. Next startup fails with "server is already running" until the user manually deletes the lock file.
- Cleanup on `Close()` calls `e.postgres.Stop()` which may hang or fail silently, leaving orphan `postgres` processes.
- Ephemeral mode uses `os.MkdirTemp` but `os.RemoveAll` on the temp directory can fail on macOS if files are still open.
- 60-second start timeout is often not enough on cold start (first binary download).

**Migration system is fragile**:
- `_forge_migrations` table exists but is **never actually used in the main code path**. The `ApplyMigration` method on `Postgres` (line 73-92 of `postgres.go`) just executes statements and swallows "already exists" errors. It never checks `_forge_migrations`, never calls `RecordMigration`, and never calls `CreateMigrationTable`.
- The public API in `runtime/forge/migrate.go` calls `db.ApplyMigrationWithLog` which also just runs statements and counts applied/skipped -- no tracking table interaction.
- `CheckMigration` reads the artifact and counts statements but never connects to the database to compare actual state.
- The migration `Version` is always hard-coded to `"001"` in the planner (`planner.go` line 312). There is no versioning scheme.
- No support for incremental migrations. Every build produces the full schema DDL. Running `forge migrate -apply` re-executes the entire schema, relying on `IF NOT EXISTS` and "already exists" error suppression to be idempotent.
- No schema diffing. If you remove a field from the `.forge` spec, the corresponding column is never dropped from the database. If you rename a field, both the old and new columns exist.

**RLS policies are generated but have issues**:
- Policies are emitted with `CREATE POLICY` (no `IF NOT EXISTS`). Re-running migration fails with "policy already exists" -- this is caught by the "already exists" error suppression, but it means policies are never updated when access rules change.
- No `DROP POLICY IF EXISTS` before `CREATE POLICY` to handle updates.
- The runtime server (line 249-263 of `server.go`) applies migration on every startup, re-running the entire schema. Changed policies are silently skipped because they "already exist."

**Test infrastructure is ad-hoc**:
- E2E tests use the embedded Postgres that ships with the runtime. No testcontainers.
- The E2E `db.ts` fixture creates test data through HTTP API, which is good for integration testing but means there is no way to test database-level behavior (RLS, constraints, triggers) directly.
- No unit tests for the `db` package itself. No tests for migration logic.

### 1.3 What Is Missing

- **Schema diffing**: Compare desired schema (from artifact) against actual database schema, generate ALTER statements.
- **Migration history**: Ordered, versioned migration files. Currently the artifact embeds a single monolithic migration.
- **Down migrations**: `Down` array is generated but never used by any code path.
- **Connection health checks**: No periodic ping, no reconnection logic, no circuit breaker.
- **Connection pool monitoring**: No metrics on pool utilization, wait times, or connection errors.
- **Schema validation on startup**: No check that the database schema matches the artifact. The runtime assumes migration succeeded.
- **Seed data**: No mechanism for development seed data.
- **Backup before migration**: No advisory or automatic backup.
- **SSL/TLS for production**: Config supports `ssl_mode` but no certificate path configuration.
- **Statement-level transactions in migrations**: Statements execute one at a time outside a transaction. A failure mid-migration leaves the schema in a partial state.
- **Advisory locks**: No migration locking. Two instances starting simultaneously both attempt migration.

---

## 2. Architecture Decisions

### 2.1 Drop Embedded Postgres vs Fix It

**Recommendation: Replace embedded Postgres with Docker-based PostgreSQL for development, keep embedded as optional fallback.**

| Approach | Pros | Cons |
|----------|------|------|
| Fix embedded Postgres | Zero external deps, works offline | Port conflicts, orphan processes, 200MB data dirs, binary download flakiness, macOS ARM issues, impossible to fully fix cleanup |
| Docker-based dev Postgres | Reliable startup/shutdown, port isolation, matches production, easy cleanup (`docker rm -f`), health checks built in | Requires Docker Desktop (most devs have it), slightly slower cold start |
| Both (Docker preferred, embedded fallback) | Best of both worlds | More code to maintain |

**Decision**: Docker-first with embedded as opt-in fallback.

Rationale: At Meta scale, we learned that test infrastructure that "mostly works" is worse than infrastructure that reliably fails. Embedded Postgres has at least four known failure modes (port conflict, orphan process, stale lockfile, download failure) that produce confusing errors. Docker provides process isolation, reliable cleanup, and port allocation. The `forge dev` command should check for Docker, start a container, and provide clear instructions if Docker is not available.

### 2.2 Migration Strategy: Forward-Only

**Recommendation: Forward-only migrations with explicit safety checks.**

| Approach | Pros | Cons |
|----------|------|------|
| Up/Down | Rollback capability | Down migrations are rarely tested, often wrong, give false confidence |
| Forward-only | Simpler, safer, forces backward-compatible changes | No automatic rollback (must deploy forward or restore from backup) |

**Decision**: Forward-only.

Rationale: Down migrations are a lie at scale. They are never tested in production conditions, they assume data can be un-transformed (it cannot), and they create a false sense of safety. Instead: make all migrations backward-compatible, deploy the new code, then run a cleanup migration to remove old columns/types. FORGE should warn on destructive changes and require explicit `--allow-destructive` flag.

The existing `Down` arrays in the migration schema should be retained for documentation purposes (they show what was created) but the runtime should never execute them automatically.

### 2.3 Connection Pooling Approach

**Recommendation: Use pgxpool with tuned defaults, add health checking, expose metrics.**

Current state uses `pgxpool` correctly but with minimal configuration. The hardening plan:

- Default `MaxConns` = 20 (current), `MinConns` = 2 (new), `MaxConnLifetime` = 1 hour (new), `MaxConnIdleTime` = 30 minutes (new).
- `HealthCheckPeriod` = 30 seconds using pgxpool's built-in health check.
- Connection acquire timeout = 5 seconds (currently unbounded).
- Expose pool stats at `/_dev/database` (already exists as an endpoint, needs pool metrics).

---

## 3. Implementation Plan

Ordered by dependency and risk. Each TODO is a discrete, testable unit of work.

### Phase 1: Foundation (Week 1-2)

- [ ] **3.1 Add migration state tracking to the actual code path**

  The `_forge_migrations` table, `CreateMigrationTable`, `GetAppliedMigrations`, and `RecordMigration` functions exist in `migrate.go` but are never called from the server startup or the `forge migrate` CLI. Wire them in.

  **Files**: `runtime/internal/server/server.go`, `runtime/forge/migrate.go`, `runtime/internal/db/migrate.go`

  ```go
  // In server.go New(), replace the direct ApplyMigrationWithLog call:

  // Ensure migration tracking table exists
  if err := db.CreateMigrationTable(ctx, database); err != nil {
      database.Close()
      return nil, fmt.Errorf("failed to create migration table: %w", err)
  }

  // Check if this migration version has already been applied
  applied, err := db.GetAppliedMigrations(ctx, database)
  if err != nil {
      database.Close()
      return nil, fmt.Errorf("failed to check applied migrations: %w", err)
  }

  if artifact.Migration != nil && !contains(applied, artifact.Migration.Version) {
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

      // Record successful migration
      if err := db.RecordMigration(ctx, database, artifact.Migration.Version); err != nil {
          logger.Warn("failed to record migration", "error", err)
      }

      logger.Info("schema ready", "applied", result.Applied, "skipped", result.Skipped)
  } else {
      logger.Info("schema up to date", "version", artifact.Migration.Version)
  }
  ```

- [ ] **3.2 Add advisory lock for migration safety**

  Prevent two runtime instances from applying migrations concurrently.

  **File**: `runtime/internal/db/migrate.go`

  ```go
  const migrationLockID int64 = 0x464F5247454D4947 // "FORGEMIG" as int64

  // AcquireMigrationLock acquires a PostgreSQL advisory lock for migrations.
  // Returns a release function. Blocks until the lock is acquired or context is cancelled.
  func AcquireMigrationLock(ctx context.Context, db Database) (release func(), err error) {
      _, err = db.Exec(ctx, "SELECT pg_advisory_lock($1)", migrationLockID)
      if err != nil {
          return nil, fmt.Errorf("failed to acquire migration lock: %w", err)
      }
      return func() {
          ctx := context.Background()
          db.Exec(ctx, "SELECT pg_advisory_unlock($1)", migrationLockID)
      }, nil
  }
  ```

- [ ] **3.3 Wrap migration in a transaction**

  All migration statements should run in a single transaction so a failure mid-migration rolls back completely.

  **File**: `runtime/internal/db/migrate.go`

  ```go
  // ApplyMigrationInTx applies all migration statements within a single transaction.
  func ApplyMigrationInTx(ctx context.Context, database Database, migration *Migration, logger *slog.Logger) (*MigrationResult, error) {
      if migration == nil {
          return &MigrationResult{}, nil
      }

      result := &MigrationResult{
          Statements: make([]StatementResult, 0, len(migration.Up)),
      }

      tx, err := database.Begin(ctx)
      if err != nil {
          return nil, fmt.Errorf("failed to begin migration transaction: %w", err)
      }
      defer tx.Rollback(ctx) // No-op if committed

      logger.Info("applying migration", "version", migration.Version, "statements", len(migration.Up))

      for i, stmt := range migration.Up {
          stmt = strings.TrimSpace(stmt)
          if stmt == "" || strings.HasPrefix(stmt, "--") {
              continue
          }

          stmtResult := StatementResult{Statement: truncateSQL(stmt)}

          _, err := tx.Exec(ctx, stmt)
          if err != nil {
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

      if err := tx.Commit(ctx); err != nil {
          return result, fmt.Errorf("failed to commit migration: %w", err)
      }

      logger.Info("migration complete", "applied", result.Applied, "skipped", result.Skipped)
      return result, nil
  }
  ```

- [ ] **3.4 Fix migration version generation**

  Replace the hard-coded `"001"` version in the planner with a content-addressable hash of the schema.

  **File**: `compiler/internal/planner/planner.go`

  ```go
  import "crypto/sha256"

  func (p *Planner) planMigration(plan *Plan) {
      migration := &MigrationPlan{
          // Version is computed after all statements are generated
      }
      // ... existing code to build statements ...

      // Compute version from schema content
      h := sha256.New()
      for _, t := range migration.CreateTables {
          h.Write([]byte(t.Name))
          for _, c := range t.Columns {
              h.Write([]byte(c.Name + c.Type))
          }
      }
      for _, ct := range migration.CreateTypes {
          h.Write([]byte(ct.Name + strings.Join(ct.Values, ",")))
      }
      migration.Version = fmt.Sprintf("%x", h.Sum(nil))[:12]

      plan.Migration = migration
  }
  ```

  This means the version only changes when the schema actually changes, so re-running `forge build` without spec changes produces the same version, and migration tracking correctly skips it.

### Phase 2: Dev Infrastructure (Week 3-4)

- [ ] **3.5 Docker-based dev PostgreSQL**

  Add a `DevPostgres` adapter that manages a Docker container.

  **New file**: `runtime/internal/db/devpostgres.go`

  ```go
  package db

  import (
      "context"
      "fmt"
      "net"
      "os/exec"
      "time"
  )

  const (
      devContainerPrefix = "forge-dev-"
      devPostgresImage   = "postgres:16-alpine"
      devUser            = "forge"
      devPassword        = "forge"
      devDatabase        = "forge"
  )

  // DevPostgres manages a Docker-based PostgreSQL container for development.
  type DevPostgres struct {
      config        *EmbeddedConfig
      containerName string
      port          int
      inner         *Postgres
  }

  // NewDevPostgres creates a new Docker-based dev PostgreSQL adapter.
  func NewDevPostgres(config *EmbeddedConfig) (*DevPostgres, error) {
      return &DevPostgres{
          config: config,
      }, nil
  }

  // Connect starts or reuses a Docker PostgreSQL container.
  func (d *DevPostgres) Connect(ctx context.Context) error {
      d.containerName = devContainerPrefix + sanitizeName(d.config.DataDir)

      // Find an available port
      port := d.config.Port
      if port == 0 || !isPortAvailable(port) {
          var err error
          port, err = findAvailablePort()
          if err != nil {
              return fmt.Errorf("failed to find available port: %w", err)
          }
      }
      d.port = port

      // Check if container already exists and is running
      if d.isContainerRunning(ctx) {
          // Reuse existing container
      } else {
          // Remove stale container if it exists but is stopped
          d.removeContainer(ctx)

          // Start new container
          args := []string{
              "run", "-d",
              "--name", d.containerName,
              "-p", fmt.Sprintf("%d:5432", d.port),
              "-e", "POSTGRES_USER=" + devUser,
              "-e", "POSTGRES_PASSWORD=" + devPassword,
              "-e", "POSTGRES_DB=" + devDatabase,
          }

          // Mount data directory for persistence (non-ephemeral mode)
          if !d.config.Ephemeral {
              args = append(args, "-v", fmt.Sprintf("%s:/var/lib/postgresql/data", d.config.DataDir))
          }

          args = append(args, devPostgresImage)

          cmd := exec.CommandContext(ctx, "docker", args...)
          if output, err := cmd.CombinedOutput(); err != nil {
              return fmt.Errorf("failed to start postgres container: %w\n%s", err, output)
          }
      }

      // Wait for PostgreSQL to be ready
      if err := d.waitForReady(ctx); err != nil {
          return fmt.Errorf("postgres container not ready: %w", err)
      }

      // Connect inner Postgres adapter
      innerConfig := &PostgresConfig{
          URL:      fmt.Sprintf("postgres://%s:%s@localhost:%d/%s?sslmode=disable", devUser, devPassword, d.port, devDatabase),
          PoolSize: 10,
      }

      inner, err := NewPostgres(innerConfig)
      if err != nil {
          return err
      }
      if err := inner.Connect(ctx); err != nil {
          return err
      }

      d.inner = inner
      return nil
  }

  func isPortAvailable(port int) bool {
      ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
      if err != nil {
          return false
      }
      ln.Close()
      return true
  }

  func findAvailablePort() (int, error) {
      ln, err := net.Listen("tcp", ":0")
      if err != nil {
          return 0, err
      }
      defer ln.Close()
      return ln.Addr().(*net.TCPAddr).Port, nil
  }
  ```

- [ ] **3.6 Stale lockfile detection and recovery for embedded Postgres**

  For users who still use embedded Postgres, detect and recover from stale lockfiles.

  **File**: `runtime/internal/db/embedded.go`

  Add pre-flight check before `e.postgres.Start()`:

  ```go
  func (e *Embedded) cleanStaleLockfile() error {
      pidFile := filepath.Join(e.dataDir, "pgdata", "postmaster.pid")
      data, err := os.ReadFile(pidFile)
      if os.IsNotExist(err) {
          return nil // No lockfile, nothing to clean
      }
      if err != nil {
          return err
      }

      // First line of postmaster.pid is the PID
      lines := strings.Split(string(data), "\n")
      if len(lines) == 0 {
          return nil
      }

      pid, err := strconv.Atoi(strings.TrimSpace(lines[0]))
      if err != nil {
          // Corrupt PID file, remove it
          return os.Remove(pidFile)
      }

      // Check if the process is still running
      process, err := os.FindProcess(pid)
      if err != nil {
          return os.Remove(pidFile)
      }

      // On Unix, FindProcess always succeeds. Use Signal(0) to check.
      if err := process.Signal(syscall.Signal(0)); err != nil {
          // Process is dead, remove stale lockfile
          return os.Remove(pidFile)
      }

      // Process is alive -- genuine conflict
      return fmt.Errorf("PostgreSQL is already running (PID %d). Stop it or use a different port", pid)
  }
  ```

- [ ] **3.7 Automatic port selection for embedded Postgres**

  If the configured port is in use, automatically find an available one.

  **File**: `runtime/internal/db/embedded.go`

  ```go
  func (e *Embedded) Connect(ctx context.Context) error {
      // ... existing setup ...

      // Check port availability, find alternative if needed
      if !isPortAvailable(e.config.Port) {
          altPort, err := findAvailablePort()
          if err != nil {
              return fmt.Errorf("port %d in use and no alternative available: %w", e.config.Port, err)
          }
          slog.Default().Warn("port in use, using alternative",
              "configured", e.config.Port,
              "actual", altPort,
          )
          e.config.Port = altPort
      }

      // ... rest of Connect ...
  }
  ```

- [ ] **3.8 Testcontainers for reliable integration tests**

  Replace embedded Postgres in tests with testcontainers-go.

  **New file**: `runtime/internal/db/testdb.go`

  ```go
  //go:build integration

  package db

  import (
      "context"
      "testing"
      "time"

      "github.com/testcontainers/testcontainers-go"
      "github.com/testcontainers/testcontainers-go/modules/postgres"
      "github.com/testcontainers/testcontainers-go/wait"
  )

  // TestDatabase creates a throwaway PostgreSQL container for testing.
  // It returns a connected Database and a cleanup function.
  func TestDatabase(t *testing.T) (Database, func()) {
      t.Helper()
      ctx := context.Background()

      container, err := postgres.Run(ctx,
          "postgres:16-alpine",
          postgres.WithDatabase("forge_test"),
          postgres.WithUsername("forge"),
          postgres.WithPassword("forge"),
          testcontainers.WithWaitStrategy(
              wait.ForLog("database system is ready to accept connections").
                  WithOccurrence(2).
                  WithStartupTimeout(60*time.Second),
          ),
      )
      if err != nil {
          t.Fatalf("failed to start test postgres: %v", err)
      }

      connStr, err := container.ConnectionString(ctx, "sslmode=disable")
      if err != nil {
          container.Terminate(ctx)
          t.Fatalf("failed to get connection string: %v", err)
      }

      db, err := NewPostgres(&PostgresConfig{
          URL:      connStr,
          PoolSize: 5,
      })
      if err != nil {
          container.Terminate(ctx)
          t.Fatalf("failed to create postgres adapter: %v", err)
      }

      if err := db.Connect(ctx); err != nil {
          container.Terminate(ctx)
          t.Fatalf("failed to connect: %v", err)
      }

      cleanup := func() {
          db.Close()
          container.Terminate(context.Background())
      }

      return db, cleanup
  }
  ```

  Add `github.com/testcontainers/testcontainers-go` to `runtime/go.mod`.

### Phase 3: Schema Diffing & Incremental Migrations (Week 5-7)

- [ ] **3.9 Schema introspection from live database**

  Query `information_schema` and `pg_catalog` to build a snapshot of the current database schema.

  **New file**: `runtime/internal/db/introspect.go`

  ```go
  package db

  import "context"

  // SchemaSnapshot represents the current state of the database schema.
  type SchemaSnapshot struct {
      Tables   map[string]*TableSnapshot
      Types    map[string]*TypeSnapshot
      Indexes  map[string]*IndexSnapshot
      Policies map[string]*PolicySnapshot
  }

  type TableSnapshot struct {
      Name    string
      Columns map[string]*ColumnSnapshot
  }

  type ColumnSnapshot struct {
      Name     string
      Type     string
      Nullable bool
      Default  string
      HasFK    bool
      FKTable  string
      FKColumn string
  }

  type TypeSnapshot struct {
      Name   string
      Kind   string   // "enum"
      Values []string // For enums
  }

  type IndexSnapshot struct {
      Name    string
      Table   string
      Columns []string
      Unique  bool
  }

  type PolicySnapshot struct {
      Name      string
      Table     string
      Command   string
      Using     string
      WithCheck string
  }

  // IntrospectSchema queries the database and returns the current schema state.
  func IntrospectSchema(ctx context.Context, db Database) (*SchemaSnapshot, error) {
      snap := &SchemaSnapshot{
          Tables:   make(map[string]*TableSnapshot),
          Types:    make(map[string]*TypeSnapshot),
          Indexes:  make(map[string]*IndexSnapshot),
          Policies: make(map[string]*PolicySnapshot),
      }

      // Query tables and columns from information_schema
      // Query enum types from pg_type + pg_enum
      // Query indexes from pg_indexes
      // Query RLS policies from pg_policy
      // (full implementation in section 3.9 above)

      return snap, nil
  }
  ```

- [ ] **3.10 Schema diff engine**

  Compare a desired schema against a `SchemaSnapshot` and generate ALTER statements.

  **New file**: `runtime/internal/db/diff.go`

- [ ] **3.11 RLS policy update-in-place**

  Policies cannot be altered in PostgreSQL. They must be dropped and recreated. Change the emitter to generate `DROP POLICY IF EXISTS` before every `CREATE POLICY`.

  **File**: `compiler/internal/emitter/emitter.go`, in `generateMigrationSchema()`.

- [ ] **3.12 Index generation from view definitions**

  If a view traverses a relation (dot-path field), ensure the FK column is indexed.

  **File**: `compiler/internal/planner/planner.go`

### Phase 4: Connection Reliability (Week 8-9)

- [ ] **3.13 Connection pool tuning**

  Add `MinConns`, `MaxConnLifetime`, `MaxConnIdleTime`, `HealthCheckPeriod`, and `ConnectTimeout` to the pool configuration.

  **File**: `runtime/internal/db/postgres.go`

- [ ] **3.14 Health check endpoint with database probe**

  Enhance `/health` to return database connectivity status. Return HTTP 503 if the database is unreachable.

  **File**: `runtime/internal/server/server.go`

- [ ] **3.15 Schema validation on startup**

  After migration, introspect the database and verify all expected tables exist.

  **New file**: `runtime/internal/db/validate.go`

- [ ] **3.16 Connection string parsing and SSL/TLS configuration**

  Add `SSLCert`, `SSLKey`, `SSLRootCA` fields to `PostgresConfig`. Validate URL format before connecting.

  **Files**: `runtime/internal/db/db.go`, `runtime/internal/db/postgres.go`

### Phase 5: Dev Experience (Week 10)

- [ ] **3.17 Seed data support for development**

  Add `forge seed` command. Convention: `seed.sql` in project root, applied after migration when database is empty.

  **File**: `runtime/cmd/forge/main.go`

- [ ] **3.18 Expose pool stats at /_dev/database**

  Return connection pool metrics, applied migration versions, and table list from the dev info endpoint.

---

## 4. Migration File Format

### 4.1 Versioning Scheme

Migrations use a **content-addressable hash** of the schema definition, not sequential numbers:

- Building the same `.forge` spec twice produces the same version.
- Changing any entity, field, relation, or access rule produces a new version.
- The version is the first 12 hex characters of the SHA-256 hash of the normalized schema.

Example version: `a1b2c3d4e5f6`

### 4.2 Migration Tracking Table

```sql
CREATE TABLE IF NOT EXISTS _forge_migrations (
    id          SERIAL PRIMARY KEY,
    version     TEXT NOT NULL UNIQUE,
    app_name    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by  TEXT NOT NULL DEFAULT current_user,
    duration_ms INTEGER,
    statements  INTEGER,
    checksum    TEXT NOT NULL  -- SHA-256 of the migration content
);

CREATE INDEX IF NOT EXISTS idx_forge_migrations_version ON _forge_migrations (version);
```

### 4.3 Migration File Structure

The artifact embeds the migration in `artifact.json`. For auditability, `forge build` also writes individual migration files:

```
.forge-runtime/
  artifact.json
  schema.sql              # Full schema (current snapshot)
  migrations/
    a1b2c3d4e5f6.sql      # Individual migration file
    metadata.json          # Migration metadata
```

**Individual migration file format**:

```sql
-- FORGE Migration: a1b2c3d4e5f6
-- Generated: 2026-02-05T10:30:00Z
-- App: Helpdesk
-- Checksum: sha256:a1b2c3d4e5f6...full hash...
--
-- WARNING: This file is auto-generated. Do not edit manually.
-- To modify the schema, change your .forge files and run `forge build`.

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper functions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enum types
CREATE TYPE tickets_status AS ENUM ('open', 'pending', 'closed');

-- Tables
CREATE TABLE IF NOT EXISTS users (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policies (drop + recreate for idempotency)
DROP POLICY IF EXISTS users_read_policy ON users;
CREATE POLICY users_read_policy ON users FOR SELECT
    USING (current_setting('app.user_id')::uuid = id);

-- Triggers
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
```

### 4.4 Metadata File

```json
{
  "migrations": [
    {
      "version": "a1b2c3d4e5f6",
      "created_at": "2026-02-05T10:30:00Z",
      "checksum": "sha256:a1b2c3d4e5f6789...",
      "statements": 24,
      "entities": ["User", "Ticket", "Comment"],
      "changes": [
        "create_table:users",
        "create_table:tickets",
        "create_index:idx_users_email",
        "create_policy:users_read_policy"
      ]
    }
  ]
}
```

---

## 5. Rollback Strategy

FORGE uses **forward-only migrations**. Rollback is handled through deployment strategy, not schema reversal.

### 5.1 If a Migration Fails Mid-Apply

The migration runs inside a transaction (see 3.3). If any statement fails, the entire migration is rolled back atomically. The `_forge_migrations` table is not updated. The database remains in its previous valid state.

### 5.2 If a Migration Succeeds But the App Has a Bug

1. **Do not attempt to roll back the schema.** Schema rollbacks at scale are more dangerous than the original bug.
2. Deploy the previous version of the application code. The schema should be backward-compatible (see Safe Migration Practices below).
3. Fix the bug and deploy forward.

### 5.3 If You Need to Undo a Schema Change

1. Modify the `.forge` spec to reverse the change.
2. Run `forge build` to generate a new migration that undoes the previous change.
3. Run `forge migrate -apply`.

### 5.4 Safe Migration Practices

All FORGE-generated migrations must follow these rules:

| Operation | Safe? | Notes |
|-----------|-------|-------|
| ADD COLUMN (nullable) | Yes | Old code ignores new columns |
| ADD COLUMN (NOT NULL with default) | Yes | PostgreSQL fills default |
| ADD COLUMN (NOT NULL without default) | **No** | Requires `--allow-destructive` flag |
| DROP COLUMN | **No** | Requires `--allow-destructive`. FORGE should warn and suggest a two-phase approach |
| RENAME COLUMN | **No** | FORGE should add a new column and deprecate the old one |
| ALTER TYPE (widening, e.g. int to bigint) | Yes | Safe cast |
| ALTER TYPE (narrowing) | **No** | Requires `--allow-destructive` |
| ADD ENUM VALUE | Yes | Safe in PostgreSQL 10+ (non-transactional) |
| DROP ENUM VALUE | **No** | Not supported by PostgreSQL |
| CREATE INDEX CONCURRENTLY | Yes | Non-blocking |
| DROP INDEX | Yes | Low risk |
| DROP TABLE | **No** | Requires `--allow-destructive` |

### 5.5 Backup Recommendations

Before applying migrations in production:

```bash
# 1. Take a backup
pg_dump -Fc $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).dump

# 2. Apply migrations
forge migrate -apply -verbose

# 3. Verify
forge migrate  # Should show "No pending migrations"
```

FORGE should print a reminder when `FORGE_ENV=production`:

```
WARNING: You are applying migrations to a production database.
Recommendation: Take a backup before proceeding.
  pg_dump -Fc $DATABASE_URL > backup.dump

Continue? [y/N]
```

---

## 6. Testing Strategy

### 6.1 Unit Tests for Migration Logic

**File**: `runtime/internal/db/migrate_test.go`

Test the migration runner in isolation using a mock `Database` implementation:

- `TestApplyMigrationInTx_Success`: All statements succeed, version recorded.
- `TestApplyMigrationInTx_PartialFailure`: Statement 3 of 5 fails, entire transaction rolled back, version not recorded.
- `TestApplyMigrationInTx_AlreadyApplied`: Version already in `_forge_migrations`, migration skipped entirely.
- `TestApplyMigrationInTx_AlreadyExistsError`: "already exists" errors are skipped, non-"already exists" errors are fatal.
- `TestValidateMigration_DangerousChanges`: DROP TABLE, DROP COLUMN, ALTER TYPE correctly detected.
- `TestAcquireMigrationLock`: Advisory lock prevents concurrent migrations.

### 6.2 Integration Tests with Testcontainers

**File**: `runtime/internal/db/integration_test.go`

```go
//go:build integration

func TestFullMigrationCycle(t *testing.T) {
    db, cleanup := TestDatabase(t)
    defer cleanup()
    ctx := context.Background()

    migration := &Migration{
        Version: "v1",
        Up: []string{
            `CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL)`,
        },
    }

    err := CreateMigrationTable(ctx, db)
    require.NoError(t, err)

    result, err := ApplyMigrationInTx(ctx, db, migration, slog.Default())
    require.NoError(t, err)
    assert.Equal(t, 1, result.Applied)

    err = RecordMigration(ctx, db, "v1")
    require.NoError(t, err)

    // Verify table exists
    row := db.QueryRow(ctx, "SELECT count(*) FROM information_schema.tables WHERE table_name = 'users'")
    var count int
    require.NoError(t, row.Scan(&count))
    assert.Equal(t, 1, count)

    // Re-apply same migration -- should be skipped via version check
    applied, _ := GetAppliedMigrations(ctx, db)
    assert.Contains(t, applied, "v1")
}

func TestRLSPoliciesEnforced(t *testing.T) {
    db, cleanup := TestDatabase(t)
    defer cleanup()
    ctx := context.Background()

    migration := &Migration{
        Version: "v1",
        Up: []string{
            `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
            `CREATE TABLE items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, name text NOT NULL)`,
            `ALTER TABLE items ENABLE ROW LEVEL SECURITY`,
            `CREATE POLICY items_read ON items FOR SELECT USING (current_setting('app.user_id')::uuid = owner_id)`,
        },
    }

    CreateMigrationTable(ctx, db)
    ApplyMigrationInTx(ctx, db, migration, slog.Default())
    RecordMigration(ctx, db, "v1")

    user1 := uuid.New()
    user2 := uuid.New()
    db.Exec(ctx, "INSERT INTO items (owner_id, name) VALUES ($1, 'item1')", user1)
    db.Exec(ctx, "INSERT INTO items (owner_id, name) VALUES ($1, 'item2')", user2)

    // Query as user1 -- should only see item1
    scopedDB := db.WithUser(user1)
    rows, err := scopedDB.Query(ctx, "SELECT name FROM items")
    require.NoError(t, err)
    defer rows.Close()

    var names []string
    for rows.Next() {
        var name string
        rows.Scan(&name)
        names = append(names, name)
    }
    assert.Equal(t, []string{"item1"}, names)
}
```

### 6.3 Schema Diff Tests

**File**: `runtime/internal/db/diff_test.go`

- `TestDiffSchema_NewTable`: Adding a table generates CREATE TABLE.
- `TestDiffSchema_NewColumn`: Adding a column generates ALTER TABLE ADD COLUMN.
- `TestDiffSchema_RemovedColumn`: Removing a column flags a dangerous change.
- `TestDiffSchema_ChangedEnum`: Adding an enum value generates ALTER TYPE ADD VALUE.
- `TestDiffSchema_ChangedPolicy`: Modified access rule generates DROP + CREATE POLICY.
- `TestDiffSchema_NoChanges`: Identical schema produces empty diff.

### 6.4 Compiler Migration Tests

**File**: `compiler/internal/emitter/emitter_test.go`

- Snapshot tests: Generate migration SQL from known `.forge` input, compare against golden files.
- Ensure RLS policies use `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- Ensure enum types use `IF NOT EXISTS`.

### 6.5 E2E Migration Tests

**File**: `e2e/tests/migration.spec.ts`

- Start server, verify schema applied.
- Modify `.forge` file, rebuild, verify `forge migrate` reports pending changes.
- Apply migration, verify new schema works through API.

---

## 7. Verification Checklist

Before this hardening work is considered complete, every item below must be verified:

### Infrastructure
- [ ] `forge dev` starts reliably on a clean machine with Docker installed
- [ ] `forge dev` starts reliably when port 5432 is already in use
- [ ] Killing the `forge dev` process (SIGKILL) and restarting does not leave the database in a broken state
- [ ] Two `forge dev` instances can run simultaneously on different ports
- [ ] Embedded Postgres mode still works as a fallback when Docker is not available

### Migration System
- [ ] `forge migrate` shows pending migration status without applying
- [ ] `forge migrate -apply` applies the migration and records it in `_forge_migrations`
- [ ] `forge migrate -apply` on an already-applied version is a no-op
- [ ] `forge migrate -apply -dry-run` shows what would happen without modifying the database
- [ ] `forge migrate -apply -verbose` logs each statement
- [ ] Failed migration rolls back completely (no partial schema state)
- [ ] Two servers starting simultaneously do not corrupt the schema (advisory lock)
- [ ] Dangerous changes (DROP TABLE, DROP COLUMN) require `--allow-destructive` flag
- [ ] Production migration prompts for backup confirmation

### RLS Policies
- [ ] RLS policies are correctly applied during migration
- [ ] Changed access rules produce updated policies (drop + recreate)
- [ ] RLS is enforced: user A cannot read user B's data
- [ ] RLS is enforced: user A cannot write user B's data
- [ ] Superuser/migration operations bypass RLS correctly

### Schema Integrity
- [ ] Schema validation on startup catches missing tables
- [ ] Schema validation on startup catches missing columns
- [ ] Schema drift (manual DB changes) is detected and reported
- [ ] Content-addressable migration versions change only when schema changes
- [ ] Rebuilding without spec changes produces the same migration version

### Connection Reliability
- [ ] Connection pool respects configured limits
- [ ] Idle connections are cleaned up after 30 minutes
- [ ] `/health` endpoint reports database connectivity status
- [ ] Pool stats are visible at `/_dev/database`
- [ ] Connection failure during request returns a useful error, not a panic

### Test Infrastructure
- [ ] `go test ./internal/db/...` passes with testcontainers
- [ ] Integration tests do not leave orphan Docker containers
- [ ] Each test gets its own isolated database
- [ ] Tests complete in under 60 seconds (parallel containers)

---

## Appendix A: `forge migrate` End-to-End Flow

```
$ forge migrate

1. Load artifact.json from .forge-runtime/
2. Parse migration from artifact
3. Connect to database (using forge.runtime.toml or DATABASE_URL)
4. Ensure _forge_migrations table exists
5. Query applied migrations
6. Compare artifact migration version against applied versions
7. If already applied:
     Print "No pending migrations."
     Exit 0
8. If pending:
     Print migration version, statement count
     Check for dangerous changes, print warnings
     Exit 0 (status only, no apply)

$ forge migrate -apply

1-6. Same as above
7. If already applied:
     Print "No pending migrations."
     Exit 0
8. If pending:
     a. If FORGE_ENV=production, print backup reminder
     b. Check for dangerous changes
        - If dangerous and no --allow-destructive: print error, exit 1
     c. Acquire advisory lock (pg_advisory_lock)
     d. BEGIN transaction
     e. Execute each statement
        - Log progress (statement N of M)
        - On "already exists" error: skip, log as debug
        - On other error: ROLLBACK, release lock, exit 1
     f. COMMIT transaction
     g. INSERT INTO _forge_migrations (version, checksum, statements)
     h. Release advisory lock
     i. Print summary (applied N, skipped M, duration)
     j. Run schema validation (optional, non-blocking)
     Exit 0
```

## Appendix B: Handling Schema Drift

Schema drift occurs when someone modifies the database directly (e.g., via `psql`, a migration tool, or a database admin panel) without going through FORGE.

**Detection**:
```
$ forge migrate --check-drift

Comparing artifact schema against live database...

DRIFT DETECTED:
  - Table 'tickets' has extra column 'legacy_id' (not in .forge spec)
  - Column 'tickets.priority' type is 'text' (expected: 'tickets_priority' enum)
  - Missing index: idx_tickets_author_id

Options:
  1. Update your .forge spec to match the database
  2. Run 'forge migrate -apply' to bring the database in line with the spec
  3. Manually fix the drift with psql
```

**Policy**: FORGE should detect drift but never automatically "fix" it by dropping columns or tables. Drift detection is advisory. The developer decides how to resolve it.

## Appendix C: Environment-Specific Database Configuration

```toml
# forge.runtime.toml

[database]
adapter = "embedded"        # Default for development

[database.embedded]
data_dir = ".forge-runtime/data"
port = 15432                # Use non-standard port to avoid conflicts

[environments.test]
[environments.test.database]
adapter = "embedded"
[environments.test.database.embedded]
ephemeral = true            # Throw away data after each test run
port = 0                    # Auto-select available port

[environments.production]
[environments.production.database]
adapter = "postgres"
[environments.production.database.postgres]
url = "env:DATABASE_URL"
pool_size = 30
ssl_mode = "require"
ssl_root_ca = "/etc/ssl/certs/rds-ca-2019-root.pem"
```
