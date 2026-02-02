# FORGE Runtime Reference

Complete reference for the FORGE runtime server.

## Overview

The FORGE runtime is a **sealed execution environment** that:
- Loads compiled artifacts (`.forge-runtime/artifact.json`)
- Enforces all rules and access control at the database level
- Provides HTTP and WebSocket APIs
- Executes background jobs
- **Auto-migrates** the database schema from the artifact

The runtime **cannot be bypassed** - all data access goes through compiled rules.

---

## Configuration: `forge.runtime.toml`

> **Key principle:** Configuration belongs to the runtime, NOT the spec. The `.forge` spec never sees secrets.

All runtime configuration lives in `forge.runtime.toml` at the project root:

```toml
# forge.runtime.toml

[database]
# Adapter options: "embedded", "postgres", "postgres:sharded"
adapter = "embedded"

[database.embedded]
data_dir = ".forge-runtime/data"
port = 5432

[database.postgres]
url = "env:DATABASE_URL"   # Use "env:" prefix to read from environment
pool_size = 20
ssl_mode = "prefer"

[email]
provider = "smtp"
host = "env:SMTP_HOST"
user = "env:SMTP_USER"
password = "env:SMTP_PASS"

[jobs]
backend = "redis"
url = "env:REDIS_URL"
concurrency = 10

[auth]
provider = "jwt"
[auth.jwt]
secret = "env:JWT_SECRET"
expiry_hours = 24

# Environment-specific overrides
[environments.test]
[environments.test.database]
adapter = "embedded"
[environments.test.database.embedded]
ephemeral = true  # Auto-cleanup after tests

[environments.production]
[environments.production.database]
adapter = "postgres"
[environments.production.database.postgres]
url = "env:DATABASE_URL"
pool_size = 50
```

### The `env:` Prefix

Values prefixed with `env:` are read from environment variables at startup:
- `url = "env:DATABASE_URL"` → reads `$DATABASE_URL`
- `secret = "env:JWT_SECRET"` → reads `$JWT_SECRET`

This keeps secrets out of config files while maintaining declarative configuration.

### Environment Overrides

Set `FORGE_ENV` to select environment-specific configuration:

```bash
FORGE_ENV=production forge-runtime  # Uses [environments.production]
FORGE_ENV=test forge-runtime        # Uses [environments.test]
```

Default is `development` if `FORGE_ENV` is not set.

---

## Database Modes

FORGE supports three database modes, configured via `[database]` in `forge.runtime.toml`.

### Mode 1: Embedded (Zero-Config Development)

```toml
[database]
adapter = "embedded"

[database.embedded]
data_dir = ".forge-runtime/data"
port = 5432
```

- **Zero external dependencies** - PostgreSQL is embedded in the runtime
- Auto-downloads PostgreSQL binary on first run
- Data persists in `data_dir` between runs
- Perfect for: local development, CI, quick prototyping

**Usage:**
```bash
forge run  # Just works, no database setup needed
```

### Mode 2: External PostgreSQL (Production)

```toml
[database]
adapter = "postgres"

[database.postgres]
url = "env:DATABASE_URL"
pool_size = 20
ssl_mode = "require"
```

- Connects to external PostgreSQL (RDS, Cloud SQL, Supabase, etc.)
- Full connection pooling
- Perfect for: production, staging

**Usage:**
```bash
DATABASE_URL="postgres://user:pass@host:5432/db" forge-runtime
```

### Mode 3: Sharded PostgreSQL (Scale)

```toml
[database]
adapter = "postgres:sharded"

[database.sharded]
shard_key = "org_id"
shards = [
    { name = "shard_0", url = "env:SHARD_0_URL", range = [0, 127] },
    { name = "shard_1", url = "env:SHARD_1_URL", range = [128, 255] },
]
allow_cross_shard = ["AdminDashboard", "Reports"]
```

- Multi-tenant sharding by `shard_key`
- Runtime routes queries to correct shard automatically
- Cross-shard queries for allowed views
- Perfect for: high-scale multi-tenant applications

---

## Database Migrations

> **Philosophy:** "You never write migrations" - FORGE computes schema from your spec.

### How Migration Works

1. **Compiler generates schema** - When you run `forge build`, the compiler generates SQL schema in the artifact
2. **Runtime applies on startup** - The runtime auto-applies the schema when it starts
3. **Safe by default** - Only safe changes are auto-applied; dangerous changes require acknowledgment

### Migration Flow

```
.forge files → forge build → artifact.json (contains migration SQL)
                                    ↓
                            forge run / forge-runtime
                                    ↓
                         Auto-apply schema on startup
```

### Safe vs Dangerous Changes

**Safe changes (auto-applied):**
- Add table
- Add column with default
- Add nullable column
- Add index
- Add enum value (at end)

**Dangerous changes (require `--ack`):**
- Drop table
- Drop column
- Change column type
- Remove enum value

### Viewing the Migration

The migration SQL is stored in the artifact:

```bash
# View generated migration
cat .forge-runtime/artifact.json | jq '.migration'

# Or use the schema.sql file (if generated)
cat .forge-runtime/schema.sql
```

### Migration Tracking

The runtime tracks applied migrations in a `_forge_migrations` table:

```sql
SELECT * FROM _forge_migrations;
-- version     | applied_at
-- 001         | 2024-01-01 12:00:00
```

### Handling Dangerous Changes

If the migration contains dangerous changes, the runtime will refuse to start:

```
[ERROR] Migration contains dangerous changes:
  - DROP COLUMN users.legacy_field (drops column and all data)

Run with --ack="DROP COLUMN users.legacy_field" to acknowledge and apply.
```

Acknowledge with:
```bash
forge-runtime --ack="DROP COLUMN users.legacy_field"
```

---

## Starting the Runtime

### Using the CLI

```bash
forge run
```

### Using the Binary Directly

```bash
forge-runtime
```

### With Environment Variables

```bash
FORGE_ENV=production \
DATABASE_URL="postgres://..." \
JWT_SECRET="..." \
forge-runtime
```

### Command-Line Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-port` | HTTP server port | `8080` |
| `-artifact` | Path to artifact.json | `.forge-runtime/artifact.json` |
| `-database` | Override database URL | (from config) |
| `-log-level` | Log level | `info` |
| `-project` | Project directory | (parent of artifact) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `8080` |
| `FORGE_ENV` | Environment (development, test, production) | `development` |
| `DATABASE_URL` | PostgreSQL connection string (overrides config) | (from config) |
| `REDIS_URL` | Redis connection for job queue | (from config) |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `FORGE_ARTIFACT` | Path to artifact.json | `.forge-runtime/artifact.json` |
| `JWT_SECRET` | JWT signing secret | (from config) |

## Request Flow

```
HTTP Request
    |
    v
+-------------------+
| Authentication    |  Extract user from JWT/OAuth token
+-------------------+
    |
    v
+-------------------+
| Tenant Context    |  Set app.user_id in PostgreSQL session
+-------------------+
    |
    v
+-------------------+
| Load Action       |  Find action handler from artifact
+-------------------+
    |
    v
+-------------------+
| Access Check      |  Evaluate access rules (compiled to SQL)
+-------------------+
    |
    v
+-------------------+
| Execute Action    |  Run in single database transaction
+-------------------+
    |
    v
+-------------------+
| Business Rules    |  Evaluate rules, reject if violated
+-------------------+
    |
    v
+-------------------+
| Commit/Rollback   |  Commit on success, rollback on rule violation
+-------------------+
    |
    v
+-------------------+
| Trigger Hooks     |  Enqueue background jobs
+-------------------+
    |
    v
+-------------------+
| Emit Events       |  Send WebSocket notifications
+-------------------+
    |
    v
+-------------------+
| Response          |  Return JSON with messages
+-------------------+
```

---

## HTTP API

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### Actions

Execute a named action.

```
POST /api/actions/{action_name}
```

**Headers:**
- `Authorization: Bearer <token>` - JWT or OAuth token
- `Content-Type: application/json`

**Request Body:**
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "field1": "value1",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "messages": []
}
```

**Error Response (400/403/422):**
```json
{
  "status": "error",
  "data": null,
  "messages": [
    {
      "code": "TICKET_CLOSED",
      "level": "error",
      "message": "This ticket is already closed."
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/actions/create_ticket \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Bug report", "priority": "high"}'
```

---

### Views

Query a view projection.

```
GET /api/views/{view_name}
```

**Query Parameters:**
- `limit` - Maximum records to return (default: 50)
- `offset` - Skip records (for pagination)
- `order` - Sort field and direction (e.g., `created_at:desc`)
- `filter` - JSON filter object (URL-encoded)

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid1",
      "subject": "First ticket",
      "status": "open"
    },
    {
      "id": "uuid2",
      "subject": "Second ticket",
      "status": "closed"
    }
  ],
  "meta": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

**Example:**
```bash
# Get all tickets
curl http://localhost:8080/api/views/TicketList \
  -H "Authorization: Bearer $TOKEN"

# Paginated with sorting
curl "http://localhost:8080/api/views/TicketList?limit=10&offset=20&order=created_at:desc" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Entities (CRUD)

Standard CRUD operations on entities.

#### List Entities

```
GET /api/entities/{entity_name}
```

**Query Parameters:** Same as views.

#### Get Entity

```
GET /api/entities/{entity_name}/{id}
```

#### Create Entity

```
POST /api/entities/{entity_name}
```

#### Update Entity

```
PUT /api/entities/{entity_name}/{id}
```

#### Delete Entity

```
DELETE /api/entities/{entity_name}/{id}
```

**Note:** All entity operations go through the same access control and rule evaluation as actions.

---

## WebSocket API

Real-time subscriptions via WebSocket.

### Connection

```
WS /ws
```

**Query Parameters:**
- `token` - Authentication token

**Example:**
```javascript
const ws = new WebSocket('ws://localhost:8080/ws?token=' + token);
```

### Subscribe to View

Send a subscription message:

```json
{
  "type": "subscribe",
  "view": "TicketList",
  "params": {
    "filter": { "status": "open" }
  }
}
```

**Initial Response:**
```json
{
  "type": "snapshot",
  "view": "TicketList",
  "data": [
    { "id": "uuid1", "subject": "Ticket 1" }
  ]
}
```

**Update Events:**
```json
{
  "type": "update",
  "view": "TicketList",
  "changes": [
    {
      "op": "insert",
      "data": { "id": "uuid2", "subject": "New ticket" }
    }
  ]
}
```

### Unsubscribe

```json
{
  "type": "unsubscribe",
  "view": "TicketList"
}
```

### Ping/Pong

The server sends periodic pings. Clients should respond with pongs to maintain the connection.

---

## Authentication

### JWT Authentication

Set `auth: jwt` in your app configuration.

**Token Format:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "exp": 1735689600
}
```

**Configuration:**
```bash
AUTH_SECRET="your-jwt-secret"
```

### OAuth Authentication

Set `auth: oauth` in your app configuration.

**Supported Providers:**
- Google
- GitHub
- Custom (configure endpoints)

**Configuration:**
```bash
OAUTH_PROVIDER="google"
OAUTH_CLIENT_ID="your-client-id"
OAUTH_CLIENT_SECRET="your-client-secret"
OAUTH_REDIRECT_URL="http://localhost:8080/auth/callback"
```

**OAuth Endpoints:**
```
GET  /auth/login     # Redirect to OAuth provider
GET  /auth/callback  # OAuth callback, returns JWT
POST /auth/refresh   # Refresh access token
POST /auth/logout    # Invalidate session
```

### No Authentication

Set `auth: none` for development or internal services.

**Warning:** All requests are treated as anonymous. Access rules using `user` will always fail.

---

## Access Control

Access rules compile to PostgreSQL Row Level Security (RLS) policies.

### How It Works

1. On each request, the runtime sets the user context:
   ```sql
   SET app.user_id = 'uuid-of-authenticated-user';
   ```

2. RLS policies reference this context:
   ```sql
   CREATE POLICY ticket_read ON tickets FOR SELECT
   USING (
       author_id = current_setting('app.user_id')::uuid
       OR org_id IN (
           SELECT org_id FROM org_members
           WHERE user_id = current_setting('app.user_id')::uuid
       )
   );
   ```

3. All queries automatically filter based on the policy.

### Debugging Access Issues

```bash
# Check current user context
psql $DATABASE_URL -c "SELECT current_setting('app.user_id', true);"

# Check RLS policies
psql $DATABASE_URL -c "\dp tickets"

# Test a query as a specific user
psql $DATABASE_URL << EOF
SET app.user_id = 'user-uuid';
SELECT * FROM tickets;
EOF
```

---

## Business Rules

Rules compile to checks executed within the transaction.

### Rule Evaluation

1. Before commit, the runtime evaluates all applicable rules
2. If a `forbid` condition is true, the transaction is rolled back
3. If a `require` condition is false, the transaction is rolled back
4. The associated message code is returned to the client

### Example Rule Flow

```
User calls: POST /api/actions/close_ticket { id: "ticket-123" }

1. Begin transaction
2. Load ticket with id="ticket-123"
3. Check access: user == author OR user.role == agent
4. Apply update: status = "closed"
5. Evaluate rules:
   - rule Ticket.update: forbid if status == closed
   - Ticket already closed? → Reject with TICKET_CLOSED
6. If rules pass: Commit
7. Return success with ticket data
```

---

## Background Jobs

Jobs run after the transaction commits.

### Job Queue

Jobs are queued to Redis via Asynq:

```bash
REDIS_URL="redis://localhost:6379"
```

### Job Execution

1. Hook triggers after entity operation
2. Job is enqueued with entity data
3. Worker picks up job
4. `needs` data is pre-resolved (jobs have no query power)
5. Job executes with declared capabilities only

### Job Capabilities

| Capability | Description |
|------------|-------------|
| `email.send` | Send emails via configured provider |
| `http.call` | Make HTTP requests to allowed domains |
| `file.write` | Write files to allowed paths |

### Monitoring Jobs

```bash
# View job queue status (requires asynq CLI)
asynq stats

# View failed jobs
asynq tasks list --queue=default --state=failed
```

---

## Database Schema

The runtime expects the following schema structure.

### Generated Tables

For each entity:
```sql
CREATE TABLE {entity_name_plural} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- entity fields
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### System Tables

```sql
-- Job tracking
CREATE TABLE _forge_jobs (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Event log (for realtime)
CREATE TABLE _forge_events (
    id BIGSERIAL PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Triggers

The runtime creates triggers for:
- `updated_at` auto-update
- Event emission for real-time subscriptions
- Hook invocation

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "status": "error",
  "data": null,
  "messages": [
    {
      "code": "ERROR_CODE",
      "level": "error",
      "message": "Human-readable message"
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid input) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (access denied) |
| 404 | Not found |
| 422 | Unprocessable (rule violation) |
| 500 | Internal server error |

### System Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication required |
| `AUTH_INVALID` | Invalid authentication token |
| `ACCESS_DENIED` | Access rule denied operation |
| `NOT_FOUND` | Entity not found |
| `VALIDATION_FAILED` | Input validation failed |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Logging

The runtime uses structured logging (slog).

### Log Levels

```bash
LOG_LEVEL=debug  # All logs
LOG_LEVEL=info   # Info, warn, error
LOG_LEVEL=warn   # Warn, error
LOG_LEVEL=error  # Errors only
```

### Log Format

```json
{
  "time": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "msg": "action executed",
  "action": "create_ticket",
  "user_id": "uuid",
  "duration_ms": 15
}
```

### Request Tracing

Each request gets a trace ID:

```json
{
  "trace_id": "abc123",
  "msg": "request started",
  "method": "POST",
  "path": "/api/actions/create_ticket"
}
```

---

## Performance

### Connection Pooling

The runtime uses pgx with connection pooling:

```bash
# Configure pool size (default: 10)
DATABASE_MAX_CONNS=20
```

### Caching

- Artifact is loaded once at startup
- RLS policies are compiled by PostgreSQL
- Views can be cached with Redis (optional)

### Scaling

The runtime is stateless and can be horizontally scaled:

```bash
# Run multiple instances
PORT=8080 forge run &
PORT=8081 forge run &
PORT=8082 forge run &

# Load balance with nginx/haproxy
```

---

## Health Checks

### Liveness

```
GET /health
```

Returns 200 if the server is running.

### Readiness

```
GET /health/ready
```

Returns 200 if:
- Database connection is healthy
- Artifact is loaded
- Job queue is connected (if configured)

---

## Graceful Shutdown

The runtime handles SIGTERM/SIGINT gracefully:

1. Stop accepting new connections
2. Wait for in-flight requests (30s timeout)
3. Close database connections
4. Exit

```bash
# Graceful shutdown
kill -TERM $(pgrep forge-runtime)
```

---

## Development Info Page

In development mode (`FORGE_ENV=development` or unset), the runtime exposes a dashboard at `/_dev` with:

- **Routes** - All API endpoints with access rules
- **Schema** - Entities, fields, relations
- **Rules** - Business rules with SQL predicates
- **Access** - Access control policies
- **Config** - Runtime configuration (secrets masked)
- **Stats** - Database and WebSocket status

```bash
# Open dashboard
open http://localhost:8080/_dev

# Get routes as JSON
curl http://localhost:8080/_dev/routes

# CLI shortcut
forge dev routes
```

These endpoints return 404 in production for security.

See [Dev Info Page](./dev-info.md) for complete documentation.
