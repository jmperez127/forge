# FORGE v0.3.0 -- Spec Reconciliation & Release Scoping

> **Prepared by:** Engineering Program Management
> **Date:** 2026-02-05
> **Status:** Draft for review

---

## Executive Summary

FORGE has a comprehensive specification (`FORGE_SPEC.md`, 37 sections) and an implementation that covers the compiler pipeline end-to-end plus a functional runtime. However, the gap between what the spec promises and what the implementation delivers is significant. The compiler parses and analyzes the full language surface, but the runtime does not enforce most of what the compiler compiles. Rules are compiled to SQL predicates but never evaluated at request time. Access control generates RLS policies in migration SQL but the runtime does not enforce them outside of PostgreSQL's native RLS. Jobs are architected but not wired into the action lifecycle. Several spec sections (presence, ephemeral, `forge test`, imperative code execution, schema evolution, observability, offline/optimistic UI, frontend contract versioning) have zero implementation.

v0.3.0 must close the enforcement gap. The theme is **"What You Compile Is What Runs"** -- making the runtime actually enforce the invariants the compiler produces. Shipping more language surface area while the runtime ignores compiled rules would be architectural debt that compounds.

---

## 1. Spec Audit Matrix

### Section 1-3: Philosophy, Structure, app.forge

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 1.1-1.3 | Core philosophy / mental model | N/A | N/A | N/A | Documentation only |
| 2 | Application structure (.forge files) | Complete | Complete | N/A | Multi-file support works |
| 3 | `app` declaration (auth, database, frontend) | Complete | Complete | N/A | Parsed, normalized, loaded into artifact |
| 3 | `auth: password` | Complete | Complete | N/A | Full register/login/refresh/me flow |
| 3 | `auth: oauth` | Parsed | Missing | Deferred | No OAuth provider integration |
| 3 | `auth: jwt` | Parsed | Partial | Deferred | Only basic JWT validation, no external JWKS |
| 3 | `auth: none` | Complete | Complete | N/A | Works |

### Section 4-5: Entities & Relations

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 4 | Entity declaration | Complete | Complete | N/A | Parsed, analyzed, normalized, emitted to SQL |
| 4 | Field types (string, int, float, bool, time, uuid) | Complete | Complete | N/A | All types supported |
| 4 | Enum types | Complete | Complete | N/A | Generated as PostgreSQL enum types |
| 4 | Field constraints (length, unique) | Complete | Partial | Yes | Compiled to SQL constraints, but runtime does not validate before INSERT |
| 4 | Default values | Complete | Complete | N/A | Generated in SQL DDL |
| 4 | "Immutable except through actions" | Complete | **Missing** | **Yes** | Direct entity CRUD endpoints bypass actions entirely; spec says mutations only through actions |
| 5 | Relations (single, many) | Complete | Complete | N/A | Foreign keys generated, traversal works |
| 5 | Relation traversal in expressions | Complete | Partial | Yes | Compiled to SQL subqueries, but runtime views do not generate JOINs |

### Section 6: Rules

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 6 | Rule declaration (forbid/require) | Complete | N/A | N/A | Parsed, analyzed, condition -> CEL + SQL |
| 6 | Rule enforcement at runtime | Complete | **Missing** | **Yes** | Rules are compiled to SQL predicates and CEL but **never evaluated** during action execution. `handleAction` does not check rules. This is the single biggest spec violation. |
| 6 | Rule emit (message on rejection) | Complete | **Missing** | **Yes** | Message codes are compiled but rejection path does not exist |
| 6 | Rules compile to SQL predicates | Complete | Stubbed | Yes | SQL predicates generated in artifact but not used in WHERE clauses or CHECK constraints |

### Section 7: Access Control

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 7 | Access declaration (read/write) | Complete | N/A | N/A | Parsed, CEL + SQL generated |
| 7 | RLS policy generation | Complete | Complete | N/A | Policies generated in migration SQL |
| 7 | RLS enforcement via PostgreSQL | Complete | Partial | Yes | `getAuthenticatedDB` sets `app.user_id` session var, but only works if RLS policies are actually applied to the database. No verification that RLS is active. |
| 7 | Access check before query (application-level) | Partial | **Missing** | **Yes** | Artifact has access SQL/CEL; runtime never checks them. Relies entirely on PostgreSQL RLS which may not be enabled. |
| 7 | Access applied to jobs and realtime | N/A | **Missing** | Deferred | WebSocket broadcasts are not filtered by access rules |

### Section 8: Actions

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 8 | Action declaration | Complete | Complete | N/A | Parsed, operation types resolved (creates/updates/deletes) |
| 8 | Action execution (create/update/delete) | Complete | Complete | N/A | `handleAction` dispatches to correct SQL operation |
| 8 | Actions as single transaction | Partial | **Missing** | **Yes** | Each SQL statement is its own implicit transaction; no explicit `BEGIN`/`COMMIT` wrapping rule checks + mutation |
| 8 | Actions enforce rules | Complete | **Missing** | **Yes** | See Section 6 |
| 8 | Actions enforce access | Complete | **Missing** | **Yes** | See Section 7 |
| 8 | Actions emit messages | Complete | **Missing** | **Yes** | Messages compiled but not returned on rejection |
| 8 | Actions trigger hooks | Complete | **Missing** | **Yes** | Hook schemas compiled but `handleAction` never fires hooks |
| 8 | Auto-populate owner fields on create | N/A | Complete | N/A | `owner_id`, `author_id`, `user_id`, `created_by` auto-set |

### Section 9: Messages

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 9 | Message declaration | Complete | Complete | N/A | Parsed, stored in artifact |
| 9 | Message emission on rule rejection | Complete | **Missing** | **Yes** | Requires rule enforcement first |
| 9 | Structured error responses with message codes | N/A | Partial | Yes | Error responses use ad-hoc codes (e.g., "ENTITY_NOT_FOUND") not spec-defined message codes |

### Section 10: Jobs

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 10 | Job declaration (input, needs, effect) | Complete | N/A | N/A | Fully parsed and normalized |
| 10 | Job executor | N/A | Complete | N/A | `jobs.Executor` with workers, retry, backoff |
| 10 | Job enqueue from hooks | N/A | Stubbed | Yes | `EnqueueFromHook` exists but is never called from action handlers |
| 10 | Job data resolution (needs clause) | Partial | **Missing** | Deferred | `needs` path compiled but data fetching not implemented |
| 10 | Job capability sandbox | N/A | Partial | Deferred | Provider registry exists; capability limiting not enforced |

### Section 11: Hooks

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 11 | Hook declaration | Complete | N/A | N/A | Parsed, timing/operation resolved |
| 11 | Hook execution after action | Complete | **Missing** | **Yes** | Hooks are in the artifact but action handlers never fire them |
| 11 | Hook enqueue jobs | Complete | **Missing** | **Yes** | Requires hook execution first |

### Section 12: Views

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 12 | View declaration | Complete | Complete | N/A | Parsed, query generated |
| 12 | View query execution | Complete | Partial | Yes | `handleView` exists but uses `SELECT *` ignoring compiled field list. TODO comment in `buildViewQuery`. |
| 12 | View respects access rules | Complete | **Missing** | Yes | Views should filter by access; currently no filtering |
| 12 | View realtime subscriptions | N/A | Partial | Deferred | WebSocket broadcasts entity changes but not view-aware diffs |

### Section 12.1: Presence

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 12.1 | `presence` declaration | **Missing** | **Missing** | **Cut** | Not parsed. No AST node, no token. This is a v0.5.0+ feature. |
| 12.1 | Presence TTL/scope/Redis storage | N/A | **Missing** | **Cut** | Requires Redis integration |

### Section 12.2: Ephemeral

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 12.2 | `ephemeral` declaration | **Missing** | **Missing** | **Cut** | Not parsed. No AST node, no token. v0.5.0+ feature. |
| 12.2 | Broadcast-only state via WebSocket | N/A | **Missing** | **Cut** | |

### Section 13-14: Frontend SDK & Realtime

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 13 | TypeScript client generation | Complete | N/A | N/A | Generated with types, actions, views, subscriptions |
| 13 | React hooks generation | Complete | N/A | N/A | Generated with useList, useAction, ForgeProvider |
| 14 | WebSocket subscriptions | N/A | Complete | N/A | Hub pattern with per-view broadcasting |
| 14 | Permission-filtered realtime events | N/A | **Missing** | Deferred | Broadcasts go to all subscribers regardless of access |
| 14 | View-aware diffs | N/A | **Missing** | Deferred | Full snapshots, not diffs |

### Section 15: Concurrency Model

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 15 | All mutations through actions | N/A | **Violated** | **Yes** | Direct entity CRUD endpoints exist and bypass actions |
| 15 | Entity-level locking | N/A | **Missing** | Yes | No `SELECT ... FOR UPDATE` or advisory locks |
| 15 | Atomic rule + mutation in single TX | N/A | **Missing** | **Yes** | See Section 8 |

### Section 16: Schema Evolution

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 16 | `migrate` declaration | Complete | N/A | N/A | Parsed (from/to/map) |
| 16 | Diff-based migration generation | Partial | Partial | Deferred | Current migration is "create everything from scratch"; no incremental diff |
| 16 | `forge migrate` CLI | N/A | Complete | N/A | Reads artifact, applies schema |

### Section 17: Imperative Code

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 17 | `imperative` declaration | Complete | **Missing** | **Cut** | Parsed but no runtime execution. Capability sandbox not implemented. v0.5.0+ feature. |

### Section 18: Capabilities & Security

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 18 | Capability declarations | Partial | Partial | Deferred | Provider registry exists; no compile-time capability checking |
| 18 | Capability sandbox enforcement | N/A | **Missing** | Deferred | Jobs can call any registered capability regardless of declaration |
| 18.1 | Provider interfaces | N/A | Complete | N/A | `Provider`, `CapabilityProvider`, `WebhookProvider` |
| 18.1 | Built-in providers (HTTP, email) | N/A | Complete | N/A | Implemented and tested |
| 18.1 | Webhook handling | Complete | Complete | N/A | Signature validation, event filtering, data normalization |
| 18.1 | Provider configuration (TOML) | N/A | Complete | N/A | `forge.runtime.toml` with env var resolution |

### Section 19-22: Configuration, Guarantees, Non-Goals, Summary

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 19 | Runtime TOML configuration | N/A | Complete | N/A | Fully implemented with env var resolution |
| 20 | Guarantee: no hidden state mutations | N/A | **Violated** | **Yes** | Direct CRUD endpoints exist |
| 20 | Guarantee: no bypassable rules | N/A | **Violated** | **Yes** | Rules are never checked |
| 20 | Guarantee: no authorization leaks | N/A | **Violated** | **Yes** | Access not checked at application level |
| 20 | Guarantee: deterministic behavior | N/A | Partial | Deferred | No structured event emission |
| 20 | Guarantee: LLM-safe structure | Complete | Complete | N/A | Declarative specs, structured errors |

### Section 23-25: CLI, Compiler Pipeline, Artifact

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 23 | `forge init` | N/A | Complete | N/A | Scaffolds project |
| 23 | `forge check` | Complete | N/A | N/A | Full validation |
| 23 | `forge build` | Complete | N/A | N/A | Full pipeline |
| 23 | `forge run` | N/A | Complete | N/A | Starts server |
| 23 | `forge dev` | N/A | Complete | N/A | Build + run + watch |
| 23 | `forge test` | **Missing** | **Missing** | Deferred | Not implemented. No `cmdTest` in main.go. Test declarations are parsed but never executed. |
| 23 | `forge migrate` | N/A | Complete | N/A | Apply/dry-run/verbose |
| 24 | Compiler pipeline (parse -> analyze -> normalize -> plan -> emit) | Complete | N/A | N/A | All five stages implemented |
| 25 | Runtime artifact | Complete | Complete | N/A | JSON with entities, actions, rules, access, views, jobs, hooks, webhooks, messages, migration |

### Section 26-29: Versioning, Errors, Testing, Observability

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 26 | Frontend contract versioning | **Missing** | **Missing** | **Cut** | No version bumping, no concurrent version support. v0.5.0+. |
| 27 | Structured error model | Complete | Partial | Yes | Framework uses `APIResponse` with messages, but ad-hoc codes, not spec-defined message codes |
| 28 | Test declarations (given/when/expect) | Complete | **Missing** | Deferred | Parsed but no executor. `forge test` command does not exist. |
| 28 | Property test generation | **Missing** | **Missing** | **Cut** | Aspirational |
| 29 | Structured observability events | **Missing** | **Missing** | Deferred | Only `action.started` log exists. No `action.committed`, `rule.rejected`, `job.enqueued`, `job.failed`. |

### Section 30-37: Multi-Tenancy, Offline, Ejection, Constraints, Limits, Plugins, Glossary

| Section | Feature | Compiler | Runtime | v0.3.0? | Notes |
|---------|---------|----------|---------|---------|-------|
| 30 | Multi-tenancy via relations | Complete | Partial | Deferred | Modeled via relations + access; enforcement depends on RLS (see Section 7) |
| 31 | Offline / optimistic UI | **Missing** | **Missing** | **Cut** | Aspirational; no client-side optimistic mutation support |
| 32 | Imperative escape hatch | Complete | **Missing** | **Cut** | See Section 17 |
| 33 | Design constraints (no raw SQL, no arbitrary handlers) | N/A | **Violated** | Yes | Direct entity endpoints serve raw SELECT * |
| 35 | Compile-time plugins | N/A | Partial | Deferred | Provider registry works; `forge build --plugins` flag does not exist |
| 36 | Glossary | N/A | N/A | N/A | Documentation |

---

## 2. v0.3.0 Release Definition

### Theme: "What You Compile Is What Runs"

The fundamental promise of FORGE is that you declare intent and the runtime enforces it. Today, the compiler produces a rich artifact and the runtime ignores most of it. v0.3.0 closes this gap for the core enforcement path: **rules, access, transactions, hooks, and action exclusivity**.

### MUST Ship

| # | Feature | Justification | Size |
|---|---------|---------------|------|
| 1 | **Runtime rule enforcement** | The single biggest spec violation. `forbid if status == closed` must actually reject mutations. Rules in the artifact must be evaluated during action execution. Rejection must emit the declared message code. | L |
| 2 | **Action transactionality** | Actions must execute rule check + mutation + hook trigger in a single database transaction (`BEGIN`/`COMMIT`/`ROLLBACK`). Without this, rule checks are TOCTOU-vulnerable. | M |
| 3 | **Application-level access checking** | The runtime must verify access rules before executing queries, not rely solely on PostgreSQL RLS. This catches misconfigured databases and provides proper error messages. | M |
| 4 | **Hook execution after actions** | When an action completes, after_create/after_update/after_delete hooks must fire and enqueue declared jobs. The plumbing exists (`jobs.Executor`, `EnqueueFromHook`) but is never called. | M |
| 5 | **Remove or gate direct entity CRUD** | Direct `POST /api/entities/{entity}` bypasses rules and access. Either remove these endpoints or gate them behind `FORGE_ENV=development`. Spec says "immutable except through actions." | S |
| 6 | **View query correctness** | `buildViewQuery` returns `SELECT *`. It must use the compiled field list and generate JOINs for relation traversal. | M |
| 7 | **Structured error responses with message codes** | Rule rejections must return the artifact message code and default text, not ad-hoc strings. The error model is a core FORGE guarantee. | S |
| 8 | **Entity-level locking for update/delete actions** | `SELECT ... FOR UPDATE` on the target row before mutation. Without this, concurrent updates can violate rules. | S |

### Deferred to v0.4.0

| Feature | Justification for deferral |
|---------|---------------------------|
| `forge test` command | Important but not a runtime enforcement gap. Users can test with Go/Playwright tests today. |
| Job data resolution (`needs` clause) | Jobs can fire with entity data passed through; full needs-path resolution requires query generation work. |
| Capability sandbox enforcement | Jobs already route through provider registry. Strict enforcement is an enhancement. |
| Permission-filtered realtime events | WebSocket broadcasts work. Access filtering is an enhancement over the current model. |
| Observability event emission | Structured logging exists. Formal event bus is an enhancement. |
| Incremental schema evolution (diff-based migrations) | Current "create from scratch" works for greenfield. Diff-based is needed for production but not blocking. |
| `auth: oauth` | Password auth is complete. OAuth is a separate integration effort. |
| Multi-tenancy enforcement verification | Works if RLS is applied. Explicit verification is an enhancement. |

### Cut from Spec Entirely (move to v0.5.0+ or remove)

| Feature | Justification for cut |
|---------|----------------------|
| `presence` construct | Not parsed. Requires Redis. Large new feature with no foundation. |
| `ephemeral` construct | Not parsed. WebSocket-only broadcast state is niche. |
| `imperative` code execution | Parsed but executing arbitrary user code in a capability sandbox is a major security surface. Needs careful design. |
| Frontend contract versioning | Multi-version SDK support is premature. No users need this yet. |
| Offline / optimistic UI | Aspirational feature with no implementation path today. |
| Property test generation | Aspirational. |
| `forge build --plugins` flag | Provider registry works via Go imports. CLI flag adds compile-time complexity. |

---

## 3. Feature Dependencies (DAG)

```
                    +--------------------------+
                    | 1. Rule enforcement      |
                    |    (evaluate artifact     |
                    |     rules in handlers)    |
                    +--------+-----------------+
                             |
                   depends   |   depends
                     on      |     on
              +--------------+-----------+
              |                          |
    +---------v--------+    +------------v-----------+
    | 2. Action         |    | 7. Structured error    |
    |    transactionality|    |    responses with      |
    |    (BEGIN/COMMIT)  |    |    message codes       |
    +---------+---------+    +------------------------+
              |
    depends   |
      on      |
    +---------v---------+
    | 8. Entity-level   |
    |    locking        |
    |    (SELECT FOR    |
    |     UPDATE)       |
    +-------------------+
              |
    depends   |
      on      |
    +---------v---------+     +------------------------+
    | 4. Hook execution |     | 3. Application-level   |
    |    after actions  |     |    access checking      |
    +-------------------+     +------------------------+
              |                          |
              |                          |
    +---------v---------+     +----------v-------------+
    | Job enqueue from  |     | 6. View query          |
    | hooks (existing   |     |    correctness         |
    | EnqueueFromHook)  |     |    (field list, JOINs) |
    +-------------------+     +------------------------+

    +-------------------+
    | 5. Remove/gate    |  (independent)
    |    direct CRUD    |
    +-------------------+
```

**Critical Path:** Rule enforcement -> Action transactionality -> Entity locking -> Hook execution -> Job enqueue

**Parallel Track:** Access checking, View query correctness, and Direct CRUD gating can proceed independently.

---

## 4. Release Criteria

### Functional Requirements

- [ ] Every `forbid` rule in the helpdesk example rejects mutations with the correct message code
- [ ] Every `require` rule in the helpdesk example enforces its condition
- [ ] Rule rejection returns HTTP 422 with `{"status": "error", "messages": [{"code": "TICKET_CLOSED"}]}`
- [ ] Action execution wraps rule check + mutation in a single PostgreSQL transaction
- [ ] `SELECT ... FOR UPDATE` is used before update/delete actions
- [ ] After-create, after-update, after-delete hooks fire and enqueue jobs
- [ ] Access rules are checked at the application level before queries execute
- [ ] View queries use the compiled field list, not `SELECT *`
- [ ] Direct entity CRUD endpoints (`/api/entities/{entity}`) return 404 when `FORGE_ENV=production`
- [ ] The helpdesk example app works end-to-end with all rules enforced

### Test Coverage Requirements

- [ ] Unit tests for rule evaluation engine (table-driven, all operators, forbid + require)
- [ ] Unit tests for access check middleware
- [ ] Unit tests for transaction wrapping (commit on success, rollback on rule violation)
- [ ] Unit tests for hook firing (correct timing, correct entity, correct operation)
- [ ] Unit tests for entity locking
- [ ] Integration tests: action with rule -> rejection -> correct message code
- [ ] Integration tests: action with rule -> allowed -> commit + hook + job enqueue
- [ ] Integration tests: concurrent updates -> no rule violation due to race
- [ ] Existing tests continue to pass (no regressions)
- [ ] Compiler tests: 80%+ statement coverage maintained
- [ ] Runtime tests: 70%+ statement coverage (up from current estimate of ~50%)

### Documentation Requirements

- [ ] Update `CLAUDE.md` changelog section
- [ ] Update `docs/runtime-reference.md` with rule enforcement behavior
- [ ] Update `docs/language-reference.md` with action operation types
- [ ] Add enforcement examples to `docs/examples.md`
- [ ] Release notes in `CHANGELOG.md`

### Example App Requirements

- [ ] Helpdesk app: ticket status rules enforced (cannot update closed ticket)
- [ ] Helpdesk app: access rules enforced (agents see their org's tickets only)
- [ ] Helpdesk app: hooks fire after ticket creation
- [ ] All existing E2E tests pass

### Performance Requirements

- [ ] Rule evaluation adds < 5ms latency to action execution (measured with 10 rules)
- [ ] Transaction overhead adds < 2ms latency compared to current non-transactional execution
- [ ] No connection pool exhaustion under 100 concurrent action requests

---

## 5. Risk Assessment

### Risk 1: Rule Evaluation Complexity (HIGH)

**Risk:** CEL expressions in rules may be complex (path traversal, `in` operators, nested conditions). Evaluating them at runtime requires either:
- (a) Integrating the CEL-Go library for runtime evaluation, or
- (b) Converting CEL to SQL and executing as a check query before mutation

**Mitigation:** Use approach (b) -- the compiler already generates SQL predicates (`sql_predicate` field in rule schema). Execute the predicate as `SELECT EXISTS(SELECT 1 FROM table WHERE id = $1 AND NOT (predicate))` to check if the rule would reject. This leverages existing SQL generation and requires no new dependency.

**Fallback:** If SQL predicates prove insufficient for complex expressions, add CEL-Go as a dependency and evaluate in-process. This is more flexible but adds ~2MB to the binary.

### Risk 2: Transaction Isolation Conflicts (MEDIUM)

**Risk:** Wrapping actions in explicit transactions may cause deadlocks under concurrent access, especially with `SELECT ... FOR UPDATE` and RLS policies.

**Mitigation:** Use `READ COMMITTED` isolation level (PostgreSQL default). Apply `FOR UPDATE SKIP LOCKED` for update actions to avoid deadlocks. Implement a 5-second transaction timeout. Add retry logic for serialization failures.

**Fallback:** If deadlocks persist, switch to advisory locks per entity ID instead of row-level locking.

### Risk 3: Direct CRUD Removal Breaking Existing Apps (MEDIUM)

**Risk:** Projects like the chat app may rely on direct entity CRUD endpoints for operations that do not have corresponding action declarations.

**Mitigation:** Gate behind `FORGE_ENV` rather than removing. In development mode, direct CRUD remains available with a deprecation warning logged. In production, return 404. Add a migration guide.

**Fallback:** Keep direct CRUD but require explicit opt-in via `app` declaration: `direct_access: true`.

### Risk 4: View JOIN Generation (MEDIUM)

**Risk:** Generating correct SQL JOINs for view fields that traverse relations (e.g., `author.name`) requires understanding the relation graph. Edge cases: many-to-many, circular references, ambiguous paths.

**Mitigation:** Start with single-hop relations only (e.g., `author.name` -> `LEFT JOIN users ON author_id = users.id`). Reject multi-hop relation paths in views for v0.3.0. The planner already tracks relation metadata.

**Fallback:** If JOIN generation proves too complex, keep `SELECT *` for views with relation fields and document the limitation.

### Risk 5: Hook/Job Integration Side Effects (LOW)

**Risk:** Firing hooks that enqueue jobs may have unintended side effects if job providers (email, HTTP) are not configured.

**Mitigation:** Hook execution should be fire-and-forget. If a job fails to enqueue (no provider configured), log a warning but do not fail the action. The action transaction must commit regardless of hook/job failures.

**Fallback:** N/A -- this is already the designed behavior in `jobs.Executor`.

---

## 6. Timeline Estimation

### T-Shirt Sizes

| # | Feature | Size | Estimated Effort | Dependencies |
|---|---------|------|------------------|--------------|
| 1 | Runtime rule enforcement | L | 3-5 days | None |
| 2 | Action transactionality | M | 2-3 days | #1 |
| 3 | Application-level access checking | M | 2-3 days | None |
| 4 | Hook execution after actions | M | 2-3 days | #2 |
| 5 | Remove/gate direct entity CRUD | S | 0.5-1 day | None |
| 6 | View query correctness | M | 2-3 days | None |
| 7 | Structured error responses | S | 1-2 days | #1 |
| 8 | Entity-level locking | S | 1-2 days | #2 |
| - | Integration tests | M | 2-3 days | All of above |
| - | Documentation updates | S | 1 day | All of above |
| - | Helpdesk app verification | S | 1 day | All of above |

**Total estimated effort:** 16-26 days of focused engineering work.

### Suggested Ordering

**Week 1-2: Foundation (Critical Path)**
1. Rule enforcement engine (#1) -- largest item, unblocks everything
2. Action transactionality (#2) -- wraps rules in transactions
3. Entity-level locking (#8) -- prevents race conditions

**Week 2-3: Enforcement (Parallel Tracks)**
4. Hook execution after actions (#4) -- depends on #2
5. Application-level access checking (#3) -- parallel with #4
6. Structured error responses (#7) -- parallel with #3-#4

**Week 3-4: Polish**
7. View query correctness (#6) -- independent
8. Remove/gate direct CRUD (#5) -- independent, small
9. Integration tests, documentation, helpdesk verification

### Parallelization Opportunities

- **Track A (enforcement):** #1 -> #2 -> #8 -> #4 (sequential, critical path)
- **Track B (access):** #3 -> #6 (can start immediately, parallel to Track A)
- **Track C (polish):** #5, #7 (small items, can be done by anyone at any time)

Two engineers working in parallel could complete this in approximately 3 weeks. One engineer: approximately 4-5 weeks.

---

## 7. Changelog Draft

```markdown
### [0.3.0] - TBD

#### Theme: "What You Compile Is What Runs"

FORGE v0.3.0 closes the enforcement gap between the compiler and runtime.
Rules, access control, and hooks are now enforced at runtime -- not just compiled.

#### Added
- **Runtime rule enforcement** -- `forbid` and `require` rules are evaluated
  before every action execution. Violations return structured error responses
  with the declared message code.
- **Action transactionality** -- Rule evaluation, entity mutation, and hook
  triggering execute within a single PostgreSQL transaction. Atomic commit
  on success, rollback on rule violation.
- **Application-level access checking** -- Access rules are verified before
  query execution, independent of PostgreSQL RLS. Provides clear error messages
  on access denied.
- **Hook execution** -- `after_create`, `after_update`, and `after_delete`
  hooks now fire after successful action commits. Jobs are enqueued through
  the existing job executor.
- **Entity-level locking** -- `SELECT ... FOR UPDATE` prevents concurrent
  mutations from violating rules.
- **View query correctness** -- Views use the compiled field list and generate
  JOINs for single-hop relation traversal.
- **Structured error responses** -- Rule rejections return the artifact message
  code and default text in the standard FORGE error format.

#### Changed
- Direct entity CRUD endpoints (`/api/entities/{entity}`) are now disabled
  in production mode (`FORGE_ENV=production`). Use actions instead.
  In development mode, they remain available with deprecation warnings.

#### Fixed
- Views no longer return `SELECT *`; they use the field list from the
  compiled artifact.

#### Security
- Actions are the sole mutation path in production, preventing rule bypass.
- Access control is enforced at both the application and database levels.
```

---

## Appendix A: Spec Sections with Zero Implementation

These spec sections have been parsed by the compiler but have no runtime behavior whatsoever:

1. **Section 12.1 -- Presence:** No token, no AST node, no parser support, no runtime.
2. **Section 12.2 -- Ephemeral:** No token, no AST node, no parser support, no runtime.
3. **Section 17 -- Imperative Code:** Parsed but no execution environment exists.
4. **Section 26 -- Frontend Contract Versioning:** No implementation at any level.
5. **Section 28 -- `forge test` command:** Tests are parsed but no runner exists.
6. **Section 29 -- Observability:** Single `action.started` log line. No structured event bus.
7. **Section 31 -- Offline / Optimistic UI:** No implementation at any level.

Recommendation: Consider moving sections 12.1, 12.2, 17, 26, and 31 from the spec to a separate "Future Directions" document to avoid the impression of promised-but-undelivered features.

## Appendix B: Spec Violations in Current Implementation

These are cases where the current implementation actively contradicts the spec:

1. **"Entities are immutable except through actions"** (Section 4) -- Direct CRUD endpoints exist at `/api/entities/{entity}`.
2. **"Rules cannot be bypassed"** (Section 6) -- Rules are never evaluated at runtime.
3. **"Access rules are enforced before queries"** (Section 7) -- No application-level access checking.
4. **"All mutations go through actions"** (Section 15) -- Direct CRUD bypasses actions.
5. **"No hidden state mutations"** (Section 20) -- Direct CRUD is a hidden mutation path.
6. **"No bypassable rules"** (Section 20) -- Rules are universally bypassed because they are never checked.
7. **"Race conditions prevented by construction"** (Section 15) -- No locking, no transactional rule checks.

v0.3.0 addresses all seven violations.
