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

FORGE supports multiple authentication modes. Set the mode with `auth:` in your `.forge` app declaration.

### Password Authentication

Set `auth: password` for built-in email/password authentication with JWT tokens.

**Configuration (`forge.runtime.toml`):**

```toml
[auth]
provider = "password"

[auth.password]
algorithm = "bcrypt"              # "bcrypt" or "argon2id"
bcrypt_cost = 12                  # 4-31, default 12
user_entity = "User"              # Entity name in your .forge spec
email_field = "email"             # Field for email (default: "email")
password_field = "password_hash"  # Field for password hash (default: "password_hash")
registration_fields = ["display_name"]  # Extra fields allowed on registration
min_length = 8                    # Minimum password length

[auth.jwt]
secret = "env:JWT_SECRET"         # REQUIRED - signing secret
issuer = "my-app"                 # JWT issuer claim
expiry_hours = 24                 # Access token lifetime (default: 24)
refresh_expiry_hours = 168        # Refresh token lifetime (default: 168 = 7 days)
```

**Required Entity Schema:**

Your User entity must include email and password_hash fields:

```
entity User {
  email: string unique
  password_hash: string
  display_name: string?
}
```

**Endpoints:**

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/auth/register` | Create account | No |
| POST | `/auth/login` | Login and get tokens | No |
| POST | `/auth/logout` | Logout (client-side) | No |
| POST | `/auth/refresh` | Refresh access token | No |
| GET | `/auth/me` | Get current user | Yes |
| POST | `/auth/change-password` | Update password | Yes |

**Register Request:**
```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "data": {
      "display_name": "John Doe"
    }
  }'
```

**Login Request:**
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

**Success Response (register/login):**
```json
{
  "status": "ok",
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "expires_in": 86400,
    "token_type": "Bearer",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "display_name": "John Doe"
    }
  }
}
```

**Refresh Token:**
```bash
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "eyJhbGciOi..."}'
```

**Get Current User:**
```bash
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer <access_token>"
```

**Change Password:**
```bash
curl -X POST http://localhost:8080/auth/change-password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "oldpassword",
    "new_password": "newpassword123"
  }'
```

**Auth Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `AUTH_EMAIL_TAKEN` | 409 | Email already registered |
| `AUTH_WEAK_PASSWORD` | 400 | Password doesn't meet requirements |
| `AUTH_INVALID_TOKEN` | 401 | Token malformed or signature invalid |
| `AUTH_TOKEN_EXPIRED` | 401 | Token has expired |
| `AUTH_REQUIRED` | 401 | No token provided on protected route |
| `AUTH_INVALID_EMAIL` | 400 | Invalid email format |
| `AUTH_USER_NOT_FOUND` | 404 | User not found |

**Password Hashing Algorithms:**

- `bcrypt` (default) - Industry standard, cost factor configurable (4-31)
- `argon2id` - Memory-hard, recommended for new applications

For argon2id, additional configuration:
```toml
[auth.password]
algorithm = "argon2id"
argon2_memory = 65536      # KB, default 65536 (64MB)
argon2_iterations = 3      # default 3
argon2_parallelism = 4     # default 4
```

---

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

Jobs run after the transaction commits. They are fire-and-forget: the HTTP response is sent before jobs execute.

### How It Works

1. Action commits successfully (create/update/delete)
2. Hook evaluation matches entity + operation + timing (`after` only)
3. Matching jobs are enqueued to the in-process worker pool
4. Workers execute job capabilities through the provider registry
5. Results are logged; failures retry with quadratic backoff

### Job Queue

Jobs currently use an **in-process channel-based queue** (Phase 1). No external dependencies required.

```toml
# forge.runtime.toml
[jobs]
concurrency = 10   # Number of worker goroutines (default: 10)
```

Future phases will add Redis-backed persistent queues:

```toml
# Phase 2+ (not yet implemented)
[jobs]
backend = "redis"
url = "env:REDIS_URL"
concurrency = 10
```

### Job Execution Flow

```
POST /api/actions/create_ticket → 200 OK (response sent immediately)
                                      ↓
                            Hook: Ticket.after_create
                                      ↓
                          Enqueue: notify_agents job
                                      ↓
                       Worker picks up from channel queue
                                      ↓
                    Provider registry resolves "email.send"
                                      ↓
                      Email provider executes capability
                                      ↓
                         Result logged (success/failure)
```

### Job Capabilities

Capabilities are provided by registered providers. Built-in providers:

| Capability | Provider | Description |
|------------|----------|-------------|
| `email.send` | email | Send emails via SMTP |
| `http.get` | generic | HTTP GET request |
| `http.post` | generic | HTTP POST request |
| `http.put` | generic | HTTP PUT request |
| `http.delete` | generic | HTTP DELETE request |
| `http.call` | generic | Generic HTTP request |
| `entity.create` | entity | Create entity records from job data |

### Provider Configuration

Providers are configured in `forge.runtime.toml`:

```toml
[providers.email]
host = "env:SMTP_HOST"
port = "587"
user = "env:SMTP_USER"
password = "env:SMTP_PASS"
from = "noreply@example.com"
```

### Retry Behavior

Failed jobs retry automatically with quadratic backoff:

| Attempt | Backoff Delay |
|---------|--------------|
| 1st retry | 1 second |
| 2nd retry | 4 seconds |
| 3rd retry | 9 seconds |

Default maximum attempts: 3. After exhaustion, the job is logged as failed.

### Monitoring Jobs

In development mode, check job status at `/_dev/jobs`:

```bash
# View jobs, hooks, executor status, and provider info
curl http://localhost:8080/_dev/jobs | jq .
```

### Entity Creation from Jobs

Jobs can create new entity records using the `creates:` clause in the `.forge` spec. This is useful for audit logs, activity tracking, or derived data.

**Syntax:**

```text
job log_activity {
  input: Ticket
  creates: ActivityLog {
    action: "ticket_created"
    description: input.subject
    entity_type: "Ticket"
    timestamp: now()
  }
}
```

**How it works:**

1. The compiler parses the `creates:` clause and emits a `target_entity` and `field_mappings` in the artifact
2. The `entity.create` capability is automatically added to the job (no need to declare `effect: entity.create`)
3. The built-in entity provider is registered automatically at startup
4. At runtime, the job executor resolves field mapping expressions and inserts the new record

**Field mapping expressions:**

| Expression Type | Example | Description |
|-----------------|---------|-------------|
| String literal | `"ticket_created"` | Static string value |
| Input reference | `input.subject` | Field from the triggering entity |
| Function call | `now()` | Built-in function (currently `now()` for timestamps) |

**Runtime resolution:**

Field mappings are resolved when the job executes. The entity provider:
1. Reads the `target_entity` from the job definition
2. Evaluates each field mapping expression against the job's input data
3. Inserts the new record into the target entity's table
4. Logs the result (success or failure)

The `entity.create` capability follows the same retry behavior as other capabilities: quadratic backoff with a maximum of 3 attempts.

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
3. Stop job executor (drain in-flight jobs)
4. Close database connections
5. Exit

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
