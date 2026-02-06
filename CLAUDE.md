# FORGE - AI Development Guide

> **FORGE compiles application intent (data + rules + access + views) into a sealed runtime that cannot violate your business logic.**

## IMPORTANT: Read Current Work Journal First

Before starting ANY implementation work, **always read**:
- `docs/journal_current_work.md` — Active implementation log with current status, ownership, and decisions
- `docs/completed_work.md` — Archive of completed features

When working on features:
1. Check the journal for current status before touching any code
2. Update the journal when starting work (mark as in_progress + your role)
3. Update the journal when completing work (mark as done + list files changed)
4. When ALL tasks for a feature are done, move the entry to `completed_work.md`
5. **Always update user-facing documentation** after any feature work:
   - `CHANGELOG.md` — Add entry under `[Unreleased]`
   - `docs/runtime-reference.md` — Update if runtime behavior changed
   - `docs/language-reference.md` — Update if .forge syntax changed
   - `docs/dev-info.md` — Update if /_dev endpoints changed
   - `website/src/pages/docs/*.tsx` — Update the relevant page if user-visible features changed

## GitHub Project Board

**All work is tracked on the GitHub project board:** https://github.com/users/jmperez127/projects/1

**Every task must have a ticket.** When ANY work is requested:
1. **First** run `gh issue list --repo jmperez127/forge` to check for existing issues — avoid duplicates
2. If no matching issue exists, create one with clear scope and acceptance criteria
3. Add the issue to the FORGE v0.3.0 project board
4. Set status to "In Progress" when starting work
5. Reference issue numbers in commit messages (e.g., `fixes #3`)
6. Close issues with `--reason completed` when done, set board status to "Done"
7. For large features, break into sub-issues and track each separately

This applies to everything: features, bugs, refactors, doc changes. No work without a ticket.

Use `gh` CLI for all board operations:
```bash
gh issue list --repo jmperez127/forge                          # List issues
gh issue create --repo jmperez127/forge --title "..." --body "..."  # Create issue
gh project item-add 1 --owner jmperez127 --url <issue-url>    # Add to board
gh issue close <number> --repo jmperez127/forge --reason completed  # Close when done
```

## Roadmap

The v0.3.0 release roadmap lives in `docs/roadmap/`. Each document is a self-contained implementation plan:
- `docs/roadmap/README.md` — Master index with critical path and execution order
- 10 detailed implementation documents (01 through 10)

---

## Project Vision

FORGE is NOT a framework. It is a **compiler + sealed runtime** for applications. Born from the insight that most software is "the same boring garbage rewritten forever," FORGE eliminates:
- Controllers
- Serializers
- Hand-written migrations
- Manual permissions
- Glue code

You describe **data + rules**, FORGE generates the rest.

### Core Philosophy (from HOW_FORGE_WAS_CONCIEVED.html)

Groundbreaking projects:
- **Delete work** - not add abstractions
- **Remove decisions** - not add flexibility
- **Make the right thing the default** - not add options
- **Let people stop being experts** - not require more knowledge

FORGE is what Rails would look like if invented AFTER we understood distributed systems, async, and AI.

---

## Installation

### Quick Install (macOS/Linux)
```bash
curl -fsSL https://raw.githubusercontent.com/forge-lang/forge/main/install.sh | bash
```

### Manual Install
Download from [GitHub Releases](https://github.com/forge-lang/forge/releases):
```bash
# macOS (Apple Silicon)
curl -L https://github.com/forge-lang/forge/releases/latest/download/forge-darwin-arm64.tar.gz | tar xz
sudo mv forge /usr/local/bin/

# macOS (Intel)
curl -L https://github.com/forge-lang/forge/releases/latest/download/forge-darwin-amd64.tar.gz | tar xz
sudo mv forge /usr/local/bin/

# Linux (x64)
curl -L https://github.com/forge-lang/forge/releases/latest/download/forge-linux-amd64.tar.gz | tar xz
sudo mv forge /usr/local/bin/
```

### From Source
```bash
git clone https://github.com/forge-lang/forge.git
cd forge/runtime
go build -o /usr/local/bin/forge ./cmd/forge
```

### Verify Installation
```bash
forge version
```

---

## Releasing FORGE

To create a new release:

```bash
# 1. Update version in CHANGELOG.md
# 2. Commit changes
git add -A && git commit -m "Release v0.2.0"

# 3. Tag the release
git tag v0.2.0

# 4. Push (triggers GitHub Actions)
git push origin main --tags
```

GitHub Actions will automatically:
- Build binaries for linux/darwin (amd64/arm64) and windows
- Create GitHub Release with download links
- Generate checksums

---

## Critical Files

| File | Purpose |
|------|---------|
| `FORGE_SPEC.md` | **Authoritative specification** - READ THIS FIRST |
| `HOW_FORGE_WAS_CONCIEVED.html` | Origin story and design philosophy |
| `CLAUDE.md` | This file - AI development context |
| `decisions.md` | Architectural decision log |
| `docs/dev-info.md` | Development info page documentation |

---

## Architecture Overview

```
.forge files → COMPILER → Runtime Artifact → SEALED RUNTIME
                  ↓
            Frontend SDK (@forge/client, @forge/react)
```

### Compiler Pipeline
```
.parse → .analyze → .normalize → .plan → .emit
```

### Monorepo Structure (Go)
```
forge/
├── compiler/
│   ├── go.mod                 # github.com/forge-lang/forge/compiler
│   ├── forge/                 # Public API for compilation
│   │   └── compile.go         # Compile() and Check() functions
│   └── internal/
│       ├── token/             # Token types
│       ├── lexer/             # Tokenization
│       ├── parser/            # AST construction (recursive descent + Pratt)
│       ├── ast/               # AST node types
│       ├── analyzer/          # Semantic analysis
│       ├── normalizer/        # Implicit derivations
│       ├── planner/           # Action graph generation
│       ├── emitter/           # Artifact + SDK generation
│       └── diag/              # Structured diagnostics
│
├── runtime/
│   ├── go.mod                 # github.com/forge-lang/forge/runtime
│   ├── cmd/
│   │   └── forge/             # CLI entry point (unified binary)
│   │       ├── main.go        # All CLI commands
│   │       └── main_test.go   # CLI tests
│   ├── forge/                 # Public API for runtime
│   │   └── server.go          # NewServer() function
│   └── internal/
│       ├── server/            # HTTP + WebSocket server
│       ├── provider/          # Provider interfaces and registry
│       │   └── builtin/       # Built-in providers (HTTP, email)
│       ├── db/                # Database abstraction
│       ├── jobs/              # Job executor
│       └── config/            # Runtime configuration
│
├── bin/                       # Built binaries (gitignored)
│   └── forge                  # The forge CLI
│
├── sdk/
│   └── typescript/
│       ├── client/            # @forge/client
│       └── react/             # @forge/react
│
├── vscode-forge/              # VS Code extension
│   ├── syntaxes/              # TextMate grammar for .forge files
│   │   └── forge.tmLanguage.json
│   ├── language-configuration.json
│   └── src/server/            # Language server (LSP)
│
├── website/                   # FORGE documentation website
│   └── src/lib/
│       └── syntax-highlight.ts  # Syntax highlighter based on TextMate grammar
│
├── projects/                  # Real test applications
│   ├── helpdesk/              # Example: Ticket system
│   └── chat/                  # Example: Real-time chat
│
└── e2e/                       # End-to-end tests (Playwright)
    ├── tests/                 # Test specs
    │   ├── smoke.spec.ts      # Basic connectivity
    │   └── helpdesk.spec.ts   # Full user flows
    └── fixtures/              # Test utilities
        ├── auth.ts            # Authentication helpers
        └── db.ts              # Database helpers
```

---

## IDE & Syntax Highlighting

FORGE has first-class editor support through a TextMate grammar and Language Server Protocol (LSP) implementation.

### VS Code Extension (`vscode-forge/`)

- **TextMate Grammar** (`syntaxes/forge.tmLanguage.json`) - Provides syntax highlighting for `.forge` files
- **Language Configuration** - Bracket matching, comment toggling, auto-indentation
- **Language Server** (`src/server/`) - Provides diagnostics, completion, and go-to-definition

### Web Syntax Highlighting

The website and playground use the same token patterns as the VS Code extension for consistent highlighting:

- **`website/src/lib/syntax-highlight.ts`** - JavaScript port of the TextMate grammar
- Supports FORGE, SQL, TypeScript, and Bash highlighting
- Used by the interactive playground at `/playground`

When updating syntax highlighting, ensure both the TextMate grammar and the web highlighter stay in sync.

---

## Development Principles

### 1. The Spec is Law
- `FORGE_SPEC.md` is the authoritative source
- If implementation differs from spec, fix the implementation
- Compiler failures are fatal - runtime never guesses

### 2. No Bypassable Guarantees
- Rules compile to SQL predicates (cannot be skipped)
- Access control enforced at query level via PostgreSQL RLS
- All mutations go through actions
- Jobs have capability sandboxes

### 3. Testing is First-Class
- **Unit tests** for every module (`*_test.go`)
- **Table-driven tests** (Go idiom)
- **Integration tests** with real Postgres (testcontainers)
- **Snapshot tests** for AST/artifact stability
- **E2E tests** with Playwright (`e2e/`)
- **Real apps** in `projects/` folder
- Coverage targets: 80%+ statements, 75%+ branches

### 4. LLM-Friendly Design
- Declarative specs are easy for LLMs to edit
- No hidden state, no implicit behavior
- Structured errors (never throw strings)

### 5. Documentation
- Keep the forge documentation up to date with changes
- Needs to use simple but technical language
- Update after every considerable change

---

## Bug Handling

When a bug is reported, follow this process:

1. **Don't start by trying to fix the bug.** Resist the urge to immediately jump into the code and attempt a fix.

2. **Document a test plan in markdown.** Before any fix work, write down the repro steps so you don't lose track of them. Include:
   - Exact steps to reproduce the bug
   - Commands to run
   - Expected vs actual behavior
   - How to verify the fix worked

3. **Write a test that reproduces the bug.** Create a failing test that demonstrates the buggy behavior. This ensures:
   - We understand the bug correctly
   - We have a reliable way to verify the fix
   - We prevent regressions in the future

4. **Use subagents to fix the bug.** Once the failing test exists, spawn subagents to attempt the fix and prove it works by getting the test to pass.

---

## Creating New FORGE Projects

When creating a new FORGE application:

1. **Always use authentication.** New projects should use `auth: password` (or `auth: jwt` for API-only apps). Never use `auth: none` unless explicitly requested.

```text
app MyApp {
  auth: password
  database: postgres
}
```

2. **Actions must specify their operation type.** Every action needs `creates:`, `updates:`, or `deletes:` to tell the runtime what database operation to perform:

```text
action create_item {
  input: Item
  creates: Item    # Required - tells runtime to INSERT
}

action update_item {
  input: Item
  updates: Item    # Required - tells runtime to UPDATE
}

action delete_item {
  input: Item
  deletes: Item    # Required - tells runtime to DELETE
}
```

3. **User ownership fields are auto-populated.** For create actions, the runtime automatically sets `owner_id`, `author_id`, `user_id`, or `created_by` fields from the authenticated user if they exist on the entity.

4. **Define access control.** Every entity should have access rules:

```text
access Item {
  read: user == owner
  write: user == owner
}
```

---

## App Development Rules

When implementing applications using FORGE (in `projects/` folder):

1. **NEVER edit the FORGE compiler or runtime.** When working on a FORGE app, you must not modify any code in `compiler/` or `runtime/`. These are separate concerns.

2. **If you hit a limitation or missing language construct:**
   - **STOP** trying to work around it by editing FORGE
   - **NOTIFY** the user: "I'm stuck - FORGE doesn't support [X]. This needs a language/runtime change."
   - **CONTINUE** implementing the rest of the app using existing constructs
   - The developer will address the FORGE limitation separately

3. **App-specific code belongs in the app**, not in the runtime. Things like typing indicators, presence, and custom UI logic should be implemented in the app's frontend code using the generic primitives FORGE provides.

4. **The SDK (client.ts, react.tsx) in each app** can have app-specific extensions, but changes that would benefit all apps should be discussed first.

Example of what to do when stuck:
```
❌ Wrong: "Let me modify runtime/internal/server/handlers.go to add support for X..."
✅ Right: "FORGE doesn't currently support X. I'll continue with the rest of the app,
          but you'll need to add this construct to FORGE separately."
```

---

## Key Patterns

### Compiler Pattern: Pipeline with Diagnostics
```go
// Each pass returns diagnostics, not errors
func (p *Parser) ParseFile() *ast.File {
    // Parser collects diagnostics as it goes
    // Returns partial AST even with errors
}

// Diagnostics are structured for LSP
type Diagnostic struct {
    Range    Range
    Severity Severity
    Code     string      // "E0201"
    Message  string
    FixHint  *CodeAction // Suggested fix
}
```

### Parser Pattern: Pratt Parsing for Expressions
```go
// Precedence levels
const (
    LOWEST  = iota
    OR      // or
    AND     // and
    EQUALS  // == !=
    COMPARE // < > <= >=
    SUM     // + -
    PRODUCT // * / %
    PREFIX  // -x, not x
    CALL    // func()
    INDEX   // .field
)

func (p *Parser) parseExpression(precedence int) ast.Expr {
    prefix := p.prefixParseFns[p.curToken.Type]
    leftExp := prefix()

    for precedence < p.peekPrecedence() {
        infix := p.infixParseFns[p.peekToken.Type]
        leftExp = infix(leftExp)
    }

    return leftExp
}
```

### Runtime Pattern: Request Flow
```
HTTP Request
    ↓
Authentication (set app.user_id in session)
    ↓
Load Action from Artifact
    ↓
Evaluate Access Rules (SQL predicates)
    ↓
Execute Action (single transaction)
    ↓
Evaluate Business Rules (CEL)
    ↓
Commit or Reject (with message code)
    ↓
Trigger Hooks → Enqueue Jobs
    ↓
Emit Realtime Events (WebSocket)
    ↓
Return Response (JSON with messages)
```

### SDK Pattern: Generated Type-Safe Client
```typescript
// Generated from artifact
export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
}

// Type-safe actions
await client.actions.closeTicket({ ticket: ticketId });

// Real-time subscriptions
client.subscribe('TicketList', {
  onData: (tickets) => setTickets(tickets),
});
```

---

## FORGE CLI Reference

The `forge` CLI is the single binary for all FORGE operations. Location: `./bin/forge`

```
forge <command> [options]

Commands:
  init [name]    Create a new FORGE project
  check          Validate .forge files
  build          Compile .forge files to runtime artifact
  run            Start the runtime server
  dev            Build, run, and watch for changes
  migrate        Show or apply database migrations
  version        Print version information
  help           Show help
```

### forge init
```bash
forge init myapp              # Create new project in ./myapp/
forge init                    # Create in current directory
```

### forge check
```bash
forge check                   # Validate all .forge files
```

### forge build
```bash
forge build                   # Output to .forge-runtime/
forge build -o dist           # Custom output directory
forge build app.forge         # Build specific files
```

**Output:**
- `.forge-runtime/artifact.json` - Runtime specification
- `.forge-runtime/schema.sql` - Database DDL
- `.forge-runtime/sdk/client.ts` - TypeScript client
- `.forge-runtime/sdk/react.tsx` - React hooks

### forge run
```bash
forge run                     # Start on port 8080
forge run -port 3000          # Custom port
forge run -db "postgres://..."  # Override database URL
```

**Environment Variables:**
- `FORGE_ENV=production` - Disables /_dev endpoints
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - Token signing key

### forge dev
```bash
forge dev                     # Build + run + watch
forge dev -port 3000          # Custom port
```

Hot reloads on any `.forge` file change.

### forge migrate
```bash
forge migrate                 # Show pending migrations
forge migrate -apply          # Apply migrations
forge migrate -apply -dry-run # Preview without applying
forge migrate -apply -verbose # Detailed output
forge migrate -database "url" # Override database URL
```

---

## Common Commands

### Build the forge CLI (one-time)
```bash
cd runtime && go build -o ../bin/forge ./cmd/forge
./bin/forge version           # Verify: "forge version 0.1.0"
```

### Build Helpdesk Example
```bash
cd projects/helpdesk
../../bin/forge check          # validate
../../bin/forge build          # compile
../../bin/forge run            # start server
```

### Development Mode (Hot Reload)

```bash
# Start development server with hot reload
cd projects/helpdesk
forge dev

# Output:
# Starting FORGE development server...
# Build successful!
# ...
# Watching for changes...
#
# [edit app.forge]
# File changed: app.forge
# Rebuild successful!
```

This single command builds, runs the server, and watches for changes. Edit any `.forge` file and changes apply automatically without restarting.

### Starting the Server (Manual)

```bash
# Development mode (default) - enables /_dev info pages
FORGE_ENV=development ./bin/forge run

# Or just (FORGE_ENV defaults to development)
./bin/forge run

# Production mode - disables /_dev, returns 404
FORGE_ENV=production ./bin/forge run

# With database and port
FORGE_ENV=production DATABASE_URL="postgres://..." PORT=3000 ./bin/forge run
```

### Development Info Page (Dev Mode Only)

When `FORGE_ENV=development` (or unset), the runtime exposes app info at `/_dev`. Returns 404 in production.

```bash
# Open dashboard in browser
open http://localhost:8080/_dev

# Get app info as JSON
curl http://localhost:8080/_dev/info

# List all routes with access rules
curl http://localhost:8080/_dev/routes

# View entity schema
curl http://localhost:8080/_dev/schema

# Check database status
curl http://localhost:8080/_dev/database

# View WebSocket connections
curl http://localhost:8080/_dev/websocket
```

Available endpoints: `/_dev`, `/_dev/info`, `/_dev/routes`, `/_dev/schema`, `/_dev/actions`, `/_dev/rules`, `/_dev/access`, `/_dev/views`, `/_dev/jobs`, `/_dev/webhooks`, `/_dev/messages`, `/_dev/database`, `/_dev/websocket`, `/_dev/config`

### Testing
```bash
# Run all compiler tests
cd compiler && go test ./...

# Run specific package tests
go test ./internal/lexer/...
go test ./internal/parser/... -v

# Run with coverage
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### SDK Development
```bash
# Install all dependencies (from root)
npm install

# Build SDKs
npm run build:sdk
```

### E2E Testing
```bash
# Run all E2E tests
npm run e2e

# Run E2E with UI
npm run e2e:ui

# Run specific test file
cd e2e && npx playwright test tests/smoke.spec.ts

# Run in debug mode
cd e2e && npx playwright test --debug
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-01-01 | Go for compiler/runtime | Fast compilation, single binary, excellent PostgreSQL support |
| 2024-01-01 | Handwritten lexer/parser | Maximum control over error messages for LSP |
| 2024-01-01 | Pratt parsing for expressions | Clean precedence handling, easy to extend |
| 2024-01-01 | PostgreSQL RLS for access control | Database-enforced, cannot bypass |
| 2024-01-01 | CEL for business rules | Non-Turing complete, sandboxed, auditable |
| 2024-01-01 | chi for HTTP routing | Idiomatic Go, net/http compatible |
| 2024-01-01 | gorilla/websocket for realtime | Battle-tested, hub pattern |
| 2024-01-01 | Compile-time plugins | Maintains sealed runtime guarantee, single binary |

---

## Deployment

FORGE apps deploy as a single Go binary + static frontend.

### What You Deploy

```
myapp/
├── forge                      # Single binary (17MB, no deps)
├── .forge-runtime/
│   └── artifact.json          # Compiled app spec
├── forge.runtime.toml         # Configuration
└── web/dist/                  # Built React frontend
```

### Deployment Steps

```bash
# 1. Build the app
cd projects/myapp
forge build                    # Creates .forge-runtime/
cd web && npm run build        # Creates dist/

# 2. Copy to server
scp -r . user@server:/opt/myapp/
scp /path/to/bin/forge user@server:/opt/myapp/

# 3. On the server - set environment
export FORGE_ENV=production
export DATABASE_URL="postgres://user:pass@localhost/myapp"
export JWT_SECRET="$(openssl rand -hex 32)"

# 4. Apply migrations and run
cd /opt/myapp
./forge migrate -apply
./forge run -port 8080
```

### Production Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FORGE_ENV` | Yes | Set to `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 32+ byte secret for tokens |
| `PORT` | No | Server port (default: 8080) |
| `REDIS_URL` | No | For background jobs |

### Nginx Configuration

```nginx
server {
  listen 443 ssl;
  server_name myapp.example.com;

  # Frontend (static files)
  location / {
    root /opt/myapp/web/dist;
    try_files $uri /index.html;
  }

  # API backend
  location /api/ {
    proxy_pass http://localhost:8080;
  }

  # Auth endpoints
  location /auth/ {
    proxy_pass http://localhost:8080;
  }

  # WebSocket
  location /ws {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

### Systemd Service

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=MyApp FORGE Server
After=network.target postgresql.service

[Service]
Type=simple
User=myapp
WorkingDirectory=/opt/myapp
Environment=FORGE_ENV=production
Environment=DATABASE_URL=postgres://...
Environment=JWT_SECRET=...
ExecStart=/opt/myapp/forge run -port 8080
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable myapp
sudo systemctl start myapp
```

---

## Runtime Plugins

FORGE supports extending the runtime through compile-time plugins. Plugins are Go packages that compile into the runtime binary—they cannot be loaded dynamically at runtime.

### Why Compile-Time?

- **Sealed runtime guarantee** — What you build is what runs
- **Type safety** — Verified at compile time, not discovered in production
- **Single binary** — No runtime dependencies, simpler deployment
- **Security** — No arbitrary code loading at startup

### Provider Types

| Type | Interface | Purpose |
|------|-----------|---------|
| Provider | `provider.Provider` | Base interface (Name, Init) |
| CapabilityProvider | `provider.CapabilityProvider` | Outbound effects (SMS, payments, HTTP) |
| WebhookProvider | `provider.WebhookProvider` | Inbound events (signature validation, event parsing) |

### Built-in Providers

| Provider | Capabilities | Webhooks |
|----------|--------------|----------|
| `generic` | http.get, http.post, http.put, http.delete, http.call | HMAC-SHA256 validation |
| `email` | email.send | - |

### Configuration

```toml
# forge.runtime.toml
[providers.twilio]
account_sid = "env:TWILIO_SID"
auth_token = "env:TWILIO_TOKEN"
from = "+15551234567"

[providers.stripe]
secret_key = "env:STRIPE_SECRET"
webhook_secret = "env:STRIPE_WEBHOOK_SECRET"
```

### Provider Interface Example

```go
// runtime/internal/provider/provider.go

// Provider is the base interface for all providers
type Provider interface {
    Name() string
    Init(config map[string]string) error
}

// CapabilityProvider handles outbound effects (jobs)
type CapabilityProvider interface {
    Provider
    Capabilities() []string
    Execute(ctx context.Context, capability string, data map[string]any) error
}

// WebhookProvider handles inbound events
type WebhookProvider interface {
    Provider
    ValidateSignature(r *http.Request, secret string) error
    ParseEvent(r *http.Request) (eventType string, data map[string]any, err error)
}
```

### Registering Providers

```go
import "github.com/forge-lang/forge/runtime/internal/provider"

func init() {
    provider.Register(&MyProvider{})
}
```

---

## Changelog

### [0.2.0] - 2025-02-02

#### Added
- External integrations system
  - Provider interfaces (`Provider`, `CapabilityProvider`, `WebhookProvider`)
  - Provider registry with compile-time registration
  - Built-in providers: generic HTTP, SMTP email
  - Webhook declaration syntax in .forge files
  - Webhook handler with signature validation and event filtering
  - Data mapping from external events to action inputs
  - Job executor with capability provider lookup
- Webhooks in dev info pages (`/_dev/webhooks`)

### [0.1.0] - 2024-01-01

#### Added
- Complete compiler implementation
  - Lexer with all FORGE tokens
  - Parser with Pratt expression parsing
  - Semantic analyzer with reference validation
  - Normalizer for defaults and implicit effects
  - Planner for action graphs and migrations
  - Emitter for artifacts, SQL, and TypeScript SDK
- Runtime server skeleton
  - HTTP API with chi router
  - WebSocket hub for real-time updates
  - Artifact loading
- TypeScript SDK
  - @forge/client with transport and cache
  - @forge/react with hooks
- Helpdesk example project
  - Complete .forge specification
  - React frontend with Tailwind CSS
- CLI commands: init, check, build, migrate, run, test, lsp
- Comprehensive test suite

---

## Quick Reference: .forge Syntax

```text
# App declaration (auth: password | oauth | jwt | none)
app Helpdesk {
  auth: password
  database: postgres
}

# Entity
entity Ticket {
  subject: string length <= 120
  status: enum(open, pending, closed) = open
  created_at: time
}

# Relation
relation Ticket.author -> User
relation Organization.members -> User many

# Rule
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

# Access
access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}

# Action (must specify creates/updates/deletes)
action create_ticket {
  input: Ticket
  creates: Ticket
}

action close_ticket {
  input: Ticket
  updates: Ticket
}

action delete_ticket {
  input: Ticket
  deletes: Ticket
}

# Message
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}

# Hook
hook Ticket.after_create {
  enqueue notify_agent
}

# Job
job notify_agent {
  input: Ticket
  needs: Ticket.org.members where role == agent
  effect: email.send
}

# View
view TicketList {
  source: Ticket
  fields: subject, status, author.name
}

# Webhook (provider normalizes data - no field mappings needed)
webhook stripe_payments {
  provider: stripe
  events: [payment_intent.succeeded, payment_intent.failed]
  triggers: handle_payment
}

# Test
test Ticket.update {
  given status = closed
  when update Ticket
  expect reject TICKET_CLOSED
}
```

---

## What NOT To Do

1. **Don't add "flexibility"** - FORGE is opinionated by design
2. **Don't bypass the compiler** - No raw SQL, no runtime schema changes
3. **Don't skip tests** - Every feature needs tests
4. **Don't guess on ambiguity** - Ask or check the spec
5. **Don't add layers** - Delete code, don't add abstractions
6. **Don't use string errors** - Always use structured diagnostics

---

## Memory: Key Insights

1. **"Delete 50% of CRUD"** - The founding insight
2. **Compiler + Sealed Runtime** - Not a framework
3. **Intent → Rule → Transition → Effect → Message** - The FORGE flow
4. **Tests as specifications** - If a test fails, either code or spec is wrong
5. **Constraints create better software faster** - Opinionated is a feature
6. **Database enforces invariants** - RLS + generated SQL predicates
7. **Real-time by default** - WebSocket subscriptions for views

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|------------|-----|
| Compiler | Go | Fast, single binary |
| Runtime | Go + chi + pgx | Idiomatic, PostgreSQL-native |
| Database | PostgreSQL + RLS | Enforced access control |
| Rules | CEL | Non-Turing complete, safe |
| Jobs | Asynq | Redis-backed, reliable |
| Frontend SDK | TypeScript | Type-safe generated client |
| React Hooks | @forge/react | useList, useAction |
| E2E Testing | Playwright | Browser automation |

---

## Error Codes Reference

### Lexer Errors (E01xx)
- `E0101` - Unexpected character
- `E0102` - Unterminated string
- `E0103` - Invalid number
- `E0104` - Invalid escape sequence

### Parser Errors (E02xx)
- `E0201` - Unexpected token
- `E0202` - Expected token
- `E0203` - Expected identifier
- `E0207` - Invalid declaration

### Semantic Errors (E03xx)
- `E0301` - Undefined entity
- `E0302` - Undefined field
- `E0305` - Undefined message
- `E0306` - Undefined job
- `E0308` - Duplicate entity
- `E0312` - Type mismatch
- `E0314` - Circular dependency

---

## Sources

- [FORGE_SPEC.md](./FORGE_SPEC.md) - Authoritative specification
- [HOW_FORGE_WAS_CONCIEVED.html](./HOW_FORGE_WAS_CONCIEVED.html) - Origin and philosophy
- [Go Standard Library](https://pkg.go.dev/std)
- [chi Router](https://github.com/go-chi/chi)
- [pgx PostgreSQL Driver](https://github.com/jackc/pgx)
- [CEL Expression Language](https://github.com/google/cel-go)
