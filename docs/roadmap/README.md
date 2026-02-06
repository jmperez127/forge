# FORGE v0.3.0 Release Roadmap

> **Theme: "What You Compile Is What Runs"**
>
> v0.2.0 built the compiler and runtime skeleton. v0.3.0 closes the gap — rules are enforced, jobs execute, views query real data, and one app proves it all works end-to-end.

---

## The Problem

FORGE's compiler generates SQL predicates, RLS policies, hook schemas, job definitions, and view queries. The runtime **ignores most of it**. Rules aren't evaluated. Jobs are enqueued but never run. Views return `SELECT *`. Access control policies exist in the artifact but aren't enforced.

The core value proposition — "guarantees that can't be bypassed" — is currently bypassable.

v0.3.0 fixes this.

---

## Roadmap Documents

10 detailed implementation plans, each written after thorough analysis of the actual codebase. Every TODO includes files to modify, code snippets, test cases, and acceptance criteria.

| # | Document | Lines | Summary |
|---|----------|-------|---------|
| 01 | [Rule Enforcement & Access Control](./01-rule-enforcement-and-access-control.md) | 1,051 | Wire CEL evaluation + RLS into action handlers. The #1 priority. |
| 02 | [Job Execution Pipeline](./02-job-execution-pipeline.md) | 775 | Complete the hook → enqueue → execute → effect pipeline. 3-phase approach. |
| 03 | [View Query Engine](./03-view-query-engine.md) | 500 | Replace `SELECT *` with real queries: JOINs, filters, cursors, pagination. |
| 04 | [Database & Migration Hardening](./04-database-and-migration-hardening.md) | 1,164 | Fix flaky embedded Postgres, wire migration tracking, add schema diffing. |
| 05 | [Imperative Escape Hatch](./05-imperative-escape-hatch.md) | 509 | Go function registry for custom logic. Maintains sealed runtime guarantee. |
| 06 | [Spec Reconciliation & Release Scoping](./06-spec-reconciliation-and-release-scoping.md) | 533 | Audit of all 37 spec sections. What ships, what's deferred, what's cut. |
| 07 | [Reference App (Helpdesk)](./07-reference-app-helpdesk.md) | 976 | Complete end-to-end app. 60+ TODOs, 39 E2E tests. The app that sells FORGE. |
| 08 | [SDK Completion](./08-sdk-completion.md) | 799 | @forge/client + @forge/react. Type-safe hooks, subscriptions, auth. |
| 09 | [Testing & CI Infrastructure](./09-testing-and-ci-infrastructure.md) | 1,677 | GitHub Actions pipeline, testcontainers, coverage enforcement. |
| 10 | [Developer Experience & CLI](./10-developer-experience-and-cli.md) | 1,133 | Rich error messages, `forge doctor`, dev mode fixes, VS Code extension. |

**Total: 9,117 lines of implementation detail.**

---

## Critical Path

These have hard dependencies — they must be done in order:

```
01 Rule Enforcement ──┐
                      ├──> 07 Reference App ──> Release
02 Job Execution ─────┤
                      │
03 View Query Engine ─┘
```

These can be parallelized alongside the critical path:

```
04 Database Hardening     (independent - infrastructure)
05 Imperative Escape Hatch (independent - new feature)
08 SDK Completion          (parallel with 03, feeds into 07)
09 Testing & CI            (start immediately, feeds everything)
10 Developer Experience    (parallel, but DX fixes help all other work)
```

---

## Execution Order

### Week 1-2: Foundation
- [ ] **09** Set up CI pipeline and fix flaky tests (unblocks everything)
- [ ] **04** Fix embedded Postgres / switch to Docker, wire migration tracking
- [ ] **01** Start rule enforcement (CEL evaluator, transaction wrapping)

### Week 3-4: Core Enforcement
- [ ] **01** Complete rule evaluation in action handlers
- [ ] **01** Access control for views and actions (RLS + application-level)
- [ ] **02** Wire hook evaluation, synchronous job executor (MVP)
- [ ] **03** View query builder: field projection, JOINs, filters

### Week 5-6: Views, Jobs, SDK
- [ ] **03** Cursor pagination, client filter params, WebSocket subscription updates
- [ ] **02** Needs resolution, capability sandboxing, job lifecycle
- [ ] **08** @forge/client: typed actions, views, auth, WebSocket manager
- [ ] **08** @forge/react: useList, useAction, useAuth hooks

### Week 7-8: Reference App + Polish
- [ ] **07** Complete helpdesk .forge spec, build frontend
- [ ] **07** Auth flow, ticket CRUD, real-time updates, E2E tests
- [ ] **10** Rich error messages, `forge doctor`, dev mode race condition fix
- [ ] **05** Imperative escape hatch (if time permits — can defer to v0.4.0)

### Week 9-10: Hardening + Release
- [ ] **09** Coverage enforcement, snapshot tests, E2E expansion
- [ ] **07** Polish reference app, write 2-minute quickstart README
- [ ] **06** Final spec reconciliation, write changelog, tag release
- [ ] **10** VS Code extension diagnostics, getting started guide

---

## What Ships in v0.3.0

### Must Ship
1. Business rules enforced in action handlers (forbid/require)
2. Access control filtering views and blocking unauthorized mutations
3. Jobs actually execute after action commit (at least synchronous MVP)
4. Views return projected fields with JOINs, not `SELECT *`
5. Reliable database migrations with tracking
6. CI pipeline with coverage enforcement
7. One complete reference app (helpdesk) running end-to-end
8. SDK with working React hooks

### Deferred to v0.4.0
- Presence / ephemeral types
- Redis-backed job queue
- Multi-tenancy scoping
- Cursor pagination for views
- Optimistic updates in SDK
- `forge test` command
- Interactive CLI tutorial

### Cut from Spec
- Offline/optimistic UI (client concern, not runtime)
- Frontend contract versioning (premature)
- Observability event streaming (add when needed)

---

## Key Findings from Codebase Audit

These are the most important discoveries the agents made while reading the code:

1. **`buildViewQuery` returns `SELECT * FROM table`** — ignores all field declarations, filters, and sorts (`handlers.go:582`)
2. **Rules are in the artifact but never evaluated** — `handleAction()` goes straight from parsing to SQL execution
3. **Migration tracking is dead code** — `_forge_migrations` table exists in code but is never called
4. **RLS policies can never be updated** — emitter generates `CREATE POLICY` without `DROP POLICY IF EXISTS` first
5. **Direct entity CRUD bypasses actions** — `/api/entities/{entity}` allows raw INSERT/UPDATE/DELETE without rules
6. **Jobs executor exists but is never instantiated** — `Server` struct has no `*jobs.Executor` field
7. **Hook evaluation never happens** — artifact contains hooks but no code reads them after action commit
8. **WebSocket view subscriptions are hardcoded** — entity-to-view mappings are specific to chat entities
9. **Access control `sql_predicate` is generated but never injected** — `WHERE` clauses exist in artifact, not in queries
10. **SDK types are all `any`** — view field types aren't resolved from entity definitions

---

## How to Use This Roadmap

Each document is self-contained. A developer can:

1. Open any document (e.g., `01-rule-enforcement-and-access-control.md`)
2. Read the "Current State Assessment" to understand what exists
3. Follow the ordered TODOs — each specifies exact files, code, and tests
4. Check items off the verification checklist when done

No external context needed. Every TODO is implementable from the document alone.

---

## Metrics

| Metric | v0.2.0 (current) | v0.3.0 (target) |
|--------|-------------------|------------------|
| Spec sections implemented | ~60% | ~80% |
| Rules enforced at runtime | 0% | 100% |
| Access control active | Partial (RLS setup only) | Full (CEL + RLS) |
| Jobs executing | 0% | 100% (sync MVP) |
| View query completeness | `SELECT *` | Full projection + JOINs |
| Test count | ~196 | ~400+ |
| Test coverage | Unknown | 80%+ statements |
| CI pipeline | None | Full (lint, test, E2E, coverage) |
| Working reference apps | 0 | 1 (helpdesk) |
| SDK hooks working | Stubs | Complete |

---

*Generated from 10 parallel codebase analysis agents. Each agent read the actual source code, traced compilation paths, and wrote implementation plans grounded in what exists — not what the spec promises.*
