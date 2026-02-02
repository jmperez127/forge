# FORGE CLI Reference

Complete reference for the `forge` command-line tool.

## Installation

```bash
# From source
cd compiler
go build -o ../bin/forge ./cmd/forge

# Add to PATH
export PATH="$PATH:/path/to/forge/bin"
```

## Commands

### forge init

Scaffold a new FORGE application.

```bash
forge init [name]
```

**Arguments:**
- `name` - Project name (default: `app`)

**Example:**
```bash
forge init helpdesk
cd helpdesk
```

**Creates:**
```
helpdesk/
├── app.forge
├── entities.forge
└── .gitignore
```

---

### forge check

Validate .forge files without building.

```bash
forge check [files...]
```

**Arguments:**
- `files` - Specific files to check (default: all `.forge` files in current directory)

**Example:**
```bash
# Check all files
forge check

# Check specific files
forge check entities.forge relations.forge
```

**Output:**
- Lists any syntax or semantic errors
- Exits with code 0 if valid, 1 if errors

---

### forge build

Compile .forge files into runtime artifacts.

```bash
forge build [files...]
```

**Arguments:**
- `files` - Specific files to build (default: all `.forge` files in current directory)

**Example:**
```bash
forge build
```

**Generated Files:**
```
.forge-runtime/
├── artifact.json    # Runtime artifact (entities, rules, access, etc.)
├── schema.sql       # PostgreSQL DDL
└── sdk/
    ├── client.ts    # TypeScript client
    └── react.tsx    # React hooks
```

**Output:**
```
Build successful!

Generated files:
  .forge-runtime/artifact.json
  .forge-runtime/schema.sql
  .forge-runtime/sdk/client.ts
  .forge-runtime/sdk/react.tsx

Stats:
{
  "entities": 5,
  "actions": 6,
  "rules": 4,
  "views": 7,
  "jobs": 3,
  "messages": 7
}
```

---

### forge migrate

Show or apply database migrations.

```bash
forge migrate [--apply]
```

**Flags:**
- `--apply` - Apply migrations to database (not yet implemented)

**Example:**
```bash
# Show migration SQL
forge migrate

# Apply to database manually
psql $DATABASE_URL -f .forge-runtime/schema.sql
```

---

### forge run

Start the FORGE runtime server.

```bash
forge run
```

**Environment Variables:**
- `PORT` - Server port (default: 8080)
- `DATABASE_URL` - PostgreSQL connection URL
- `REDIS_URL` - Redis connection URL (for job queue)
- `LOG_LEVEL` - Logging level: debug, info, warn, error
- `FORGE_ENV` - Environment: development, test, production (default: development)

**Example:**
```bash
PORT=3000 DATABASE_URL="postgres://localhost/myapp" forge run
```

**Endpoints:**
```
GET  /health                    # Health check
POST /api/actions/{name}        # Execute action
GET  /api/views/{name}          # Query view
GET  /api/entities/{name}       # List entities
GET  /api/entities/{name}/{id}  # Get entity
POST /api/entities/{name}       # Create entity
PUT  /api/entities/{name}/{id}  # Update entity
DEL  /api/entities/{name}/{id}  # Delete entity
WS   /ws                        # WebSocket subscriptions
```

**Development Mode Endpoints (FORGE_ENV=development):**
```
GET  /_dev                      # Dev dashboard
GET  /_dev/info                 # App metadata
GET  /_dev/routes               # API routes
GET  /_dev/schema               # Entity schema
GET  /_dev/actions              # Actions
GET  /_dev/rules                # Business rules
GET  /_dev/access               # Access policies
GET  /_dev/views                # View definitions
GET  /_dev/jobs                 # Jobs and hooks
GET  /_dev/messages             # Message codes
GET  /_dev/database             # Database status
GET  /_dev/websocket            # WebSocket stats
GET  /_dev/config               # Configuration (secrets masked)
```

**Usage:**
```bash
# Open dashboard in browser
open http://localhost:8080/_dev

# Get routes as JSON
curl http://localhost:8080/_dev/routes

# Pipe to jq for filtering
curl http://localhost:8080/_dev/schema | jq '.entities.Ticket'
```

See [Dev Info Page](./dev-info.md) for full documentation.

---

### forge test

Run invariant tests defined in `.forge` files.

```bash
forge test [files...]
```

**Example:**
```bash
forge test

# Output:
# Found 5 test(s)
#   test Ticket.update
#   test Ticket.update
#   test close_ticket
#   ...
```

**Note:** Test execution requires a running database. Tests use transactions and roll back after each test.

---

### forge lsp

Start the Language Server Protocol server.

```bash
forge lsp
```

**Features:**
- Syntax highlighting
- Error diagnostics
- Autocomplete
- Go to definition
- Hover documentation

**Editor Integration:**

VSCode (`.vscode/settings.json`):
```json
{
  "forge.lsp.path": "/path/to/forge"
}
```

---

### forge version

Print version information.

```bash
forge version
```

**Output:**
```
forge version 0.1.0
```

---

### forge help

Show help message.

```bash
forge help
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (compilation, runtime, etc.) |

---

## Configuration

FORGE uses environment variables for runtime configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `DATABASE_URL` | PostgreSQL URL | Required |
| `REDIS_URL` | Redis URL | Optional |
| `LOG_LEVEL` | Logging level | `info` |
| `FORGE_ARTIFACT` | Artifact path | `.forge-runtime/artifact.json` |

---

## Debugging

### Verbose Output

```bash
# Enable debug logging
LOG_LEVEL=debug forge run
```

### Artifact Inspection

```bash
# Pretty-print artifact
cat .forge-runtime/artifact.json | jq .

# View generated SQL
cat .forge-runtime/schema.sql
```

### Database Debugging

```bash
# Check RLS policies
psql $DATABASE_URL -c "\dp"

# Check generated types
psql $DATABASE_URL -c "\dT+"
```
