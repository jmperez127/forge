# Roadmap: Rule Enforcement & Access Control

**Priority:** P0 -- Without this, FORGE's core guarantee ("rules cannot be bypassed") is a lie.

**Status:** Not started

**Estimated effort:** 3-4 weeks (1 engineer, full-time)

---

## 1. Current State Assessment

### What the compiler produces (working correctly)

The compiler pipeline (normalizer -> planner -> emitter) generates everything needed for enforcement:

| Artifact field | Example (Helpdesk) | Source |
|---|---|---|
| `rules[].condition` (CEL) | `status == closed` | `normalizer.go:343` |
| `rules[].sql_predicate` | `NOT ((status == closed))` | `planner.go:671-679` |
| `rules[].emit_code` | `TICKET_CLOSED` | `normalizer.go:347` |
| `rules[].is_forbid` | `true` | `normalizer.go:339` |
| `access[].read_sql` | `current_setting('app.user_id')::uuid IN (SELECT members_id FROM organizations WHERE id = org_id)` | `normalizer.go:365` |
| `access[].write_sql` | `((current_setting('app.user_id')::uuid = author_id) OR ...)` | `normalizer.go:369-370` |
| `access[].read_cel` | `user in org.members` | `normalizer.go:364` |
| `access[].write_cel` | `((user == author) \|\| (user.role == agent))` | `normalizer.go:369` |
| `messages[].code/level/default` | `TICKET_CLOSED / error / "This ticket is already closed."` | emitter |
| Migration RLS policies | `CREATE POLICY ... USING (read_sql) WITH CHECK (write_sql)` | emitter (lines 424-441) |

The compiler is doing its job. The SQL predicates are syntactically valid PostgreSQL. The CEL expressions are well-formed. The RLS policies are emitted. None of this matters because the runtime ignores all of it.

### What the runtime does NOT do (10 critical gaps)

**Gap 1: No rule evaluation on actions**
- File: `runtime/internal/server/handlers.go:640-656`
- `handleAction()` dispatches to `executeCreateAction` / `executeUpdateAction` / `executeDeleteAction` with zero rule checking. The artifact's `rules[]` array is never consulted.
- Impact: `forbid if status == closed emit TICKET_CLOSED` does nothing. A closed ticket can be updated.

**Gap 2: No CEL dependency in runtime**
- File: `runtime/go.mod` -- no `github.com/google/cel-go` anywhere
- The runtime cannot evaluate CEL expressions even if it wanted to. The dependency does not exist.

**Gap 3: AccessSchema missing ReadCEL/WriteCEL fields**
- File: `runtime/internal/server/server.go:124-129`
- The runtime's `AccessSchema` struct only has `ReadSQL` and `WriteSQL`. The emitter outputs `read_cel` and `write_cel` (see `compiler/internal/emitter/emitter.go:90-91`), but they are silently dropped during JSON unmarshaling because the struct has no corresponding fields.

**Gap 4: No access SQL injection in list/get queries**
- File: `runtime/internal/server/handlers.go:134`
- `handleList()` does `SELECT * FROM {table}` with no WHERE clause. The `access[entity].read_sql` is never appended.
- File: `runtime/internal/server/handlers.go:191`
- `handleGet()` does `SELECT * FROM {table} WHERE id = $1` -- no access predicate.

**Gap 5: No access SQL injection in view queries**
- File: `runtime/internal/server/handlers.go:582-585`
- `buildViewQuery()` returns `SELECT * FROM {table}` with no WHERE clause and no join to check access.

**Gap 6: No write-access check on mutations**
- `handleCreate()`, `handleUpdate()`, `handleDelete()` (lines 232-523) never check `access[entity].write_sql` before executing.

**Gap 7: No transaction wrapping for action execution**
- `executeCreateAction` (line 659), `executeUpdateAction` (line 836), `executeDeleteAction` (line 915) each call `database.Query()` or `database.Exec()` directly. There is no `Begin()`/`Commit()`/`Rollback()` wrapping. This means a multi-step action (fetch -> check rules -> mutate -> trigger hooks) is not atomic.

**Gap 8: No message emission on rule violations**
- The `messages` map in the artifact (e.g., `TICKET_CLOSED -> "This ticket is already closed."`) is never looked up. When a rule violation should occur, the runtime returns generic errors like `UPDATE_FAILED` instead of the domain-specific message code.

**Gap 9: Webhook actions bypass all checks**
- File: `runtime/internal/server/handlers.go:1272-1331`
- `executeWebhookAction()` runs `s.db.Query()` directly (not even `s.getAuthenticatedDB()`). Comment on line 1048 says "rules are evaluated" but they are not.

**Gap 10: API routes have no auth gating**
- File: `runtime/internal/server/server.go:354-370`
- The `/api/*` route group does not use `s.requireAuth` middleware. Any unauthenticated request reaches the handlers. While RLS should be the final safety net (it relies on `app.user_id` being set), without authentication middleware the GUC is never set, and `current_setting('app.user_id')` without `missing_ok` returns an error rather than restricting access gracefully.

---

## 2. Architecture Design

### Enforcement Model: Belt and Suspenders

FORGE enforces rules at two independent layers. Either layer alone is sufficient; both together provide defense in depth.

```
                       HTTP Request
                            |
                    [Auth Middleware]         <-- Extract user, reject if missing when auth required
                            |
                    [Access Gate]            <-- Application-level: CEL eval of read/write access
                            |
                    [BEGIN Transaction]      <-- Single Postgres transaction for entire action
                            |
                    [SET LOCAL app.user_id]  <-- RLS context
                            |
                    [SELECT ... FOR UPDATE]  <-- Lock target row (updates/deletes)
                            |
                    [Rule Evaluation]        <-- CEL eval of rule conditions against current state
                            |
                    [Mutate]                 <-- INSERT/UPDATE/DELETE
                            |
                    [COMMIT or ROLLBACK]     <-- Atomic
                            |
                    [RLS Policy]             <-- Database-level: Postgres rejects if policy fails
                            |
                    [Hooks / Jobs]           <-- Post-commit side effects
                            |
                    [Broadcast]              <-- WebSocket notifications
                            |
                    [Return Response]        <-- With structured message if rejected
```

### Action Execution Flow (Detail)

```
handleAction(action, input):
    entity   = artifact.Entities[action.InputEntity]
    access   = artifact.Access[entity.Name]
    rules    = findRules(entity.Name, action.Operation)
    messages = artifact.Messages

    // 1. Access gate (application-level)
    if action.Operation in ["update", "delete"]:
        if !evaluateCEL(access.WriteCEL, {user: currentUser}):
            return 403, messages[ACCESS_DENIED]

    if action.Operation == "create":
        if !evaluateCEL(access.WriteCEL, {user: currentUser}):
            return 403, messages[ACCESS_DENIED]

    // 2. Begin transaction
    tx = db.WithUser(userID).Begin()
    defer tx.Rollback()

    // 3. For update/delete: fetch current state with row lock
    if action.Operation in ["update", "delete"]:
        currentRow = tx.QueryRow("SELECT * FROM {table} WHERE id = $1 FOR UPDATE", id)
        if currentRow == nil:
            return 404

    // 4. Evaluate rules against current state
    for rule in rules:
        result = evaluateCEL(rule.Condition, currentRow)
        if rule.IsForbid && result == true:
            tx.Rollback()
            msg = messages[rule.EmitCode]
            return 422, {code: rule.EmitCode, message: msg.Default, level: msg.Level}
        if !rule.IsForbid && result == false:
            tx.Rollback()
            msg = messages[rule.EmitCode]
            return 422, {code: rule.EmitCode, message: msg.Default, level: msg.Level}

    // 5. Execute mutation
    result = tx.Exec(mutationQuery)

    // 6. Commit
    tx.Commit()

    // 7. Post-commit: hooks, broadcast
    triggerHooks(entity, action.Operation)
    broadcastEntityChange(entity, action.Operation, result)

    return 200/201, result
```

### View/List Execution Flow (Detail)

```
handleList(entity):
    access = artifact.Access[entity.Name]
    db     = db.WithUser(userID)

    // Application-level: inject read_sql as WHERE clause
    query = "SELECT * FROM {table} WHERE " + access.ReadSQL

    // RLS is also active as belt-and-suspenders
    rows = db.Query(query)
    return rows
```

---

## 3. Implementation Plan

### Phase 1: Foundation (CEL + Transaction + AccessSchema)

#### TODO 1.1: Add cel-go dependency to runtime

**Files to modify:**
- `runtime/go.mod`

**What to do:**
```bash
cd runtime && go get github.com/google/cel-go@latest
```

**Why:** Without cel-go, the runtime cannot evaluate any rule conditions or access expressions. This is the absolute first step.

**Acceptance criteria:**
- `github.com/google/cel-go` appears in `runtime/go.mod`
- `go build ./...` succeeds in `runtime/`

---

#### TODO 1.2: Create CEL evaluator package

**Files to create:**
- `runtime/internal/cel/evaluator.go`
- `runtime/internal/cel/evaluator_test.go`

**What to do:**

Create a standalone CEL evaluator that the server package uses. This package must:

1. Accept a CEL expression string and a variable map
2. Compile the expression once (with caching for performance)
3. Evaluate against the provided variables
4. Return `(bool, error)`

```go
// runtime/internal/cel/evaluator.go
package cel

import (
    "fmt"
    "sync"

    "github.com/google/cel-go/cel"
    "github.com/google/cel-go/checker/decls"
)

// Evaluator compiles and evaluates CEL expressions for FORGE rules and access control.
type Evaluator struct {
    mu       sync.RWMutex
    programs map[string]cel.Program // Cache compiled programs by expression string
    env      *cel.Env
}

// New creates a new CEL Evaluator with FORGE's standard variable declarations.
func New() (*Evaluator, error) {
    env, err := cel.NewEnv(
        cel.Variable("user", cel.StringType),   // current user ID
        cel.Variable("status", cel.StringType),  // entity fields (dynamic)
        // Additional declarations added per-entity at evaluation time
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create CEL environment: %w", err)
    }
    return &Evaluator{
        programs: make(map[string]cel.Program),
        env:      env,
    }, nil
}

// Eval evaluates a CEL expression against the provided variables.
// Returns (true, nil) if the expression evaluates to true.
// Returns (false, nil) if it evaluates to false.
// Returns (false, err) if evaluation fails.
func (e *Evaluator) Eval(expression string, vars map[string]any) (bool, error) {
    prog, err := e.getOrCompile(expression)
    if err != nil {
        return false, fmt.Errorf("CEL compile error: %w", err)
    }

    out, _, err := prog.Eval(vars)
    if err != nil {
        return false, fmt.Errorf("CEL eval error: %w", err)
    }

    result, ok := out.Value().(bool)
    if !ok {
        return false, fmt.Errorf("CEL expression did not return bool: %T", out.Value())
    }
    return result, nil
}

func (e *Evaluator) getOrCompile(expression string) (cel.Program, error) {
    e.mu.RLock()
    if prog, ok := e.programs[expression]; ok {
        e.mu.RUnlock()
        return prog, nil
    }
    e.mu.RUnlock()

    // Compile
    ast, issues := e.env.Compile(expression)
    if issues != nil && issues.Err() != nil {
        return nil, issues.Err()
    }

    prog, err := e.env.Program(ast)
    if err != nil {
        return nil, err
    }

    e.mu.Lock()
    e.programs[expression] = prog
    e.mu.Unlock()

    return prog, nil
}
```

**Important design note:** The CEL environment needs to be built dynamically based on the artifact's entity fields. The code above is a starting skeleton; the actual implementation must create per-entity environments that declare all field variables with their correct types. The approach should be:
1. On artifact load, build a `map[entityName]*cel.Env` with each entity's fields declared
2. Cache compiled programs keyed by `entityName + ":" + expression`
3. Expose `EvalRule(entityName, expression string, row map[string]any) (bool, error)`
4. Expose `EvalAccess(entityName, expression string, userID string) (bool, error)`

**Test cases:**
- `TestEval_SimpleBoolCondition`: `status == "closed"` with `{status: "closed"}` returns true
- `TestEval_SimpleBoolCondition_False`: `status == "closed"` with `{status: "open"}` returns false
- `TestEval_CompoundCondition`: `status == "closed" && priority > 3` with various inputs
- `TestEval_UserEquality`: `user == author` with matching/non-matching user IDs
- `TestEval_InvalidExpression`: syntax errors return error, not panic
- `TestEval_ProgramCaching`: same expression compiled once, evaluated many times

**Acceptance criteria:**
- All test cases pass
- Benchmark: 10,000 evaluations/second for a simple expression on cached program

---

#### TODO 1.3: Fix AccessSchema to include ReadCEL/WriteCEL

**Files to modify:**
- `runtime/internal/server/server.go` -- lines 124-129

**What to do:**

Add the missing fields to the `AccessSchema` struct so the artifact's `read_cel` and `write_cel` are deserialized:

Change:
```go
type AccessSchema struct {
    Entity   string `json:"entity"`
    Table    string `json:"table"`
    ReadSQL  string `json:"read_sql"`
    WriteSQL string `json:"write_sql"`
}
```

To:
```go
type AccessSchema struct {
    Entity   string `json:"entity"`
    Table    string `json:"table"`
    ReadSQL  string `json:"read_sql"`
    WriteSQL string `json:"write_sql"`
    ReadCEL  string `json:"read_cel"`
    WriteCEL string `json:"write_cel"`
}
```

**Test case:**
- Load the helpdesk artifact. Assert `artifact.Access["Ticket"].ReadCEL == "user in org.members"`.
- Load the helpdesk artifact. Assert `artifact.Access["Ticket"].WriteCEL` contains `user == author`.
- Assert all four access entities (User, Organization, Ticket, Comment) have non-empty ReadCEL and WriteCEL.

**Acceptance criteria:**
- Helpdesk artifact loads with all CEL fields populated
- Existing tests continue to pass

---

#### TODO 1.4: Wire CEL evaluator into Server

**Files to modify:**
- `runtime/internal/server/server.go` -- Server struct (line 36-47) and `New()` function (line 173-286)

**What to do:**

Add a `celEval` field to the `Server` struct and initialize it in `New()`:

```go
type Server struct {
    config       *Config
    runtimeConf  *config.Config
    artifact     *Artifact
    artifactMu   sync.RWMutex
    db           db.Database
    router       *chi.Mux
    hub          *Hub
    logger       *slog.Logger
    watcher      *ArtifactWatcher
    turnstile    *security.TurnstileVerifier
    celEval      *cel.Evaluator  // NEW
}
```

Initialize in `New()` after artifact loading:

```go
celEval, err := cel.NewFromArtifact(&artifact)
if err != nil {
    return nil, fmt.Errorf("failed to initialize CEL evaluator: %w", err)
}
s.celEval = celEval
```

Also update `ReloadArtifact()` (line 452-477) to rebuild the CEL evaluator when the artifact changes during hot reload.

**Acceptance criteria:**
- Server starts with CEL evaluator initialized
- Hot reload rebuilds CEL environment
- No regression in existing tests

---

### Phase 2: Rule Enforcement on Actions

#### TODO 2.1: Add transaction wrapping to action execution

**Files to modify:**
- `runtime/internal/server/handlers.go` -- `handleAction()` (line 588-657)

**What to do:**

Restructure `handleAction()` to wrap the entire action lifecycle in a single database transaction:

```go
func (s *Server) handleAction(w http.ResponseWriter, r *http.Request) {
    actionName := chi.URLParam(r, "action")
    action, ok := s.artifact.Actions[actionName]
    if !ok { /* 404 */ }

    var input map[string]interface{}
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil { /* 400 */ }

    entity, ok := s.artifact.Entities[action.InputEntity]
    if !ok { /* 500 */ }

    ctx := r.Context()
    database := s.getAuthenticatedDB(r)

    // Auto-populate owner fields (existing logic, unchanged)
    userID := getUserID(r)
    if userID != "" && action.Operation == "create" {
        // ... existing auto-populate logic ...
    }

    // BEGIN TRANSACTION
    tx, err := database.Begin(ctx)
    if err != nil {
        s.respondError(w, http.StatusInternalServerError, Message{Code: "TX_FAILED", Message: "Failed to begin transaction"})
        return
    }
    defer tx.Rollback(ctx) // Safe: no-op after Commit

    // Execute action within transaction
    switch action.Operation {
    case "create":
        s.executeCreateAction(ctx, w, tx, action, entity, input)
    case "update":
        s.executeUpdateAction(ctx, w, tx, action, entity, input)
    case "delete":
        s.executeDeleteAction(ctx, w, tx, action, entity, input)
    default:
        tx.Commit(ctx)
        s.respond(w, http.StatusOK, map[string]string{"message": fmt.Sprintf("action %s executed", actionName)})
    }
}
```

The `executeCreateAction`, `executeUpdateAction`, and `executeDeleteAction` functions must be refactored to accept a `db.Tx` instead of `db.Database`. They must NOT commit or rollback themselves -- the caller handles that.

**Test cases:**
- `TestAction_TransactionRollbackOnRuleViolation`: Start an update action, inject a rule that fires, verify no row was modified in the database.
- `TestAction_TransactionCommitOnSuccess`: Verify that a valid action completes and the row is modified.
- `TestAction_TransactionIsolation`: Two concurrent updates to the same row -- second one should see the first's changes after commit.

**Acceptance criteria:**
- Every action executes within a single `BEGIN`/`COMMIT` boundary
- Rule violation causes `ROLLBACK`
- No partial mutations possible

---

#### TODO 2.2: Implement rule evaluation in action handlers

**Files to modify:**
- `runtime/internal/server/handlers.go` -- `executeUpdateAction()` and `executeDeleteAction()`

**What to do:**

Before executing the mutation, evaluate all applicable rules against the current row state.

For **update** and **delete** actions:

```go
func (s *Server) executeUpdateAction(ctx context.Context, w http.ResponseWriter, tx db.Tx, action *ActionSchema, entity *EntitySchema, input map[string]interface{}) {
    id := input["id"]
    idStr := fmt.Sprintf("%v", id)

    // 1. Fetch current row state WITH row lock
    query := fmt.Sprintf("SELECT * FROM %s WHERE id = $1 FOR UPDATE", entity.Table)
    rows, err := tx.Query(ctx, query, idStr)
    if err != nil { /* 500 */ }
    defer rows.Close()

    if !rows.Next() { /* 404 */ }
    currentRow := rowToMap(rows.FieldDescriptions(), mustValues(rows))
    rows.Close()

    // 2. Evaluate rules
    rules := s.findRulesForEntity(entity.Name, action.Operation)
    for _, rule := range rules {
        if rule.Condition == "" {
            continue
        }

        // Build CEL variables from current row + user context
        vars := buildCELVars(currentRow, getUserIDFromContext(ctx))

        result, err := s.celEval.Eval(rule.Condition, vars)
        if err != nil {
            s.logger.Error("rule evaluation failed", "rule", rule.ID, "error", err)
            s.respondError(w, http.StatusInternalServerError, Message{Code: "RULE_EVAL_FAILED"})
            return
        }

        // Forbid: reject if condition is TRUE
        // Require: reject if condition is FALSE
        if (rule.IsForbid && result) || (!rule.IsForbid && !result) {
            msg := s.lookupMessage(rule.EmitCode)
            s.respondError(w, http.StatusUnprocessableEntity, Message{
                Code:    rule.EmitCode,
                Message: msg.Default,
            })
            return // Transaction will be rolled back by defer
        }
    }

    // 3. Execute mutation (existing UPDATE logic)
    // ...

    // 4. Commit
    tx.Commit(ctx)

    // 5. Post-commit effects
    s.broadcastEntityChange(entity.Name, "update", record)
    s.respond(w, http.StatusOK, record)
}
```

Helper functions to add:

```go
// findRulesForEntity returns all rules that apply to the given entity and operation.
func (s *Server) findRulesForEntity(entityName, operation string) []*RuleSchema {
    var result []*RuleSchema
    for _, rule := range s.getArtifact().Rules {
        if rule.Entity == entityName && rule.Operation == operation {
            result = append(result, rule)
        }
    }
    return result
}

// lookupMessage returns the message schema for a given code, or a default.
func (s *Server) lookupMessage(code string) *MessageSchema {
    if msg, ok := s.getArtifact().Messages[code]; ok {
        return msg
    }
    return &MessageSchema{Code: code, Level: "error", Default: "Operation not allowed"}
}

// buildCELVars constructs the variable map for CEL evaluation from a database row.
func buildCELVars(row map[string]any, userID string) map[string]any {
    vars := make(map[string]any, len(row)+1)
    for k, v := range row {
        vars[k] = v
    }
    vars["user"] = userID
    return vars
}
```

**Test cases (critical):**
- `TestRuleEnforcement_ForbidClosedTicketUpdate`: Create a ticket with status=closed. Attempt update. Expect HTTP 422 with `TICKET_CLOSED` message code.
- `TestRuleEnforcement_AllowOpenTicketUpdate`: Create a ticket with status=open. Attempt update. Expect HTTP 200.
- `TestRuleEnforcement_RequireRule`: If a require rule's condition is false, expect rejection.
- `TestRuleEnforcement_MessageContent`: Verify the response body contains `{"code": "TICKET_CLOSED", "message": "This ticket is already closed."}`.
- `TestRuleEnforcement_MultipleRules`: Entity with 2 rules -- first passes, second fires. Verify second rule's message is returned.
- `TestRuleEnforcement_CreateAction`: Rules that apply to create operations are evaluated on create.

**Acceptance criteria:**
- `forbid if status == closed emit TICKET_CLOSED` actually rejects updates to closed tickets
- Response includes the correct message code and default text from `messages` map
- HTTP status is 422 (Unprocessable Entity) for rule violations
- Transaction is rolled back on rule violation

---

### Phase 3: Access Control Enforcement

#### TODO 3.1: Inject read_sql into list and get queries

**Files to modify:**
- `runtime/internal/server/handlers.go` -- `handleList()` (line 121-165) and `handleGet()` (line 167-229)

**What to do:**

Before executing the query, look up the access rules for the entity and append the `read_sql` as a WHERE clause:

```go
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
    entityName := chi.URLParam(r, "entity")
    entity, ok := s.artifact.Entities[entityName]
    if !ok { /* 404 */ }

    // Build SELECT query WITH access control
    query := fmt.Sprintf("SELECT * FROM %s", entity.Table)

    // Inject access predicate
    if access, ok := s.getArtifact().Access[entityName]; ok && access.ReadSQL != "" {
        query += fmt.Sprintf(" WHERE %s", access.ReadSQL)
    }

    ctx := r.Context()
    database := s.getAuthenticatedDB(r)
    rows, err := database.Query(ctx, query)
    // ... rest unchanged ...
}
```

For `handleGet()`, add the access predicate as an additional AND condition:

```go
query := fmt.Sprintf("SELECT * FROM %s WHERE id = $1", entity.Table)
if access, ok := s.getArtifact().Access[entityName]; ok && access.ReadSQL != "" {
    query = fmt.Sprintf("SELECT * FROM %s WHERE id = $1 AND (%s)", entity.Table, access.ReadSQL)
}
```

**Also apply to `buildViewQuery()`** (line 582-585):
```go
func (s *Server) buildViewQuery(view *ViewSchema, entity *EntitySchema) string {
    query := fmt.Sprintf("SELECT * FROM %s", entity.Table)
    if access, ok := s.getArtifact().Access[view.Source]; ok && access.ReadSQL != "" {
        query += fmt.Sprintf(" WHERE %s", access.ReadSQL)
    }
    return query
}
```

**Test cases:**
- `TestAccessControl_ListFiltered`: User A creates records. User B queries list. Only records visible per access rules are returned.
- `TestAccessControl_GetDenied`: User A creates a record. User B tries to GET it by ID. Returns 404 (not 403, to avoid leaking existence).
- `TestAccessControl_GetAllowed`: Record owner can GET their own record.
- `TestAccessControl_ViewFiltered`: View query only returns records the user has access to.
- `TestAccessControl_NoAccessRules`: Entity without access rules returns all records (backward compat).

**Acceptance criteria:**
- `SELECT * FROM tickets` becomes `SELECT * FROM tickets WHERE (current_setting('app.user_id')::uuid IN (SELECT members_id FROM organizations WHERE id = org_id))`
- Users can only see records they are authorized to see
- Entities without access rules continue to work (no WHERE clause added)

---

#### TODO 3.2: Inject write_sql into mutation handlers

**Files to modify:**
- `runtime/internal/server/handlers.go` -- `handleCreate()`, `handleUpdate()`, `handleDelete()` (the direct CRUD endpoints, not action endpoints)

**What to do:**

For `handleUpdate()` and `handleDelete()`, add the write access predicate to the WHERE clause:

```go
// In handleUpdate():
query := fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d", entity.Table, strings.Join(sets, ", "), i)
if access, ok := s.getArtifact().Access[entityName]; ok && access.WriteSQL != "" {
    query = fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d AND (%s)",
        entity.Table, strings.Join(sets, ", "), i, access.WriteSQL)
}
query += " RETURNING *"
```

If `RowsAffected() == 0` after an update with access predicate, it could mean either:
1. Record does not exist (404)
2. Record exists but user lacks write access (403)

To distinguish, do a follow-up `SELECT COUNT(*) FROM {table} WHERE id = $1` (without access predicate). If count > 0, return 403. Otherwise 404.

**Test cases:**
- `TestWriteAccess_UpdateDenied`: Non-owner tries to update. Expect 403.
- `TestWriteAccess_UpdateAllowed`: Owner updates. Expect 200.
- `TestWriteAccess_DeleteDenied`: Non-owner tries to delete. Expect 403.
- `TestWriteAccess_DeleteAllowed`: Owner deletes. Expect 200.
- `TestWriteAccess_NonExistentRecord`: Update to non-existent ID returns 404, not 403.

**Acceptance criteria:**
- Mutations fail with 403 when user lacks write access
- 404 vs 403 distinction is correct
- RLS provides second layer of protection at DB level

---

#### TODO 3.3: Add requireAuth middleware to API routes

**Files to modify:**
- `runtime/internal/server/server.go` -- `setupRoutes()` (lines 354-370)

**What to do:**

When the app has authentication enabled (`auth: password` or `auth: oauth`), wrap the `/api` route group with `s.requireAuth`:

```go
// API routes
r.Route("/api", func(r chi.Router) {
    // Require authentication when auth is configured
    if s.getArtifact().Auth != "" && s.getArtifact().Auth != "none" {
        r.Use(s.requireAuth)
    }

    // Actions
    r.Post("/actions/{action}", s.handleAction)
    // ... rest unchanged ...
})
```

**Test cases:**
- `TestAPIRequiresAuth`: Request to `/api/entities/Ticket` without Authorization header returns 401.
- `TestAPIAllowsAuth`: Request with valid token returns 200.
- `TestAPINoAuthMode`: App with `auth: none` does not require authentication.
- `TestWebhookBypassesAuth`: `/webhooks/stripe` does not require auth (webhooks are externally authenticated via signatures).

**Acceptance criteria:**
- All `/api/*` endpoints require authentication when auth is configured
- Webhook endpoints remain unauthenticated (they use signature validation)
- Health endpoint remains unauthenticated

---

### Phase 4: Webhook Action Hardening

#### TODO 4.1: Apply rules to webhook-triggered actions

**Files to modify:**
- `runtime/internal/server/handlers.go` -- `executeWebhookAction()` (line 1272-1331)

**What to do:**

Refactor `executeWebhookAction()` to use the same rule evaluation path as regular actions. Webhooks run with system privileges (no user context for access control), but business rules still apply:

```go
func (s *Server) executeWebhookAction(ctx context.Context, action *ActionSchema, input map[string]any) error {
    artifact := s.getArtifact()
    entity, ok := artifact.Entities[action.InputEntity]
    if !ok {
        return fmt.Errorf("entity %s not found", action.InputEntity)
    }

    // Begin transaction (no user context -- system operation)
    tx, err := s.db.Begin(ctx)
    if err != nil {
        return fmt.Errorf("failed to begin transaction: %w", err)
    }
    defer tx.Rollback(ctx)

    // Evaluate rules (business rules apply even to system operations)
    rules := s.findRulesForEntity(entity.Name, action.Operation)
    for _, rule := range rules {
        if rule.Condition == "" {
            continue
        }
        vars := buildCELVars(input, "") // No user for webhooks
        result, err := s.celEval.Eval(rule.Condition, vars)
        if err != nil {
            return fmt.Errorf("rule evaluation failed: %w", err)
        }
        if (rule.IsForbid && result) || (!rule.IsForbid && !result) {
            return fmt.Errorf("rule violation: %s", rule.EmitCode)
        }
    }

    // Execute mutation within transaction
    // ... INSERT/UPDATE/DELETE logic ...

    // Commit
    if err := tx.Commit(ctx); err != nil {
        return fmt.Errorf("commit failed: %w", err)
    }

    // Post-commit: broadcast
    s.broadcastEntityChange(entity.Name, action.Operation, record)
    return nil
}
```

**Test cases:**
- `TestWebhookAction_RuleEnforced`: Webhook triggers update on a closed ticket. Rule fires, action is rejected.
- `TestWebhookAction_NoUserContext`: Webhook action succeeds without user context (no access check, only rules).
- `TestWebhookAction_TransactionWrapped`: Verify webhook action is atomic.

**Acceptance criteria:**
- Webhook-triggered actions evaluate business rules
- Webhook actions run in transactions
- Webhook actions do NOT evaluate access rules (they are system operations)

---

### Phase 5: RLS Hardening

#### TODO 5.1: Verify RLS policies are applied during migration

**Files to verify:**
- `runtime/internal/db/postgres.go` -- `ApplyMigration()` (line 73-92)

**What to do:**

Verify that the migration statements in `artifact.Migration.Up` include:
1. `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`
2. `CREATE POLICY ...`

The compiler already emits these (verified in the helpdesk artifact). The `ApplyMigration()` function executes all statements in order and handles "already exists" errors. This should work as-is, but needs a verification test.

**Test cases (integration, requires real Postgres):**
- `TestRLS_PoliciesCreated`: After migration, query `pg_policies` system catalog. Verify policies exist for each entity with access rules.
- `TestRLS_SelectFiltered`: Set `app.user_id` to a user, SELECT from tickets table. Only tickets the user has access to are returned.
- `TestRLS_InsertBlocked`: Set `app.user_id` to a user without write access. Attempt INSERT. Expect RLS policy violation error.
- `TestRLS_UpdateBlocked`: Set `app.user_id` to non-owner. Attempt UPDATE. Expect RLS policy violation.

**Acceptance criteria:**
- RLS policies are applied during migration
- RLS correctly filters SELECT results based on user context
- RLS correctly blocks unauthorized mutations
- Verify with `SELECT * FROM pg_policies WHERE tablename = 'tickets'`

---

#### TODO 5.2: Handle missing app.user_id gracefully

**Files to modify:**
- `runtime/internal/db/postgres.go` -- `Query()` (line 113) and `Exec()` (line 181)

**What to do:**

When `p.userID == nil` (unauthenticated request), the query runs without `SET LOCAL app.user_id`. This means `current_setting('app.user_id')` in RLS policies will throw an error because the GUC does not exist.

Two options:
1. **Set a sentinel value**: `SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'` (nil UUID)
2. **Use `current_setting('app.user_id', true)`** which returns NULL instead of erroring when the setting is missing

Option 2 is better because it does not require runtime changes to the SQL predicates. However, it requires a compiler change to emit `current_setting('app.user_id', true)` instead of `current_setting('app.user_id')`.

**Recommended approach:** Compiler change in `normalizer.go:552`:
```go
// Change:
return "current_setting('app.user_id')::uuid"
// To:
return "current_setting('app.user_id', true)::uuid"
```

This is a compiler change, but it is a one-line fix that prevents runtime errors when RLS policies encounter unauthenticated requests. Without it, any unauthenticated query to a table with RLS will throw a PostgreSQL error.

**Alternatively**, if the compiler should not be modified, the runtime can set a "null user" in `postgres.go`:
```go
func (p *Postgres) setUserContext(ctx context.Context, conn *pgxpool.Conn) error {
    if p.userID == nil {
        // Set a null user so RLS policies can evaluate gracefully
        _, err := conn.Exec(ctx, "SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000'")
        return err
    }
    _, err := conn.Exec(ctx, fmt.Sprintf("SET LOCAL app.user_id = '%s'", p.userID.String()))
    return err
}
```

**Test cases:**
- `TestRLS_UnauthenticatedQuery`: Query without user context does not throw a PostgreSQL error.
- `TestRLS_UnauthenticatedReturnsEmpty`: Query without user context returns no rows (RLS denies all).

**Acceptance criteria:**
- Unauthenticated queries do not crash with `unrecognized configuration parameter "app.user_id"`
- Unauthenticated queries return zero rows for tables with RLS policies

---

### Phase 6: Performance & Observability

#### TODO 6.1: Add metrics and logging for enforcement

**Files to modify:**
- `runtime/internal/server/handlers.go` -- all action/access paths

**What to do:**

Add structured logging for every enforcement decision:

```go
s.logger.Info("rule.evaluated",
    "action", actionName,
    "rule", rule.ID,
    "entity", entity.Name,
    "condition", rule.Condition,
    "result", result,
    "is_forbid", rule.IsForbid,
    "rejected", rejected,
)

s.logger.Info("access.checked",
    "entity", entityName,
    "operation", "read",
    "user", userID,
    "access_sql_injected", access.ReadSQL != "",
)
```

Add timing for CEL evaluation:
```go
start := time.Now()
result, err := s.celEval.Eval(rule.Condition, vars)
s.logger.Debug("cel.eval.timing",
    "expression", rule.Condition,
    "duration_us", time.Since(start).Microseconds(),
)
```

**Test cases:**
- Verify log output contains rule evaluation events (test with captured logger)

**Acceptance criteria:**
- Every rule evaluation is logged with its outcome
- Every access check is logged
- CEL evaluation time is logged at debug level
- No performance regression > 5% on action endpoints (benchmark)

---

## 4. Migration Path

### Backward Compatibility

The changes are backward compatible. Existing apps that have no rules or access declarations will continue to work without modification because:

1. **No rules in artifact** -> rule evaluation loop iterates zero times -> no effect
2. **No access in artifact** -> no WHERE clause injected -> `SELECT * FROM {table}` unchanged
3. **auth: none** -> no `requireAuth` middleware added -> endpoints remain open
4. **CEL evaluator with no expressions** -> never called -> no overhead

### Feature Flag (Optional)

If a staged rollout is desired, add a runtime config option:

```toml
# forge.runtime.toml
[runtime]
enforce_rules = true    # default: true
enforce_access = true   # default: true
```

The server checks these flags before evaluating rules/access. In the first release, both default to `true`. If a bug is discovered, operators can disable enforcement without redeploying.

### Migration Order

Deploy in this order to minimize risk:

1. **Phase 1** (Foundation): Add CEL dependency, create evaluator, fix AccessSchema. Zero behavioral change.
2. **Phase 3.3** (Auth gating): Add requireAuth to API routes. This is the simplest and most impactful change -- blocks unauthenticated access.
3. **Phase 2** (Rule enforcement): Start enforcing rules on actions. Existing tests will catch regressions.
4. **Phase 3.1-3.2** (Access SQL injection): Add read/write access predicates. RLS is already active as a safety net.
5. **Phase 4** (Webhook hardening): Apply rules to webhook actions.
6. **Phase 5** (RLS hardening): Handle edge cases in RLS policy evaluation.
7. **Phase 6** (Observability): Add logging and metrics.

---

## 5. Verification Checklist

### Unit Tests

| Test | Verifies | File |
|---|---|---|
| `TestCELEval_*` (6 tests) | CEL evaluator compiles and evaluates correctly | `runtime/internal/cel/evaluator_test.go` |
| `TestRuleEnforcement_*` (6 tests) | Rules are evaluated before mutations | `runtime/internal/server/handlers_test.go` |
| `TestAccessControl_*` (5 tests) | Read access predicates filter query results | `runtime/internal/server/handlers_test.go` |
| `TestWriteAccess_*` (5 tests) | Write access predicates block unauthorized mutations | `runtime/internal/server/handlers_test.go` |
| `TestAPIRequiresAuth_*` (4 tests) | Auth middleware gates API routes | `runtime/internal/server/server_test.go` |
| `TestWebhookAction_*` (3 tests) | Webhook actions enforce rules | `runtime/internal/server/handlers_test.go` |
| `TestAction_Transaction_*` (3 tests) | Actions are wrapped in transactions | `runtime/internal/server/handlers_test.go` |

### Integration Tests (require real Postgres via testcontainers)

| Test | Verifies |
|---|---|
| `TestIntegration_RLS_PoliciesExist` | `pg_policies` catalog contains expected policies after migration |
| `TestIntegration_RLS_SelectFiltered` | SELECT with user context returns only authorized rows |
| `TestIntegration_RLS_MutationBlocked` | Unauthorized INSERT/UPDATE/DELETE fails at DB level |
| `TestIntegration_E2E_ForbidClosedTicket` | Full HTTP request -> rule fires -> 422 with message |
| `TestIntegration_E2E_AccessFilteredList` | Full HTTP request -> list returns only accessible records |
| `TestIntegration_BeltAndSuspenders` | Remove application-level check; RLS still blocks. Remove RLS; application-level still blocks. |

### E2E Tests (Playwright)

| Test | Verifies |
|---|---|
| `e2e/tests/rules.spec.ts` | UI shows error toast when updating a closed ticket |
| `e2e/tests/access.spec.ts` | User A cannot see User B's tickets in the list |
| `e2e/tests/access.spec.ts` | User A cannot update User B's ticket via API |

### Manual Verification

1. Start helpdesk with `forge dev`
2. Create a ticket, close it, attempt to re-open it -> Should see "This ticket is already closed."
3. As User A, create a ticket. Log in as User B (different org). Verify ticket is not visible in list.
4. As User B, attempt `PUT /api/entities/Ticket/{id}` with User A's ticket ID -> Should get 403.
5. Check server logs: verify `rule.evaluated` and `access.checked` log entries appear.

### Performance Verification

| Metric | Target | How to measure |
|---|---|---|
| CEL evaluation latency | < 100us per expression (cached) | Go benchmark: `BenchmarkCELEval` |
| Action endpoint latency | < 10% increase from baseline | `wrk` or `hey` against `/api/actions/close_ticket` |
| List endpoint latency | < 15% increase from baseline | `wrk` against `/api/entities/Ticket` with access SQL |
| Memory overhead | < 5MB for CEL program cache | Go pprof heap profile |

---

## 6. Implementation Order & Dependencies

| # | TODO | Depends On | Effort | Risk |
|---|---|---|---|---|
| 1.1 | Add cel-go dependency | None | 15 min | None |
| 1.2 | Create CEL evaluator package | 1.1 | 1-2 days | Medium (API design) |
| 1.3 | Fix AccessSchema struct | None | 15 min | None |
| 1.4 | Wire CEL evaluator into Server | 1.2 | 2 hours | Low |
| 2.1 | Transaction wrapping | None | 1 day | Medium (refactor) |
| 2.2 | Rule evaluation in actions | 1.4, 2.1 | 2-3 days | High (core feature) |
| 3.1 | Inject read_sql into queries | 1.3 | 4 hours | Low |
| 3.2 | Inject write_sql into mutations | 1.3, 2.1 | 4 hours | Medium |
| 3.3 | requireAuth on API routes | None | 1 hour | Low |
| 4.1 | Webhook action hardening | 2.2 | 1 day | Medium |
| 5.1 | Verify RLS policies | None | 4 hours | Low |
| 5.2 | Handle missing app.user_id | None | 2 hours | Low |
| 6.1 | Metrics and logging | 2.2, 3.1 | 4 hours | None |

**Critical path:** 1.1 -> 1.2 -> 1.4 -> 2.1 -> 2.2

**Total estimated effort:** 8-10 engineering days

---

## 7. Open Questions

1. **CEL vs SQL for application-level rule checks**: Should the runtime evaluate CEL expressions (the `condition` field) or execute the SQL predicates (`sql_predicate` field) via a `SELECT` query? CEL is faster (in-process) but requires mapping DB types to CEL types. SQL is guaranteed to match RLS behavior but requires a round-trip. **Recommendation**: Use CEL for the application layer, SQL predicates for the database layer. This gives true defense-in-depth with independent implementations.

2. **Rule ordering**: When multiple rules apply, should they evaluate in artifact order or is there a priority? **Recommendation**: Evaluate all rules; return the first violation. Order matches declaration order in the `.forge` file.

3. **Create operation rules**: For create actions, there is no "current state" to evaluate rules against. Should rules evaluate against the input data instead? **Recommendation**: Yes. For create operations, the CEL variables come from the input map, not a database row. Document this clearly.

4. **Access control on actions vs entities**: Actions have an `InputEntity` and may have a `TargetEntity`. Which entity's access rules apply? **Recommendation**: The `TargetEntity`'s access rules apply (e.g., for `close_ticket` which `updates: Ticket`, Ticket's write access applies). If `TargetEntity` is empty, fall back to `InputEntity`.
