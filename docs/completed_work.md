# Completed Work

> Archive of completed feature implementations. Moved from journal_current_work.md when features are fully done.

---

## Feature: Entity Creation from Jobs (`creates:` clause)

**Completed**: 2026-02-06
**Issue**: GitHub Issue #12

Jobs can create new entity records using `creates:` clause in `.forge` files. Enables audit logs, activity tracking, and derived data. Full compiler pipeline (parse, analyze, normalize, emit) + runtime (field mapping resolution, EntityProvider, parameterized SQL INSERT). 22 new tests across compiler and runtime. Both helpdesk and chat example apps updated with ActivityLog entities.

---

## Feature: Job Execution Pipeline (Phase 1 - Synchronous MVP)

**Completed**: 2026-02-06
**Roadmap**: [02-job-execution-pipeline.md](./roadmap/02-job-execution-pipeline.md)

### Summary
Wired the complete hook → enqueue → execute → effect pipeline. Hooks fire after entity mutations (create/update/delete), enqueue jobs into a channel-based worker pool, and execute capabilities (email.send, http.call) through the provider registry. Phase 1 is synchronous in-process only (no Redis).

### Final Verification
- `go build ./...` -- PASS
- `go vet ./...` -- PASS
- Server package: 55 tests PASS
- Jobs package: 14 tests PASS
- Provider package: all tests PASS
- Security package: all tests PASS
- Zero regressions

### Files Created
- `runtime/internal/server/hooks.go` -- evaluateHooks() implementation
- `runtime/internal/jobs/executor_test.go` -- 14 unit tests
- `runtime/internal/server/hooks_test.go` -- 15 unit tests
- `runtime/internal/server/hooks_integration_test.go` -- 10 integration tests

### Files Modified
- `runtime/internal/server/server.go` -- Executor wiring, provider init, lifecycle
- `runtime/internal/server/handlers.go` -- evaluateHooks() in all 7 mutation paths
- `runtime/internal/server/devinfo.go` -- /_dev/jobs endpoint
- `runtime/internal/jobs/executor.go` -- sync.Once fix, helper methods
- `projects/chat/hooks.forge` -- Added Thread.after_create hook
- `projects/chat/jobs.forge` -- Added notify_parent_author job, fixed effects

### Key Decisions
- evaluateHooks() in its own file (hooks.go)
- Fire-and-forget: errors logged, don't affect HTTP response
- Phase 1 = "after" hooks only (before hooks deferred to Phase 2)
- sync.Once on Stop() to prevent double-close panics
- Shallow-copy record map so hooks don't mutate each other's data
