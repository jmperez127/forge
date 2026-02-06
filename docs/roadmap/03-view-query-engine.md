# View Query Engine -- Implementation Roadmap

> **Status**: Proposed
> **Author**: Principal Engineer Review
> **Date**: 2026-02-05
> **Scope**: Compiler (`planner/`, `emitter/`) and Runtime (`server/handlers.go`, new `query/` package)

---

## 1. Current State Assessment

### What the view handler does now

The `handleView` function in `runtime/internal/server/handlers.go` (line 526) looks up the view in the artifact, resolves the source entity, and calls `buildViewQuery`. That method (line 582) returns:

```go
func (s *Server) buildViewQuery(view *ViewSchema, entity *EntitySchema) string {
    return fmt.Sprintf("SELECT * FROM %s", entity.Table)
}
```

This means **every view query today**:
- Selects **all columns** (`SELECT *`) regardless of the `fields` declaration
- Performs **zero JOINs**, so `author.name` and `org.name` fields are silently missing from results
- Applies **no filtering**, sorting, or pagination
- Ignores **client-supplied query parameters** entirely
- Returns **no pagination metadata** (no total count, no cursors)
- Does pass through RLS because `getAuthenticatedDB` sets `app.user_id`, but views with relation-based access paths (e.g., `user in org.members`) depend on the RLS policies already being applied via the migration -- the view handler itself adds no additional WHERE clauses

### What the compiler produces now

The planner (`compiler/internal/planner/planner.go`, `planViews` at line 246) creates a `ViewNode` with:
- `Source`, `Fields`, `Dependencies`, and a `Query` string
- `generateViewQuery` (line 282) emits `SELECT field1, field2 FROM table` but **does not resolve dotted paths** (e.g., `author.name` is emitted literally as the string `"author.name"`, which is not valid SQL)
- `calculateViewDependencies` (line 264) has a stub that recognizes dotted fields may reference other entities but **does nothing** with that information

The `ViewSchema` in the artifact (emitter, line 94) carries `Fields []string` and `Query string`, but the query is incomplete.

### What it should do

A view like:

```text
view TicketList {
  source: Ticket
  fields: subject, status, priority, author.name, assignee.name
}
```

Should produce a query equivalent to:

```sql
SELECT
  t.id,
  t.subject,
  t.status,
  t.priority,
  u_author.name AS "author.name",
  u_assignee.name AS "assignee.name"
FROM tickets t
LEFT JOIN users u_author ON u_author.id = t.author_id
LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
ORDER BY t.created_at DESC
LIMIT 50
```

And the HTTP response should include pagination cursors, total count, and support client-supplied filters and sort overrides.

---

## 2. Query Architecture

### Compilation flow

```
.forge view declaration
    |
    v
Parser -> ViewDecl { Name, Source, Fields[] }
    |
    v
Analyzer -> Validates source entity exists, validates field paths
            (including dotted paths through relations)
    |
    v
Normalizer -> NormalizedView { Name, Source, Fields[], Filter?, Sort?, Dependencies[] }
    |
    v
Planner -> ViewNode with:
           - Resolved JoinPlan[] (table, alias, join condition, join type)
           - Resolved SelectColumn[] (expression, alias)
           - Static WHERE clause (from view-level filter)
           - Default ORDER BY
           - Dependency list (all tables touched)
    |
    v
Emitter -> ViewSchema in artifact with:
           - Pre-built SQL template (parameterized)
           - Join metadata (for runtime query builder to add dynamic WHERE)
           - Field type info (for cursor encoding)
    |
    v
Runtime -> Query builder applies:
           - Client filters (validated against declared fields)
           - Client sort (validated against declared fields)
           - Cursor-based pagination
           - RLS (via SET LOCAL app.user_id)
```

### Key design decision: compile-time SQL vs runtime query builder

The compiler should produce a **query plan** (joins, projections, static filters), not a final SQL string. The runtime query builder assembles the final SQL from the plan plus client-supplied parameters. This keeps the compiler deterministic while allowing the runtime to add pagination and dynamic filters safely.

The artifact `ViewSchema` will be extended to carry structured query metadata rather than a raw SQL string.

---

## 3. Implementation Plan

### Phase 1: Core Query Generation (compiler + runtime)

- [ ] **TODO 1: Extend ViewSchema with structured query plan**

  File: `compiler/internal/emitter/emitter.go`
  File: `runtime/internal/server/server.go` (Artifact types)

  ```go
  type ViewSchema struct {
      Name         string      `json:"name"`
      Source       string      `json:"source"`
      SourceTable  string      `json:"source_table"`
      Fields       []ViewField `json:"fields"`
      Joins        []ViewJoin  `json:"joins"`
      Filter       string      `json:"filter,omitempty"`
      DefaultSort  []ViewSort  `json:"default_sort,omitempty"`
      Dependencies []string    `json:"dependencies"`
  }

  type ViewField struct {
      Name       string `json:"name"`
      Column     string `json:"column"`
      Alias      string `json:"alias"`
      Type       string `json:"type"`
      Filterable bool   `json:"filterable"`
      Sortable   bool   `json:"sortable"`
  }

  type ViewJoin struct {
      Table string `json:"table"`
      Alias string `json:"alias"`
      On    string `json:"on"`
      Type  string `json:"type"`
  }

  type ViewSort struct {
      Column    string `json:"column"`
      Direction string `json:"direction"`
  }
  ```

- [ ] **TODO 2: Field projection -- SELECT only declared fields**

  File: `compiler/internal/planner/planner.go`

  Resolve each field to a concrete SQL expression. Simple fields become `t.field`, dotted fields require JOIN resolution. Always include `t.id` for cursor pagination.

  ```go
  func (p *Planner) resolveViewField(
      field, sourceEntity, sourceAlias string,
  ) (*ResolvedField, *ResolvedJoin) {
      parts := strings.Split(field, ".")
      if len(parts) == 1 {
          return &ResolvedField{
              Name: field, Column: fmt.Sprintf("%s.%s", sourceAlias, field), Alias: field,
          }, nil
      }
      relName, targetField := parts[0], parts[1]
      relKey := fmt.Sprintf("%s.%s", sourceEntity, relName)
      rel, exists := p.scope.Relations[relKey]
      if !exists {
          p.diag.AddErrorAt(diag.Range{}.Start, "E0302",
              fmt.Sprintf("undefined relation %s on %s in view field %s", relName, sourceEntity, field))
          return nil, nil
      }
      targetTable := p.tableName(rel.ToEntity)
      joinAlias := fmt.Sprintf("j_%s", relName)
      return &ResolvedField{
          Name: field, Column: fmt.Sprintf("%s.%s", joinAlias, targetField), Alias: field,
      }, &ResolvedJoin{
          Table: targetTable, Alias: joinAlias,
          On: fmt.Sprintf("%s.id = %s.%s_id", joinAlias, sourceAlias, relName), Type: "LEFT",
      }
  }
  ```

- [ ] **TODO 3: JOIN generation for relation fields**

  File: `compiler/internal/planner/planner.go`

  Build deduplicated join list. Multiple fields on the same relation (e.g., `author.display_name` and `author.avatar_url`) share one join, keyed by alias.

- [ ] **TODO 4: Runtime query builder**

  New file: `runtime/internal/query/builder.go`

  Assembles final SQL from ViewSchema + client Params. Handles SELECT, FROM, JOINs, WHERE (static + dynamic), ORDER BY, and LIMIT (with +1 for has_next detection). Also builds a parallel COUNT query.

### Phase 2: Filtering, Sorting, Pagination

- [ ] **TODO 5: WHERE clause from static view filters**

  Extend `.forge` syntax with `filter:` clause in views. Compiler changes across ast, parser, normalizer, planner, and emitter. `param.*` references become runtime parameters.

- [ ] **TODO 6: Client-side filter parameters**

  Parse HTTP query params: `filter[field]=value`, `filter[field][op]=value`, `sort=-field`, `limit=N`, `cursor=opaque`, `param.key=value`. Validate all fields against the view's declared filterable/sortable fields.

- [ ] **TODO 7: ORDER BY from sort declarations**

  View-level default sort, client override, always append `id` as tiebreaker for cursor stability.

- [ ] **TODO 8: Cursor-based pagination**

  New file: `runtime/internal/query/cursor.go`. Encode last row's sort values into opaque base64 cursor. Decode into `(col1, col2) > ($1, $2)` row-value comparison. Stable under inserts/deletes, O(1) for any page.

### Phase 3: Access Control and Real-time

- [ ] **TODO 9: Access control integration**

  RLS is primary mechanism (already works via `SET LOCAL app.user_id`). Add optional view-level access check. Validate at compile time that all view-referenced entities have access rules.

- [ ] **TODO 10: Real-time view subscriptions**

  Replace hardcoded entity-to-view broadcast mapping with generic dependency-based invalidation. When entity mutates, find all views with that entity in `Dependencies`, broadcast invalidation. Client re-fetches.

- [ ] **TODO 11: Count queries for pagination metadata**

  Only run when `include=count`. Mirror FROM/JOINs/WHERE, replace SELECT with `COUNT(*)`, omit ORDER/LIMIT. Cache with short TTL for high-traffic views.

---

## 4. SQL Generation Examples

### Example 1: Simple view (no joins)

```text
view WorkspaceList { source: Workspace, fields: id, name, slug }
```
```sql
SELECT t.id AS "id", t.name AS "name", t.slug AS "slug"
FROM workspaces t
ORDER BY t.created_at DESC, t.id DESC
LIMIT 51
```

### Example 2: View with relation JOINs

```text
view TicketList { source: Ticket, fields: subject, status, priority, author.name, assignee.name }
```
```sql
SELECT t.id AS "id", t.subject AS "subject", t.status AS "status", t.priority AS "priority",
       j_author.name AS "author.name", j_assignee.name AS "assignee.name"
FROM tickets t
LEFT JOIN users j_author ON j_author.id = t.author_id
LEFT JOIN users j_assignee ON j_assignee.id = t.assignee_id
ORDER BY t.created_at DESC, t.id DESC
LIMIT 51
```

### Example 3: Client filters + cursor

```
GET /api/views/TicketList?filter[status]=open&filter[priority]=high&sort=-created_at&limit=25&cursor=eyJ2...
```
```sql
SELECT t.id AS "id", t.subject AS "subject", t.status AS "status", t.priority AS "priority",
       j_author.name AS "author.name", j_assignee.name AS "assignee.name"
FROM tickets t
LEFT JOIN users j_author ON j_author.id = t.author_id
LEFT JOIN users j_assignee ON j_assignee.id = t.assignee_id
WHERE t.status = $1 AND t.priority = $2 AND (t.created_at, t.id) < ($3, $4)
ORDER BY t.created_at DESC, t.id DESC
LIMIT $5
-- Args: ["open", "high", "2024-01-15T12:00:00Z", "abc-123", 26]
```

### Example 4: Static filter with param

```text
view OrganizationTickets { source: Ticket, fields: subject, status, filter: org == param.org_id }
```
```
GET /api/views/OrganizationTickets?param.org_id=550e8400-...
```
```sql
SELECT t.id AS "id", t.subject AS "subject", t.status AS "status"
FROM tickets t
WHERE t.org_id = $1
ORDER BY t.created_at DESC, t.id DESC
LIMIT 51
-- Args: ["550e8400-..."]
```

### Example 5: Deduplicated join

```text
view MessageFeed { source: Message, fields: content, author.display_name, author.avatar_url }
```
```sql
SELECT t.id AS "id", t.content AS "content",
       j_author.display_name AS "author.display_name",
       j_author.avatar_url AS "author.avatar_url"
FROM messages t
LEFT JOIN users j_author ON j_author.id = t.author_id
ORDER BY t.created_at DESC, t.id DESC
LIMIT 51
-- Only ONE join to users, not two
```

### Example 6: RLS-enforced access

```text
view CommentThread { source: Comment, fields: body, author.name, internal, created_at }
-- access Comment { read: user in ticket.org.members } is enforced by RLS policy
```
```sql
SELECT t.id AS "id", t.body AS "body", j_author.name AS "author.name",
       t.internal AS "internal", t.created_at AS "created_at"
FROM comments t
LEFT JOIN users j_author ON j_author.id = t.author_id
ORDER BY t.created_at ASC, t.id ASC
LIMIT 51
-- RLS policy on comments table handles ticket.org.members check
```

---

## 5. API Design

### HTTP endpoint

```
GET /api/views/{viewName}
```

### Query parameters

| Parameter | Format | Description |
|-----------|--------|-------------|
| `filter[field]` | `filter[status]=open` | Equality filter |
| `filter[field][op]` | `filter[created_at][gte]=2024-01-01` | Operator filter |
| `sort` | `sort=-created_at,priority` | Sort (prefix `-` for DESC) |
| `limit` | `limit=25` | Page size (1-100, default 50) |
| `cursor` | `cursor=eyJ...` | Pagination cursor |
| `param.key` | `param.org_id=uuid` | View parameter |
| `include` | `include=count` | Include total count |

### Filter operators

| Op | URL | SQL |
|----|-----|-----|
| eq | `filter[status]=open` | `= $N` |
| neq | `filter[status][neq]=closed` | `<> $N` |
| gt | `filter[priority][gt]=medium` | `> $N` |
| gte | `filter[created_at][gte]=2024-01-01` | `>= $N` |
| lt | `filter[created_at][lt]=2024-02-01` | `< $N` |
| lte | `filter[priority][lte]=high` | `<= $N` |
| like | `filter[subject][like]=billing` | `ILIKE '%' \|\| $N \|\| '%'` |
| in | `filter[status][in]=open,pending` | `IN ($N, $M)` |
| is_null | `filter[assignee][is_null]=true` | `IS NULL` |

### Response format

```json
{
  "status": "ok",
  "data": {
    "items": [
      { "id": "...", "subject": "Cannot login", "status": "open", "author.name": "Alice" }
    ],
    "pagination": {
      "limit": 25,
      "has_next": true,
      "has_prev": false,
      "next_cursor": "eyJ2Ijp7...",
      "prev_cursor": null,
      "total": 142
    }
  }
}
```

- `total` only present when `include=count`; otherwise `null`
- `has_next` detected by fetching `limit+1` rows
- `has_prev` is `true` when cursor was provided
- NULL joined fields (e.g., unassigned ticket) return `null`

### Error responses

| Code | Condition |
|------|-----------|
| `INVALID_FILTER` | Filter on non-filterable or nonexistent field |
| `INVALID_SORT` | Sort on non-sortable field |
| `INVALID_CURSOR` | Malformed or expired cursor |
| `MISSING_PARAM` | Required view parameter not provided |
| `INVALID_LIMIT` | Limit outside 1-100 range |

### Empty state

```json
{ "status": "ok", "data": { "items": [], "pagination": { "limit": 50, "has_next": false, "has_prev": false, "next_cursor": null, "prev_cursor": null, "total": null } } }
```

---

## 6. Performance

### Index recommendations

1. **FK columns** (already done): B-tree index on every `_id` column
2. **Sort column**: `CREATE INDEX idx_{table}_created_at_desc ON {table} (created_at DESC);`
3. **Cursor composite**: `CREATE INDEX idx_{table}_cursor ON {table} (created_at DESC, id DESC);`
4. **Static filter partial**: `CREATE INDEX idx_{table}_{filter} ON {table} (created_at DESC, id DESC) WHERE {condition};`
5. **Enum filter columns**: `CREATE INDEX idx_{table}_{column} ON {table} ({column});`

### N+1 prevention

Structurally impossible: all relation fields resolve to JOINs at compile time. Exactly one query per view request. No lazy loading.

### Query plan analysis

Log queries >100ms in dev mode. Expose per-view timing at `/_dev/views`.

### Connection pooling

pgx pool (default 20). RLS queries use BEGIN/SET LOCAL/COMMIT per request. Increase pool_size for high traffic.

### Aggregation views

Out of scope. Architecture supports it via arbitrary expressions in `ViewField.Column`.

---

## 7. Verification Checklist

- [ ] Compiler emits valid SQL for simple field views (no joins)
- [ ] Compiler emits valid SQL for views with one relation join
- [ ] Compiler emits valid SQL for views with multiple joins to same table (different aliases)
- [ ] Compiler deduplicates joins for multiple fields on same relation
- [ ] Compiler rejects undefined entities/fields (E0301/E0302)
- [ ] Compiler always includes `id` in SELECT for cursor support
- [ ] Runtime returns `{ items, pagination }` format
- [ ] Runtime parses `filter[field]=value` correctly
- [ ] Runtime parses `filter[field][op]=value` correctly
- [ ] Runtime rejects non-filterable fields (`INVALID_FILTER`)
- [ ] Runtime parses `sort=-field,field` correctly
- [ ] Runtime rejects non-sortable fields (`INVALID_SORT`)
- [ ] Cursor encode/decode round-trip is stable
- [ ] Cursor pagination produces non-overlapping pages
- [ ] `has_next` correct on last page vs middle page
- [ ] Empty views return correct structure
- [ ] RLS filters results per authenticated user
- [ ] Count query correct when `include=count`
- [ ] Count query skipped when not requested
- [ ] `param.*` validation (`MISSING_PARAM`)
- [ ] WebSocket invalidation fires on dependency mutation
- [ ] Slow query logging in dev mode
- [ ] All SQL parameterized (no user input interpolation)
- [ ] Integration test with real PostgreSQL passes
- [ ] E2E test passes
- [ ] SDK updated for new response format

---

## Appendix A: Migration Path

Current `handleView` returns flat array. New format is `{ items, pagination }`. Breaking change requires:
1. Runtime returns new format
2. SDK client expects new format
3. React `useList` unwraps `data.items`
4. `X-Forge-View-Version: 2` header for detection
5. `?format=legacy` param during transition

## Appendix B: File Inventory

**New files**: `runtime/internal/query/builder.go`, `cursor.go`, `params.go`, `builder_test.go`, `cursor_test.go`, `integration_test.go`

**Modified files**: `compiler/internal/ast/ast.go`, `parser/parser.go`, `analyzer/analyzer.go`, `normalizer/normalizer.go`, `planner/planner.go`, `planner/planner_test.go`, `emitter/emitter.go`, `runtime/internal/server/server.go`, `server/handlers.go`, `server/websocket.go`, `sdk/typescript/client/`, `sdk/typescript/react/`

## Appendix C: Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Field projection, JOINs, query builder | 3-4 days |
| Phase 2: Filters, sort, cursor pagination | 3-4 days |
| Phase 3: Access control, real-time, count | 2-3 days |
| Testing: unit, integration, E2E | 2-3 days |
| SDK update | 1-2 days |
| **Total** | **11-16 days** |
