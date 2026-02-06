# Job Execution Pipeline - Implementation Roadmap

**Status**: Not Started
**Priority**: Critical - Core feature gap
**Estimated Effort**: 3 sprints (Phase 1: 1 sprint, Phase 2: 1 sprint, Phase 3: 1 sprint)

---

## 1. Current State Assessment

### What Is Built

The infrastructure skeleton exists across three layers: compiler emission, executor scaffolding, and provider registry. None are wired together.

**Compiler Pipeline (fully functional):**
- `compiler/internal/normalizer/normalizer.go:419-442` -- `normalizeJobs()` correctly parses `.forge` job declarations into `NormalizedJob` structs with `InputType`, `NeedsPath`, `NeedsFilter`, and `Capabilities`.
- `compiler/internal/planner/planner.go:440-487` -- `planHooks()` correctly parses hook targets (`Ticket.after_create`) and extracts `enqueue` actions into `HookNode.Jobs[]`.
- `compiler/internal/emitter/emitter.go:303-323` -- Jobs and hooks are emitted correctly into `artifact.json`. The helpdesk artifact proves this: three jobs (`notify_agents`, `notify_author`, `notify_ticket_participants`) and three hooks are fully materialized.

**Executor Scaffolding (built but never called):**
- `runtime/internal/jobs/executor.go:38-55` -- `Executor` struct with goroutine worker pool, channel-based queue, and results channel.
- `runtime/internal/jobs/executor.go:73-87` -- `Start()` and `Stop()` lifecycle methods that spawn/drain workers.
- `runtime/internal/jobs/executor.go:89-113` -- `Enqueue()` method with ID generation, defaults, backoff queue.
- `runtime/internal/jobs/executor.go:122-212` -- `worker()` and `execute()` methods that resolve capabilities via registry and execute with timeout + retry.
- `runtime/internal/jobs/executor.go:214-241` -- `EnqueueFromHook()` bridge method designed to be called from the server layer.

**Provider Registry (fully functional):**
- `runtime/internal/provider/registry.go` -- Global registry with capability routing (`GetCapability()`), webhook routing (`GetWebhook()`), and `Init()` for config resolution.
- `runtime/internal/provider/builtin/http.go` -- HTTP provider with `http.get`, `http.post`, `http.put`, `http.delete`, `http.call` capabilities.
- `runtime/internal/provider/builtin/email.go` -- Email provider with `email.send` capability via SMTP.
- Both providers self-register via `init()` and are compile-time linked.

**Runtime Config (built, partially used):**
- `runtime/internal/config/config.go:69-79` -- `JobsConfig` struct with `Backend` ("redis", "postgres", "memory"), `URL`, and `Concurrency` fields.
- `runtime/internal/config/config.go:42-43` -- `Providers` map with per-provider config and `env:` secret resolution.

### What Is Stubbed

Nothing is explicitly stubbed. The code is structurally complete but the wiring does not exist.

### What Is Missing (The Gap)

These are the critical missing pieces, in order of the data flow:

| Gap | Location | Description |
|-----|----------|-------------|
| **G1** | `server.go` (Server struct) | Server has no reference to `*jobs.Executor` |
| **G2** | `server.go` (New function) | Executor is never instantiated, started, or stopped |
| **G3** | `server.go` (New function) | Provider registry `Init()` is never called with config |
| **G4** | `handlers.go` (handleAction) | After action commit, hooks are never evaluated |
| **G5** | `handlers.go` (handleCreate/Update/Delete) | CRUD handlers also never trigger hooks |
| **G6** | No code exists | Hook matching logic: given entity+operation, find matching hooks |
| **G7** | `executor.go` (EnqueueFromHook) | `jobSchemas` parameter requires conversion from `server.JobSchema` to `jobs.JobSchema` |
| **G8** | `executor.go` (execute) | `needs` clause data resolution is completely unimplemented -- entity data is passed raw without fetching related records |
| **G9** | No code exists | Job lifecycle tracking (pending/running/completed/failed) is in-memory only, no persistence |
| **G10** | No code exists | Capability sandboxing -- jobs can currently request any capability, not just declared ones |
| **G11** | No code exists | Dead letter handling for permanently failed jobs |
| **G12** | No code exists | Tests for the hook-to-job pipeline |

---

## 2. Architecture Design

### Complete Hook -> Enqueue -> Execute -> Effect Pipeline

```
User Request
    |
    v
handleAction() / handleCreate() / handleUpdate() / handleDelete()
    |
    v
[Database Transaction - INSERT/UPDATE/DELETE + RETURNING *]
    |
    v
[Transaction Commits Successfully]
    |
    v
evaluateHooks(entityName, operation, record)        <-- NEW
    |
    |-- match hooks from artifact where entity == entityName
    |   AND operation == operation AND timing == "after"
    |
    v
For each matching hook:
    |
    v
executor.EnqueueFromHook(hook.Jobs, record, artifact.Jobs)
    |
    v
[Job enters channel-based queue]
    |
    v
worker goroutine picks up Job
    |
    v
resolveNeedsData(job, record, db)                   <-- NEW
    |  Fetches related data per needs_path
    |  Applies needs_filter
    |
    v
validateCapability(job.Capability, job.Name)          <-- NEW
    |  Checks declared capability matches job schema
    |
    v
registry.GetCapability(job.Capability)
    |
    v
provider.Execute(ctx, capability, resolvedData)
    |
    v
[email.send / http.post / etc.]
    |
    v
JobResult -> results channel -> logging/metrics
```

### Key Design Decisions

1. **Post-commit only**: Jobs fire ONLY after the database transaction commits. If the transaction rolls back, no jobs are enqueued. This is non-negotiable for data consistency.

2. **Fire-and-forget from the request path**: The HTTP handler does NOT wait for jobs to complete. `evaluateHooks()` enqueues and returns immediately. The user gets their response without waiting for email delivery.

3. **Capability sandboxing at enqueue time**: When `EnqueueFromHook` creates a `Job`, it validates that the job's declared capabilities match what the artifact allows. A job declared with `effect: email.send` cannot suddenly execute `http.post`.

4. **Needs resolution happens in the worker**: The heavy lifting of following relation paths and querying the database happens in the worker goroutine, not in the request path. This keeps request latency low.

---

## 3. Implementation Plan

### Phase 1: Synchronous In-Process Executor (MVP)

Goal: Jobs actually run. After an action commits, hooks fire, jobs execute their effects through providers. No persistence, no Redis, no external dependencies.

---

#### TODO 1.1: Wire Provider Registry Initialization

- [ ] **Initialize the global provider registry with config from `forge.runtime.toml` during server startup.**

**Files to modify:**
- `runtime/internal/server/server.go`

**Implementation:**

Add provider initialization in the `New()` function, after runtime config is loaded and secrets are resolved (after line 222):

```go
import (
    "github.com/forge-lang/forge/runtime/internal/provider"
    _ "github.com/forge-lang/forge/runtime/internal/provider/builtin" // register built-in providers
)

// In New(), after runtimeConf.ResolveSecrets():

// Initialize provider registry with config
providerConfigs := runtimeConf.GetProviderConfigs()
registry := provider.Global()
if err := registry.Init(providerConfigs); err != nil {
    logger.Warn("provider registry initialization failed", "error", err)
    // Non-fatal: jobs that need uninitialized providers will fail at execution time
}
logger.Info("provider registry initialized",
    "providers", registry.Providers(),
    "capabilities", registry.Capabilities(),
)
```

**Test cases:**
- Server starts successfully with empty provider config.
- Server starts successfully with email provider config.
- Server logs warning when provider init fails (e.g., bad config).
- `registry.Capabilities()` returns `["email.send", "http.get", "http.post", "http.put", "http.delete", "http.call"]` after init.

**Acceptance criteria:**
- Provider registry is initialized before any request is handled.
- Built-in providers (email, HTTP) are available via `registry.GetCapability()`.

---

#### TODO 1.2: Wire Job Executor to Server

- [ ] **Add `*jobs.Executor` to Server struct, start it on server init, stop it on shutdown.**

**Files to modify:**
- `runtime/internal/server/server.go`

**Implementation:**

Add executor to Server struct:

```go
import (
    "github.com/forge-lang/forge/runtime/internal/jobs"
    "github.com/forge-lang/forge/runtime/internal/provider"
)

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
    executor     *jobs.Executor  // NEW
}
```

In `New()`, after provider registry init:

```go
// Create and start job executor
workerCount := runtimeConf.Jobs.Concurrency
if workerCount <= 0 {
    workerCount = 10
}
executor := jobs.NewExecutor(provider.Global(), logger, workerCount)

s := &Server{
    // ... existing fields ...
    executor: executor,
}

// Start executor workers
s.executor.Start()

// Start result drain goroutine (logs results, prevents channel backup)
go s.drainJobResults()
```

Add result drain and shutdown:

```go
// drainJobResults reads from the executor results channel and logs outcomes.
func (s *Server) drainJobResults() {
    for result := range s.executor.Results() {
        if result.Success {
            s.logger.Info("job.completed",
                "job_id", result.JobID,
                "duration_ms", result.Duration.Milliseconds(),
            )
        } else {
            s.logger.Error("job.failed",
                "job_id", result.JobID,
                "error", result.Error,
                "duration_ms", result.Duration.Milliseconds(),
            )
        }
    }
}
```

In `Run()`, update the shutdown sequence (after `srv.Shutdown`):

```go
// Stop job executor (drain in-flight jobs)
if s.executor != nil {
    s.logger.Info("stopping job executor")
    s.executor.Stop()
}
```

In `Close()`:

```go
func (s *Server) Close() error {
    if s.watcher != nil {
        s.watcher.Stop()
    }
    if s.executor != nil {
        s.executor.Stop()
    }
    if s.db != nil {
        return s.db.Close()
    }
    return nil
}
```

**Test cases:**
- Server creates executor with configured worker count.
- Server starts executor workers on startup.
- Server stops executor gracefully on shutdown (in-flight jobs complete).
- Default worker count is 10 when config is 0.

**Acceptance criteria:**
- `s.executor` is non-nil after `New()`.
- Workers are running and ready to process jobs.
- Graceful shutdown waits for in-flight jobs.

---

#### TODO 1.3: Implement Hook Evaluation After Action Commit

- [ ] **After every successful action (create/update/delete), evaluate matching hooks from the artifact and enqueue their jobs.**

**Files to modify:**
- `runtime/internal/server/handlers.go`

**Implementation:**

Add the hook evaluation method:

```go
// evaluateHooks finds hooks matching entity+operation and enqueues their jobs.
// Called AFTER the database transaction commits successfully.
// This is fire-and-forget: errors are logged but do not affect the HTTP response.
func (s *Server) evaluateHooks(entityName, operation string, record map[string]interface{}) {
    artifact := s.getArtifact()
    if artifact.Hooks == nil {
        return
    }

    for _, hook := range artifact.Hooks {
        if hook.Entity != entityName {
            continue
        }
        if hook.Operation != operation {
            continue
        }
        if hook.Timing != "after" {
            continue // Phase 1: only after hooks
        }
        if len(hook.Jobs) == 0 {
            continue
        }

        s.logger.Info("hook.matched",
            "entity", entityName,
            "operation", operation,
            "timing", hook.Timing,
            "jobs", hook.Jobs,
        )

        // Convert artifact job schemas to executor job schemas
        jobSchemas := make(map[string]*jobs.JobSchema)
        for _, jobName := range hook.Jobs {
            if js, ok := artifact.Jobs[jobName]; ok {
                jobSchemas[jobName] = &jobs.JobSchema{
                    Name:         js.Name,
                    InputEntity:  js.InputEntity,
                    NeedsPath:    "", // TODO Phase 2: needs resolution
                    NeedsFilter:  "", // TODO Phase 2: needs resolution
                    Capabilities: js.Capabilities,
                }
            }
        }

        // Convert record values to map[string]any for the executor
        entityData := make(map[string]any, len(record))
        for k, v := range record {
            entityData[k] = v
        }

        if err := s.executor.EnqueueFromHook(hook.Jobs, entityData, jobSchemas); err != nil {
            s.logger.Error("hook.enqueue_failed",
                "entity", entityName,
                "operation", operation,
                "error", err,
            )
        }
    }
}
```

Wire into action handlers. In `executeCreateAction`, after `s.broadcastEntityChange(entity.Name, "create", record)` (around line 755):

```go
    s.broadcastEntityChange(entity.Name, "create", record)
    s.evaluateHooks(entity.Name, "create", record)
    s.respond(w, http.StatusCreated, record)
```

In `executeUpdateAction` after the broadcast:

```go
    s.broadcastEntityChange(entity.Name, "update", record)
    s.evaluateHooks(entity.Name, "update", record)
    s.respond(w, http.StatusOK, record)
```

In `executeDeleteAction` after the broadcast:

```go
    s.broadcastEntityChange(entity.Name, "delete", map[string]interface{}{"id": idStr})
    s.evaluateHooks(entity.Name, "delete", map[string]interface{}{"id": idStr})
```

Also in `handleCreate`, `handleUpdate`, `handleDelete` (the direct CRUD handlers), and in `executeWebhookAction`.

**Test cases:**
- `evaluateHooks("Ticket", "create", record)` matches `Ticket.after_create` hook and enqueues `notify_agents`.
- `evaluateHooks("Ticket", "update", record)` matches `Ticket.after_update` and enqueues `notify_author`.
- `evaluateHooks("Ticket", "delete", record)` with no matching hook enqueues nothing.
- `evaluateHooks("Unknown", "create", record)` with no matching entity enqueues nothing.
- Multiple hooks for same entity+operation all fire.
- Enqueue failure is logged but does not cause HTTP 500.

**Acceptance criteria:**
- Creating a ticket via `POST /api/actions/create_ticket` results in `notify_agents` being enqueued.
- The HTTP response is returned before the job executes.
- Job execution appears in server logs.

---

#### TODO 1.4: Add Hook Evaluation Tests

- [ ] **Write comprehensive tests for the hook-to-enqueue pipeline.**

**Files to create:**
- `runtime/internal/server/hooks_test.go`

**Test cases to cover:**
- Hook matches correct entity and operation
- No matching hook results in zero enqueues
- Multiple hooks for same event all fire
- Before hooks are ignored (Phase 1 only supports after)
- Nil or empty Hooks slice handled gracefully
- Missing job schema logs warning and continues
- Enqueue failure logged but does not propagate

**Acceptance criteria:**
- All hook matching edge cases covered.
- Tests run without external dependencies.

---

#### TODO 1.5: Add Executor Unit Tests

- [ ] **Write unit tests for `jobs.Executor` covering the full enqueue-execute-result cycle.**

**Files to create:**
- `runtime/internal/jobs/executor_test.go`

**Test cases to cover:**
- Enqueue and execute a job successfully
- Retry on transient failure (fail N-1 times, succeed on Nth)
- Max attempts exhausted results in final failure
- Unknown capability returns descriptive error
- Graceful shutdown completes in-flight jobs
- Queue overflow returns error
- `EnqueueFromHook` creates jobs with correct fields
- `EnqueueFromHook` with missing schema logs warning

**Acceptance criteria:**
- All executor code paths tested.
- Tests complete in under 5 seconds.

---

### Phase 2: Needs Resolution + Capability Sandboxing

Goal: Jobs receive correct data via the `needs` clause. Jobs restricted to declared capabilities.

---

#### TODO 2.1: Implement Needs Data Resolution

- [ ] **Resolve the `needs` clause by following relation paths and querying the database.**

**Files to create:**
- `runtime/internal/jobs/needs_resolver.go`
- `runtime/internal/jobs/needs_resolver_test.go`

**Files to modify:**
- `runtime/internal/jobs/executor.go` (add db, artifact access; call resolver before execute)
- `runtime/internal/server/server.go` (pass db and artifact getter to executor)

**Implementation details:**

The `needs` clause `"Ticket.org.members"` means:
1. Parse path into segments: `["Ticket", "org", "members"]`
2. Skip first segment (trigger entity)
3. For `"org"` (single relation): read `org_id` from trigger record, `SELECT * FROM organizations WHERE id = $1`
4. For `"members"` (many relation): `SELECT * FROM users WHERE organization_id = $1`
5. Apply `needs_filter` (e.g., `"(role == agent)"`) to filter results

The executor constructor gains `db` and `artifactFn` parameters. Needs resolution happens inside `execute()`, before the provider call.

**Test cases:**
- Single-hop: `Ticket.author` resolves to one User record
- Multi-hop: `Ticket.org.members` resolves to multiple User records
- With filter: `where role == agent` reduces result set
- Missing FK: returns empty, no error
- Unknown relation: returns error
- Empty needs_path: returns trigger record as-is

**Acceptance criteria:**
- `notify_agents` receives agent User records, not raw Ticket data.
- Needs resolution happens in worker goroutine, not request path.

---

#### TODO 2.2: Implement Capability Sandboxing

- [ ] **Enforce that jobs only execute declared capabilities.**

**Files to modify:**
- `runtime/internal/jobs/executor.go`

**Implementation:**

Add `AllowedCapabilities []string` to `Job` struct. Populate in `EnqueueFromHook` from artifact schema. Check in `execute()` before provider call. Sandbox violations are logged at ERROR and are never retried.

**Test cases:**
- Allowed capability executes normally
- Disallowed capability rejected with sandbox violation error
- Nil AllowedCapabilities permits execution (backward compat)
- Sandbox violations not retried

**Acceptance criteria:**
- Job with `effect: email.send` cannot execute `http.post`.
- Violations visible in logs.

---

#### TODO 2.3: Add Job Lifecycle States

- [ ] **Track job state: pending -> running -> completed/failed/dead.**

**Files to modify:**
- `runtime/internal/jobs/executor.go`

**Implementation:**

Add `Status JobStatus`, `StartedAt`, `CompletedAt` fields to `Job`. Update transitions in `Enqueue()` and `execute()`. Include status in structured log fields.

**Acceptance criteria:**
- Job status visible in logs.
- Dead (max retries exhausted) distinguishable from retriable failures.

---

### Phase 3: Redis-Backed Persistent Queue (Production)

Goal: Jobs survive restarts. Distributed workers. Observable metrics.

---

#### TODO 3.1: Abstract Queue Backend Interface

- [ ] **Create `Queue` interface with `memory` and `redis` implementations.**

**Files to create:**
- `runtime/internal/jobs/queue.go` (interface)
- `runtime/internal/jobs/queue_memory.go` (channel-based)
- `runtime/internal/jobs/queue_redis.go` (Redis BRPOP + sorted set)
- `runtime/internal/jobs/queue_test.go` (interface contract tests)

**Acceptance criteria:**
- Both backends pass identical interface tests.
- Backend selected by `config.Jobs.Backend`.

---

#### TODO 3.2: Add Dead Letter Queue Inspection

- [ ] **Expose `/_dev/jobs/dead` endpoint.**

**Files to modify:**
- `runtime/internal/server/devinfo.go`

**Acceptance criteria:**
- Dead letter contents visible with error details.
- Only available in development mode.

---

#### TODO 3.3: Add Job Metrics Dev Endpoint

- [ ] **Expose `/_dev/jobs/stats` with real-time counters.**

**Files to modify:**
- `runtime/internal/jobs/executor.go` (add `atomic.Int64` counters)
- `runtime/internal/server/devinfo.go` (add stats endpoint)

**Acceptance criteria:**
- Returns worker_count, queue_depth, total_enqueued, total_completed, total_failed, total_retried, total_dead.
- Race-free (atomic counters).

---

## 4. Provider Integration

### Capability Resolution Chain

```
Job.Capability ("email.send")
  -> registry.GetCapability("email.send")
  -> capabilities["email.send"] -> EmailProvider
  -> EmailProvider.Execute(ctx, "email.send", data)
```

Providers self-register via `init()` in their package. `EmailProvider` registers `"email.send"`. `HTTPProvider` registers `"http.get"`, `"http.post"`, `"http.put"`, `"http.delete"`, `"http.call"`.

### Adding New Providers

1. Create `runtime/internal/provider/builtin/twilio.go`
2. Implement `CapabilityProvider` with `Capabilities() -> ["sms.send"]`
3. Call `provider.Register()` in `init()`
4. Add config to `forge.runtime.toml`
5. Jobs with `effect: sms.send` automatically route to it

No executor or server changes needed.

---

## 5. Error Handling

### Retry Logic

Current: quadratic backoff (`attempt^2` seconds). Recommended improvements: add jitter, cap at 5 minutes.

```go
func backoffWithJitter(attempt int) time.Duration {
    base := time.Duration(attempt*attempt) * time.Second
    jitter := time.Duration(rand.Int63n(int64(base/4 + 1)))
    backoff := base + jitter
    if backoff > 5*time.Minute {
        return 5 * time.Minute
    }
    return backoff
}
```

### Dead Letter

Jobs exceeding MaxAttempts: stored in dead letter, logged at ERROR, counted in metrics, never retried.

### Failure Classification

Introduce `PermanentError` type. Providers return permanent errors for 4xx, invalid addresses, etc. Transient errors (5xx, timeouts) trigger retries. Sandbox violations are permanent.

---

## 6. Capability Sandboxing

**Three enforcement points:**
1. Compile time: analyzer validates effect references
2. Enqueue time: `AllowedCapabilities` populated from artifact
3. Execution time: checked before provider call (defense-in-depth)

Violations: ERROR log, no retry, counted in metrics.

---

## 7. Transaction Boundaries

Jobs fire ONLY after database write commits. Current auto-commit mode satisfies this. Future explicit transactions must move hook evaluation after `tx.Commit()`.

---

## 8. Timeout Handling

Default: 30 seconds per job. Make configurable via `[jobs] timeout` in `forge.runtime.toml`. On timeout: `context.DeadlineExceeded` propagates, standard retry applies, dead letter after max attempts.

---

## 9. Logging and Observability

| Event | Level | Key Fields |
|-------|-------|------------|
| `job.enqueued` | DEBUG | job_id, name, capability |
| `hook.matched` | INFO | entity, operation, timing, jobs |
| `hook.enqueue_failed` | ERROR | entity, operation, error |
| `job.completed` | INFO | job_id, name, capability, duration_ms |
| `job.failed` | WARN | job_id, name, attempt, max_attempts, error |
| `job.dead_letter` | ERROR | job_id, name, attempts, last_error, total_duration |
| `job.sandbox_violation` | ERROR | job_id, name, attempted, allowed |
| `executor.started` | INFO | workers |
| `executor.stopped` | INFO | |

---

## 10. Testing Strategy

### Unit Tests

| Package | File | Coverage |
|---------|------|----------|
| `jobs` | `executor_test.go` | Enqueue, execute, retry, shutdown, overflow, sandbox |
| `jobs` | `needs_resolver_test.go` | Path following, filter, error handling |
| `jobs` | `queue_memory_test.go` | Queue interface compliance |
| `jobs` | `queue_redis_test.go` | Queue interface (testcontainers) |
| `server` | `hooks_test.go` | Hook matching, enqueue, nil safety |

### Integration Tests

| Scenario | Validates |
|----------|-----------|
| Create ticket -> hook -> job -> email.send called | Full pipeline |
| Create ticket -> no provider -> graceful failure | Error path |
| Create ticket -> 3 failures -> dead letter | Retry exhaustion |
| Update ticket -> different hook -> different job | Hook specificity |
| Two hooks on same event -> both fire | Multi-hook |

### Mock Provider

Use `RecordingProvider` that captures all `Execute` calls with thread-safe assertions.

---

## 11. Verification Checklist

### Phase 1 Complete When:

- [ ] Provider registry initialized on startup
- [ ] Executor starts with configured worker count
- [ ] Executor stops gracefully on shutdown
- [ ] `POST /api/actions/create_ticket` triggers `notify_agents` job
- [ ] Job execution in structured logs
- [ ] Retry with backoff up to MaxAttempts
- [ ] HTTP response before job completes
- [ ] Nil hooks handled gracefully
- [ ] Enqueue errors logged, not HTTP 500
- [ ] Unit tests for all new code
- [ ] `go test ./runtime/...` passes
- [ ] No goroutine leaks

### Phase 2 Complete When:

- [ ] Needs resolution follows relation paths
- [ ] Needs filter reduces result set
- [ ] Fan-out: N resolved records -> N effect executions
- [ ] Capability sandboxing enforced
- [ ] Sandbox violations not retried
- [ ] Lifecycle states tracked
- [ ] All tests pass

### Phase 3 Complete When:

- [ ] Memory and Redis queue backends
- [ ] Redis queue survives restart
- [ ] Dead letter inspection via `/_dev/jobs/dead`
- [ ] Metrics via `/_dev/jobs/stats`
- [ ] Both backends pass contract tests

---

## Appendix: File Change Summary

### Phase 1 (4-5 files changed, 2 created)

| File | Type | Description |
|------|------|-------------|
| `runtime/internal/server/server.go` | MODIFY | executor field, provider init, lifecycle |
| `runtime/internal/server/handlers.go` | MODIFY | evaluateHooks(), wire into handlers |
| `runtime/internal/server/hooks_test.go` | CREATE | Hook evaluation tests |
| `runtime/internal/jobs/executor_test.go` | CREATE | Executor tests |

### Phase 2 (3 modified, 2 created)

| File | Type | Description |
|------|------|-------------|
| `runtime/internal/jobs/executor.go` | MODIFY | db/artifact params, sandbox, lifecycle |
| `runtime/internal/jobs/needs_resolver.go` | CREATE | Relation path resolver |
| `runtime/internal/jobs/needs_resolver_test.go` | CREATE | Resolver tests |
| `runtime/internal/server/server.go` | MODIFY | Pass db to executor |
| `runtime/internal/server/handlers.go` | MODIFY | Pass needs fields |

### Phase 3 (2 modified, 4 created)

| File | Type | Description |
|------|------|-------------|
| `runtime/internal/jobs/queue.go` | CREATE | Queue interface |
| `runtime/internal/jobs/queue_memory.go` | CREATE | Channel queue |
| `runtime/internal/jobs/queue_redis.go` | CREATE | Redis queue |
| `runtime/internal/jobs/queue_test.go` | CREATE | Contract tests |
| `runtime/internal/server/devinfo.go` | MODIFY | Dead letter + stats endpoints |
| `runtime/go.mod` | MODIFY | Redis dependency |
