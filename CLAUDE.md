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
│       └── server/            # HTTP + WebSocket server
│
├── sdk/
│   └── typescript/
│       ├── client/            # @forge/client
│       └── react/             # @forge/react
│
├── projects/                  # Real test applications
│   └── helpdesk/              # Example: Ticket system
│
└── e2e/                       # End-to-end tests
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
./bin/forge run

# Build helpdesk example
cd projects/helpdesk/spec && ../../../bin/forge build
```

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
# Install SDK dependencies
cd sdk/typescript/client && npm install
cd sdk/typescript/react && npm install

# Build SDKs
npm run build
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

---

## Changelog

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
