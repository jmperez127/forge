# FORGE - AI Development Guide

> **FORGE compiles application intent (data + rules + access + views) into a sealed runtime that cannot violate your business logic.**

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
│   ├── cmd/
│   │   └── forge/main.go      # CLI entry point
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
│   │   └── forge-runtime/     # Runtime binary
│   └── internal/
│       ├── server/            # HTTP + WebSocket server
│       ├── provider/          # Provider interfaces and registry
│       │   └── builtin/       # Built-in providers (HTTP, email)
│       ├── jobs/              # Job executor
│       └── config/            # Runtime configuration
│
├── sdk/
│   └── typescript/
│       ├── client/            # @forge/client
│       └── react/             # @forge/react
│
├── projects/                  # Real test applications
│   └── helpdesk/              # Example: Ticket system
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

## App Development Rules

When implementing applications using FORGE (in `projects/` folder):

1. **DO NOT modify the FORGE runtime or compiler** to accommodate app-specific needs. The runtime must remain generic.

2. **If you hit a limitation**, ask the user for directions before making changes to FORGE. We need to discuss whether:
   - The limitation should be addressed in FORGE (making it generic for all apps)
   - There's a workaround within the existing constructs
   - The app design should be adjusted

3. **App-specific code belongs in the app**, not in the runtime. Things like typing indicators, presence, and custom UI logic should be implemented in the app's frontend code using the generic primitives FORGE provides.

4. **The SDK (client.ts, react.tsx) in each app** can have app-specific extensions, but changes that would benefit all apps should be discussed first.

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

## Common Commands

### Build & Run
```bash
# Build compiler
cd compiler && go build -o ../bin/forge ./cmd/forge

# Build runtime
cd runtime && go build -o ../bin/forge-runtime ./cmd/forge-runtime

# Run CLI commands
./bin/forge init myapp
./bin/forge check
./bin/forge build
./bin/forge dev
./bin/forge run

# Build helpdesk example
cd projects/helpdesk/spec && ../../../bin/forge build
```

### Development Mode (Hot Reload)

```bash
# Start development server with hot reload
cd projects/helpdesk/spec
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
# App declaration
app Helpdesk {
  auth: oauth
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

# Action
action close_ticket {
  input: Ticket
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
