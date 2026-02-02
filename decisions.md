# FORGE - Decision Log

> This document records all architectural and implementation decisions made during FORGE development.

---

## Decision 001: Development Info Page Feature

**Date:** 2026-02-02
**Context:** Developers need visibility into their FORGE application during development, similar to Rails' `/rails/info` pages.
**Decision:** Implement a dev-only info page at `/_dev` routes, available only when `FORGE_ENV=development`.

### What Rails Provides (Inspiration)
- `/rails/info/routes` - Searchable route table
- `/rails/info/properties` - Environment info (Ruby, Rails, Rack versions, middleware, database)
- `/rails/mailers` - Email previews
- Debug error pages with full context

### FORGE-Specific Additions
Unlike Rails, FORGE has compiled artifacts with rich metadata. We expose:
- Entities with fields, relations, and constraints
- Actions with associated rules and hooks
- Business rules (forbid/require) with SQL predicates
- Access control policies (SQL and CEL expressions)
- Views with dependencies
- Jobs and hooks
- Message codes

**Rationale:**
- FORGE's compiled artifacts contain comprehensive metadata not available at runtime in traditional frameworks
- Developers need quick access to understand their app's structure during development
- Debugging access control and business rules requires seeing the compiled SQL/CEL expressions

---

## Decision 002: Dev Info Page Routes

**Date:** 2026-02-02
**Context:** Need to define the URL structure for dev info endpoints.
**Decision:** Use `/_dev` prefix with structured sub-routes.

**Routes:**
```
GET /_dev                    # Dashboard with links to all info pages
GET /_dev/info               # App metadata and environment
GET /_dev/routes             # All API routes (like Rails)
GET /_dev/schema             # Entities, fields, relations
GET /_dev/actions            # Actions with rules and hooks
GET /_dev/rules              # Business rules with SQL predicates
GET /_dev/access             # Access control policies
GET /_dev/views              # View definitions and dependencies
GET /_dev/jobs               # Background jobs and hooks
GET /_dev/messages           # Message codes and defaults
GET /_dev/database           # Database status, migration version
GET /_dev/websocket          # WebSocket connection stats
GET /_dev/config             # Runtime configuration (secrets masked)
```

**Rationale:**
- `/_dev` prefix clearly indicates development-only
- Underscore prefix prevents collision with user-defined entities
- Structured routes allow linking directly to specific sections
- JSON responses enable both human viewing and tooling

---

## Decision 003: Development Mode Detection

**Date:** 2026-02-02
**Context:** Dev info pages must NEVER be accessible in production.
**Decision:** Check `FORGE_ENV` environment variable, default to `development`.

**Implementation:**
```go
func isDevMode() bool {
    env := os.Getenv("FORGE_ENV")
    return env == "" || env == "development"
}
```

**Security guarantees:**
- Routes return 404 in production (not 403, to avoid information leakage)
- No configuration option to enable in production
- Middleware check before any dev route handler

**Rationale:**
- Simple and secure
- Same pattern as existing `FORGE_ENV` usage for config overrides
- 404 prevents attackers from knowing the feature exists

---

## Decision 004: Info Page Output Format

**Date:** 2026-02-02
**Context:** Need to decide between HTML, JSON, or both for dev info pages.
**Decision:** Return JSON by default, HTML when `Accept: text/html` header is present.

**JSON Response:**
- Machine-readable for tooling
- Consistent with existing API endpoints
- Easy to pipe to `jq` for CLI exploration

**HTML Response:**
- Human-readable with styling
- Searchable/filterable tables (client-side JS)
- Syntax highlighting for SQL/CEL expressions
- Self-contained (no external dependencies)

**Rationale:**
- JSON-first aligns with FORGE's API-centric design
- HTML provides developer-friendly browsing experience
- Content negotiation is HTTP best practice

---

## Decision 005: Secret Masking in Config Page

**Date:** 2026-02-02
**Context:** Config page shows runtime configuration, which may include secrets.
**Decision:** Mask any value from `env:` prefix and known secret patterns.

**Masking rules:**
1. Values from `env:` prefix → show "***" with env var name
2. Fields matching patterns: `*_secret`, `*_key`, `*_password`, `*_token` → "***"
3. Database URLs → mask password portion only

**Example output:**
```json
{
  "database": {
    "adapter": "postgres",
    "url": "postgres://user:***@host:5432/db"
  },
  "auth": {
    "jwt": {
      "secret": "*** (from env:JWT_SECRET)",
      "expiry_hours": 24
    }
  }
}
```

**Rationale:**
- Protects secrets while showing configuration structure
- Developers can verify which secrets are configured
- URL masking preserves debugging value (host, port, database name visible)

---

## Decision 006: Schema Display Format

**Date:** 2026-02-02
**Context:** How to present entity schema information.
**Decision:** Hierarchical display with expandable sections.

**Structure per entity:**
```
Entity: Ticket
├── Table: tickets
├── Fields:
│   ├── id: uuid (PK)
│   ├── subject: string (max: 120)
│   ├── status: enum(open, pending, closed) = "open"
│   └── created_at: time
├── Relations:
│   ├── author -> User (FK: author_id)
│   └── org -> Organization (FK: org_id)
└── Access:
    ├── read: user in org.members
    └── write: user == author or user.role == agent
```

**JSON format:**
```json
{
  "entities": {
    "Ticket": {
      "table": "tickets",
      "fields": [...],
      "relations": [...],
      "access": {...}
    }
  }
}
```

**Rationale:**
- Hierarchical structure matches mental model
- All information about an entity in one place
- Access rules shown in context (not separate page navigation needed)

---

## Decision 007: Route Listing Format

**Date:** 2026-02-02
**Context:** How to display available API routes.
**Decision:** Table format similar to Rails, with FORGE-specific additions.

**Columns:**
| Method | Path | Handler | Access |
|--------|------|---------|--------|
| POST | /api/actions/create_ticket | Action | user in org.members |
| GET | /api/views/TicketList | View | user in org.members |
| GET | /api/entities/Ticket | Entity | read: user in org.members |

**FORGE additions vs Rails:**
- Access column shows applicable access rule
- Entity routes grouped (list, get, create, update, delete)
- WebSocket endpoint included

**Rationale:**
- Familiar format for Rails developers
- Access rules immediately visible
- Helps debug "why can't I access this?" issues

---

## Decision 008: Live Stats Display

**Date:** 2026-02-02
**Context:** Developers want to see real-time information about their running app.
**Decision:** Include live statistics with auto-refresh option.

**WebSocket stats:**
- Connected clients count
- Subscriptions by view
- Messages sent/received

**Database stats:**
- Connection pool (active/idle/max)
- Migration version
- Query count (since startup)

**Jobs stats (if configured):**
- Queue depth
- Active workers
- Failed job count

**Implementation:**
- JSON endpoint returns current stats
- HTML page has optional auto-refresh (5s interval)
- No heavy polling - stats are cheap to compute

**Rationale:**
- Visibility into runtime behavior
- Helps debug connection leaks, stuck jobs
- Low overhead for development use

---

## Decision 009: Error Context on Dev Error Pages

**Date:** 2026-02-02
**Context:** When errors occur in development, provide maximum debugging context.
**Decision:** Enhanced error responses in development mode.

**Production error:**
```json
{
  "status": "error",
  "messages": [{"code": "INTERNAL_ERROR", "message": "An error occurred"}]
}
```

**Development error:**
```json
{
  "status": "error",
  "messages": [{"code": "INTERNAL_ERROR", "message": "An error occurred"}],
  "_dev": {
    "error": "pq: column \"nonexistent\" does not exist",
    "stack": ["server.go:123", "handlers.go:45"],
    "query": "SELECT nonexistent FROM tickets WHERE ...",
    "request": {
      "method": "POST",
      "path": "/api/actions/create_ticket",
      "body": {...}
    }
  }
}
```

**Rationale:**
- Maximum context for debugging
- Query shown helps debug SQL issues
- Request body helps reproduce issues
- Never shown in production (security)

---

## Decision 010: Documentation Structure

**Date:** 2026-02-02
**Context:** Where to document the dev info page feature.
**Decision:** Create dedicated `docs/dev-info.md` file.

**Rationale:**
- Feature is large enough for its own doc
- Keeps runtime-reference.md focused on production concerns
- Easier to find for developers looking for dev tools

---

## Decision 011: No Authentication on Dev Routes

**Date:** 2026-02-02
**Context:** Should dev info pages require authentication?
**Decision:** No authentication required for `/_dev` routes in development mode.

**Rationale:**
- Development environments typically run on localhost
- Simplifies debugging (no token needed to browse)
- FORGE_ENV check is the security boundary
- Same approach as Rails

---

## Decision 012: Artifact Diff Display

**Date:** 2026-02-02
**Context:** Developers may want to see what changed between builds.
**Decision:** Include optional artifact diff showing changes from previous build.

**Implementation:**
- Store previous artifact hash
- On `/_dev/changes`, show diff since last build
- Highlight: new entities, modified rules, changed access policies

**Rationale:**
- Helps track what changed during development
- Useful for reviewing before deployment
- Low overhead (just store one extra JSON file)

---

## Decision 013: Implementation Complete

**Date:** 2026-02-02
**Context:** Dev info page feature fully implemented.
**Decision:** Feature is now live in the runtime.

**Files created/modified:**
- `runtime/internal/server/devinfo.go` - All dev info handlers
- `runtime/internal/server/server.go` - Added `setupDevRoutes()` call
- `runtime/internal/server/websocket.go` - Added `ClientCount()` and `SubscriptionCounts()` methods

**Endpoints implemented:**
| Route | Status |
|-------|--------|
| `/_dev` | Dashboard with stats and quick links |
| `/_dev/info` | App metadata and runtime info |
| `/_dev/routes` | All API routes with access rules |
| `/_dev/schema` | Entity definitions |
| `/_dev/actions` | Action definitions |
| `/_dev/rules` | Business rules with SQL predicates |
| `/_dev/access` | Access control policies |
| `/_dev/views` | View definitions |
| `/_dev/jobs` | Jobs and hooks |
| `/_dev/messages` | Message codes |
| `/_dev/database` | Database status |
| `/_dev/websocket` | WebSocket stats |
| `/_dev/config` | Masked configuration |

**Features:**
- JSON response by default
- HTML response with `Accept: text/html` header
- Dark theme UI matching GitHub style
- Searchable routes table
- Secret masking in config
- Only enabled when `FORGE_ENV=development` (or unset)

---

## Future Decisions

Reserved for additional decisions made during implementation.
