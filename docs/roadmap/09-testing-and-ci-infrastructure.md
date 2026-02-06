# 09 - Testing & CI Infrastructure Roadmap

> **Author perspective**: Principal Engineer, Developer Productivity
> **Status**: Proposed
> **Last updated**: 2026-02-05
> **Estimated effort**: 5 weeks (1 engineer)

---

## 1. Current State Assessment

### 1.1 Test Inventory

FORGE has **16 test files** across 3 layers. Every test file was read and analyzed.

#### Compiler Tests (5 files, ~38 tests)

| File | Tests | Pattern | Status |
|------|-------|---------|--------|
| `compiler/internal/lexer/lexer_test.go` | 7 | Table-driven | Stable |
| `compiler/internal/parser/parser_test.go` | 13 | Table-driven | Stable |
| `compiler/internal/analyzer/analyzer_test.go` | 8 | Table-driven | Stable |
| `compiler/internal/normalizer/normalizer_test.go` | 4 | Table-driven | Stable |
| `compiler/forge/compile_test.go` | 6 | Table-driven | Stable |

Compiler tests are the healthiest part of the suite. Pure functions, no I/O, no concurrency. These are the model to replicate across the codebase.

#### Runtime Tests (11 files, ~74 tests)

| File | Tests | Pattern | Status |
|------|-------|---------|--------|
| `runtime/internal/server/server_test.go` | 7 | httptest | Stable |
| `runtime/internal/server/auth_test.go` | 14 | httptest | Stable |
| `runtime/internal/server/action_test.go` | 8 | Mock DB | Stable |
| `runtime/internal/server/websocket_test.go` | 4 | gorilla/websocket | **FLAKY** |
| `runtime/internal/server/watcher_test.go` | 4 | fsnotify | **FLAKY** |
| `runtime/internal/provider/registry_test.go` | 5 | Mock providers | Stable |
| `runtime/internal/provider/builtin/http_test.go` | 10 | httptest | Stable |
| `runtime/cmd/forge/main_test.go` | 11 | Binary exec | **FLAKY** |
| `runtime/internal/security/ratelimit_test.go` | 4 | Unit | Stable |
| `runtime/internal/security/botfilter_test.go` | 4 | Unit | Stable |
| `runtime/internal/security/turnstile_test.go` | 3 | httptest | Stable |

#### E2E Tests (3 files, ~84 tests)

| File | Tests | Pattern | Status |
|------|-------|---------|--------|
| `e2e/tests/smoke.spec.ts` | 4 | Playwright | Stable |
| `e2e/tests/helpdesk.spec.ts` | ~25 | Playwright | 2 skipped |
| `e2e/tests/chat.spec.ts` | ~55 | Playwright | Partial |

### 1.2 Known Flaky Tests

**3 files contain flaky tests. All 3 share the same root cause pattern: non-deterministic synchronization.**

| File | Root Cause | Impact |
|------|-----------|--------|
| `websocket_test.go` | `time.Sleep(10ms)` for hub broadcast sync | Fails under CPU contention |
| `watcher_test.go` | `time.Sleep(50-200ms)` for fsnotify debounce | Fails on slow CI runners |
| `main_test.go` | Embedded Postgres startup race + port conflicts | Fails ~20% of runs |

### 1.3 Coverage Gaps

**7 packages have 0% test coverage:**

| Package | Risk | Priority |
|---------|------|----------|
| `compiler/internal/planner/` | High - generates migrations and action graphs | P0 |
| `compiler/internal/emitter/` | High - generates artifact, SQL, TypeScript SDK | P0 |
| `compiler/internal/diag/` | Low - simple diagnostic types | P2 |
| `runtime/internal/db/` | Critical - all database operations | P0 |
| `runtime/internal/jobs/` | Medium - job execution | P1 |
| `runtime/internal/config/` | Low - configuration loading | P2 |
| `runtime/internal/security/middleware.go` | Medium - untracked, untested middleware | P1 |

**Missing test categories entirely:**

| Category | What's Missing |
|----------|---------------|
| Snapshot tests | No artifact stability tests. Compiler output could drift silently. |
| Fuzz tests | Lexer and parser accept arbitrary input but have zero fuzz coverage. |
| Performance tests | No benchmarks for compilation, query generation, or WebSocket throughput. |
| Database integration tests | `runtime/internal/db/db_test.go` does not exist. All DB tests use mocks. |
| Migration tests | No tests verify that generated SQL migrations actually apply and produce correct schemas. |

### 1.4 CI Pipeline Assessment

**Current CI (`.github/workflows/ci.yml`):**

```yaml
# 3 jobs: test, build, lint
# Problems:
# 1. References projects/endeavor which was REMOVED (commit 42ac97b)
# 2. No Postgres service - skips all integration tests
# 3. No coverage reporting
# 4. No E2E tests
# 5. No caching for Go modules or Playwright browsers
# 6. No artifact upload on failure
# 7. Single Go version, no matrix
```

The release pipeline (`.github/workflows/release.yml`) is functional and builds multi-platform binaries.

### 1.5 Infrastructure Assessment

| Component | Current | Target |
|-----------|---------|--------|
| Go test runner | `go test ./...` | `go test ./... -race -coverprofile` |
| Integration DB | embedded-postgres (flaky) | testcontainers-go (reliable) |
| E2E browsers | Chromium, Firefox, WebKit | Same, with retry and sharding |
| CI platform | GitHub Actions (minimal) | GitHub Actions (full pipeline) |
| Coverage tool | None | Codecov with thresholds |
| Snapshot tool | None | Custom Go snapshot helper |
| Fuzz tool | None | `go test -fuzz` (native) |

---

## 2. Testing Strategy

### 2.1 Unit Tests (Compiler)

**Goal**: Every compiler pass has table-driven tests for valid input, invalid input, and edge cases.

The existing pattern is excellent. Replicate it to untested packages:

```go
// Pattern: table-driven with subtests
func TestPlannerGeneratesMigrations(t *testing.T) {
    tests := []struct {
        name   string
        source string
        want   []string // expected SQL statements
    }{
        {
            name: "creates table for entity",
            source: `
app Test {}
entity User {
  email: string
}`,
            want: []string{
                "CREATE TABLE users",
                "email TEXT NOT NULL",
            },
        },
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // parse -> analyze -> normalize -> plan
            output := compileTo(t, tt.source, "plan")
            for _, s := range tt.want {
                if !strings.Contains(output.SQL, s) {
                    t.Errorf("expected SQL to contain %q, got:\n%s", s, output.SQL)
                }
            }
        })
    }
}
```

**Priority tests to add:**

- [ ] `compiler/internal/planner/planner_test.go` - Migration generation, action graph construction, index creation, enum handling
- [ ] `compiler/internal/emitter/emitter_test.go` - Artifact JSON structure, schema SQL correctness, TypeScript SDK generation, webhook handler generation
- [ ] `compiler/internal/diag/diag_test.go` - Diagnostic creation, severity levels, range tracking

### 2.2 Unit Tests (Runtime)

**Goal**: Every handler, middleware, and service has tests with mocked dependencies.

The existing mock pattern in `action_test.go` is solid:

```go
// Existing pattern - mock DB interfaces
type mockDB struct {
    queryFunc   func(ctx context.Context, sql string, args ...any) (Rows, error)
    execFunc    func(ctx context.Context, sql string, args ...any) (Result, error)
    beginFunc   func(ctx context.Context) (Tx, error)
}

func (m *mockDB) Query(ctx context.Context, sql string, args ...any) (Rows, error) {
    if m.queryFunc != nil {
        return m.queryFunc(ctx, sql, args...)
    }
    return nil, nil
}
```

**Priority tests to add:**

- [ ] `runtime/internal/db/db_test.go` - Connection lifecycle, query execution, transaction commit/rollback, connection pool behavior
- [ ] `runtime/internal/db/embedded_test.go` - Embedded Postgres startup/shutdown, ephemeral mode cleanup
- [ ] `runtime/internal/jobs/executor_test.go` - Job dispatch, capability provider lookup, retry logic, failure handling
- [ ] `runtime/internal/security/middleware_test.go` - Full middleware chain: bot filter + rate limiter + turnstile integration

### 2.3 Integration Tests (Database)

**Goal**: Verify that compiled SQL actually works against a real PostgreSQL instance.

Integration tests MUST be gated behind `-short`:

```go
func TestMigrationApplies(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }

    ctx := context.Background()
    container := startPostgres(t, ctx) // testcontainers helper
    defer container.Terminate(ctx)

    db := connectTo(t, container)

    // Compile a .forge file
    artifact := compile(t, helpdeskSource)

    // Apply the generated migration
    _, err := db.Exec(ctx, artifact.Schema)
    if err != nil {
        t.Fatalf("migration failed: %v", err)
    }

    // Verify table exists with correct columns
    rows, err := db.Query(ctx,
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tickets'")
    // assert columns...
}
```

### 2.4 E2E Tests

**Goal**: Every user-facing flow has Playwright coverage across 3 browsers.

Current E2E infrastructure is well-structured. Improvements needed:

- [ ] Unskip the 2 helpdesk tests (real-time updates, access control)
- [ ] Add E2E tests for webhook delivery flows
- [ ] Add E2E tests for job execution side effects
- [ ] Add visual regression tests for the `/_dev` dashboard
- [ ] Add retry configuration in `playwright.config.ts` for CI stability

```typescript
// playwright.config.ts additions
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html']],
});
```

### 2.5 Snapshot Tests

**Goal**: Compiler output is stable across changes. Any drift is intentional and reviewed.

```go
// compiler/forge/snapshot_test.go
func TestArtifactSnapshot(t *testing.T) {
    source := readFile(t, "testdata/helpdesk.forge")
    result, diags := forge.Compile(source, "helpdesk.forge")
    if diags.HasErrors() {
        t.Fatalf("compilation failed: %v", diags.Errors())
    }

    // Snapshot the artifact JSON
    snapshotJSON(t, "testdata/snapshots/helpdesk-artifact.json", result.Artifact)

    // Snapshot the schema SQL
    snapshotText(t, "testdata/snapshots/helpdesk-schema.sql", result.Schema)

    // Snapshot the TypeScript SDK
    snapshotText(t, "testdata/snapshots/helpdesk-client.ts", result.ClientSDK)
}

// snapshotJSON compares output to golden file.
// Run with -update to regenerate: go test ./... -update
func snapshotJSON(t *testing.T, path string, got any) {
    t.Helper()
    gotBytes, _ := json.MarshalIndent(got, "", "  ")

    if *update {
        os.WriteFile(path, gotBytes, 0644)
        return
    }

    want, err := os.ReadFile(path)
    if err != nil {
        t.Fatalf("snapshot not found (run with -update): %v", err)
    }

    if !bytes.Equal(gotBytes, want) {
        t.Errorf("snapshot mismatch (run with -update to accept):\n%s",
            diff(string(want), string(gotBytes)))
    }
}

var update = flag.Bool("update", false, "update snapshot files")
```

**Snapshots to create:**

- [ ] `compiler/forge/testdata/snapshots/helpdesk-artifact.json`
- [ ] `compiler/forge/testdata/snapshots/helpdesk-schema.sql`
- [ ] `compiler/forge/testdata/snapshots/helpdesk-client.ts`
- [ ] `compiler/forge/testdata/snapshots/helpdesk-react.tsx`

### 2.6 Fuzz Tests

**Goal**: Lexer and parser never panic on arbitrary input.

```go
// compiler/internal/lexer/lexer_fuzz_test.go
func FuzzLexer(f *testing.F) {
    // Seed corpus from real .forge files
    f.Add("app Test {}")
    f.Add("entity User { email: string }")
    f.Add("relation Ticket.author -> User")
    f.Add(`rule Ticket.update { forbid if status == closed emit TICKET_CLOSED }`)

    f.Fuzz(func(t *testing.T, input string) {
        l := New(input, "fuzz.forge")
        // Must not panic - collect all tokens
        for {
            tok := l.NextToken()
            if tok.Type == token.EOF {
                break
            }
        }
    })
}

// compiler/internal/parser/parser_fuzz_test.go
func FuzzParser(f *testing.F) {
    f.Add("app Test {}")
    f.Add("entity User { email: string length <= 120 }")

    f.Fuzz(func(t *testing.T, input string) {
        p := New(input, "fuzz.forge")
        // Must not panic - parse may return diagnostics
        _ = p.ParseFile()
    })
}
```

### 2.7 Performance Tests

**Goal**: Detect performance regressions in compilation and runtime hot paths.

```go
// compiler/forge/bench_test.go
func BenchmarkCompileHelpdesk(b *testing.B) {
    source := readFile(b, "testdata/helpdesk.forge")
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        forge.Compile(source, "helpdesk.forge")
    }
}

func BenchmarkLexer(b *testing.B) {
    source := readFile(b, "testdata/helpdesk.forge")
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        l := lexer.New(source, "bench.forge")
        for {
            if l.NextToken().Type == token.EOF {
                break
            }
        }
    }
}
```

---

## 3. CI Pipeline Design

### 3.1 Pipeline Architecture

```
push/PR
  |
  v
[lint] ---------> [unit-compiler] ---------> [snapshot]
                   [unit-runtime]             [fuzz (nightly)]
                   [integration]  ---------> [e2e]
                                              [coverage-report]
```

### 3.2 GitHub Actions Configuration

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  GO_VERSION: "1.22"
  NODE_VERSION: "20"

jobs:
  # ──────────────────────────────────────────────
  # Stage 1: Fast checks (< 2 min)
  # ──────────────────────────────────────────────
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}

      - name: Lint compiler
        uses: golangci/golangci-lint-action@v4
        with:
          working-directory: compiler
          version: latest

      - name: Lint runtime
        uses: golangci/golangci-lint-action@v4
        with:
          working-directory: runtime
          version: latest

      - name: Check formatting
        run: |
          cd compiler && test -z "$(gofmt -l .)" || (gofmt -d . && exit 1)
          cd ../runtime && test -z "$(gofmt -l .)" || (gofmt -d . && exit 1)

  # ──────────────────────────────────────────────
  # Stage 2: Unit tests (< 3 min)
  # ──────────────────────────────────────────────
  unit-compiler:
    name: Compiler Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: compiler/go.sum

      - name: Run compiler tests
        working-directory: compiler
        run: |
          go test -race -short -coverprofile=coverage.out -covermode=atomic ./...

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-compiler
          path: compiler/coverage.out

  unit-runtime:
    name: Runtime Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: runtime/go.sum

      - name: Run runtime unit tests
        working-directory: runtime
        run: |
          go test -race -short -coverprofile=coverage.out -covermode=atomic ./...

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-runtime-unit
          path: runtime/coverage.out

  # ──────────────────────────────────────────────
  # Stage 3: Integration tests (< 5 min)
  # ──────────────────────────────────────────────
  integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [unit-compiler, unit-runtime]
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: forge
          POSTGRES_PASSWORD: forge
          POSTGRES_DB: forge_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: runtime/go.sum

      - name: Run integration tests
        working-directory: runtime
        env:
          DATABASE_URL: postgres://forge:forge@localhost:5432/forge_test?sslmode=disable
          FORGE_TEST_INTEGRATION: "true"
        run: |
          go test -race -coverprofile=coverage-integration.out -covermode=atomic -count=1 ./...

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-runtime-integration
          path: runtime/coverage-integration.out

  # ──────────────────────────────────────────────
  # Stage 4: Snapshot tests (< 2 min)
  # ──────────────────────────────────────────────
  snapshot:
    name: Snapshot Tests
    runs-on: ubuntu-latest
    needs: [unit-compiler]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: compiler/go.sum

      - name: Run snapshot tests
        working-directory: compiler
        run: |
          go test -run TestSnapshot ./forge/... -v

      - name: Check for snapshot drift
        run: |
          if ! git diff --exit-code compiler/forge/testdata/snapshots/; then
            echo "::error::Snapshot files have changed. Run 'go test ./forge/... -update' and commit."
            exit 1
          fi

  # ──────────────────────────────────────────────
  # Stage 5: Build (< 3 min)
  # ──────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint]
    strategy:
      matrix:
        goos: [linux, darwin]
        goarch: [amd64, arm64]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: runtime/go.sum

      - name: Build forge binary
        working-directory: runtime
        env:
          GOOS: ${{ matrix.goos }}
          GOARCH: ${{ matrix.goarch }}
        run: |
          go build -o ../bin/forge-${{ matrix.goos }}-${{ matrix.goarch }} ./cmd/forge

      - name: Upload binary
        uses: actions/upload-artifact@v4
        with:
          name: forge-${{ matrix.goos }}-${{ matrix.goarch }}
          path: bin/forge-${{ matrix.goos }}-${{ matrix.goarch }}

  # ──────────────────────────────────────────────
  # Stage 6: E2E tests (< 10 min)
  # ──────────────────────────────────────────────
  e2e:
    name: E2E Tests (${{ matrix.project }})
    runs-on: ubuntu-latest
    needs: [integration, build]
    strategy:
      fail-fast: false
      matrix:
        project: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: runtime/go.sum

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - name: Build forge binary
        working-directory: runtime
        run: go build -o ../bin/forge ./cmd/forge

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        working-directory: e2e
        run: npx playwright install --with-deps ${{ matrix.project }}

      - name: Build helpdesk
        run: |
          cd projects/helpdesk
          ../../bin/forge build
          cd web && npm ci && npm run build

      - name: Run E2E tests
        working-directory: e2e
        env:
          FORGE_BIN: ../bin/forge
        run: npx playwright test --project=${{ matrix.project }}

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results-${{ matrix.project }}
          path: |
            e2e/test-results/
            e2e/playwright-report/

  # ──────────────────────────────────────────────
  # Stage 7: Coverage report
  # ──────────────────────────────────────────────
  coverage:
    name: Coverage Report
    runs-on: ubuntu-latest
    needs: [unit-compiler, unit-runtime, integration]
    steps:
      - uses: actions/checkout@v4

      - name: Download coverage artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: coverage-*
          merge-multiple: true

      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: coverage.out,coverage-integration.out
          flags: compiler,runtime
          fail_ci_if_error: true
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}

  # ──────────────────────────────────────────────
  # Stage 8: Fuzz (nightly only, 5 min budget)
  # ──────────────────────────────────────────────
  fuzz:
    name: Fuzz Tests
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache-dependency-path: compiler/go.sum

      - name: Fuzz lexer
        working-directory: compiler
        run: go test -fuzz=FuzzLexer -fuzztime=2m ./internal/lexer/

      - name: Fuzz parser
        working-directory: compiler
        run: go test -fuzz=FuzzParser -fuzztime=2m ./internal/parser/

      - name: Upload crash corpus
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: fuzz-corpus
          path: compiler/**/testdata/fuzz/
```

### 3.3 Nightly Schedule (add to workflow)

```yaml
on:
  schedule:
    - cron: '0 4 * * *'  # 4 AM UTC daily
```

---

## 4. Implementation Plan

### Phase 1: Fix What's Broken (Week 1)

**Goal**: Green CI on every commit. No flaky tests.

- [ ] **Fix CI workflow** - Remove `projects/endeavor` reference from `.github/workflows/ci.yml`
- [ ] **Fix WebSocket test flakiness** - Replace `time.Sleep(10ms)` in `websocket_test.go` with channel-based synchronization:

```go
// Before (flaky):
hub.Broadcast("test-view", []byte("hello"))
time.Sleep(10 * time.Millisecond)
// check result...

// After (deterministic):
done := make(chan struct{})
client.OnMessage(func(msg []byte) {
    // assert...
    close(done)
})
hub.Broadcast("test-view", []byte("hello"))
select {
case <-done:
case <-time.After(2 * time.Second):
    t.Fatal("timeout waiting for broadcast")
}
```

- [ ] **Fix watcher test flakiness** - Replace `time.Sleep` with polling helper:

```go
func waitFor(t *testing.T, timeout time.Duration, condition func() bool) {
    t.Helper()
    deadline := time.Now().Add(timeout)
    for time.Now().Before(deadline) {
        if condition() {
            return
        }
        time.Sleep(10 * time.Millisecond)
    }
    t.Fatal("condition not met within timeout")
}
```

- [ ] **Fix CLI integration tests** - Gate embedded-postgres tests behind build tag or `-short` flag:

```go
func TestCLI_Run_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test in short mode")
    }
    // ...
}
```

- [ ] **Track `middleware.go`** - Add and commit the untracked security middleware file
- [ ] **Add race detection** - Update all `go test` invocations to include `-race`

### Phase 2: Coverage Foundation (Week 2)

**Goal**: Measure coverage, establish baselines, add tests for critical gaps.

- [ ] **Add coverage reporting** - Configure `go test -coverprofile` in CI
- [ ] **Add Codecov integration** - Upload coverage data, set up PR comments
- [ ] **Write `planner_test.go`** - Table-driven tests for migration SQL generation:
  - Entity to CREATE TABLE
  - Relation to foreign key
  - Enum to CHECK constraint
  - Index generation
  - RLS policy generation
- [ ] **Write `emitter_test.go`** - Table-driven tests for output generation:
  - Artifact JSON structure
  - Schema SQL correctness
  - TypeScript client types
  - React hooks generation
- [ ] **Write `db_test.go`** - Integration tests for database operations (with testcontainers):
  - Connect and ping
  - Execute DDL
  - CRUD operations
  - Transaction commit and rollback
  - Connection pool behavior

### Phase 3: Snapshot & Fuzz Tests (Week 3)

**Goal**: Compiler output stability is guaranteed. Parser never panics.

- [ ] **Implement snapshot test framework** - `snapshotJSON()` and `snapshotText()` helpers with `-update` flag
- [ ] **Create golden files** - Generate initial snapshots for helpdesk app:
  - `helpdesk-artifact.json`
  - `helpdesk-schema.sql`
  - `helpdesk-client.ts`
  - `helpdesk-react.tsx`
- [ ] **Add snapshot drift check** - CI step that fails if snapshots change without `-update`
- [ ] **Write lexer fuzz test** - Seed corpus from real `.forge` files
- [ ] **Write parser fuzz test** - Seed corpus from all declaration types
- [ ] **Add nightly fuzz schedule** - 5-minute fuzz budget per target

### Phase 4: Testcontainers Migration (Week 4)

**Goal**: Replace embedded-postgres with testcontainers-go for reliable integration tests.

- [ ] **Add testcontainers dependency** - `go get github.com/testcontainers/testcontainers-go`
- [ ] **Create shared container helper** - See Section 6
- [ ] **Migrate CLI integration tests** - Replace embedded-postgres with testcontainers
- [ ] **Add migration integration tests** - Compile, apply migration, verify schema
- [ ] **Add RLS integration tests** - Verify access control policies work against real Postgres
- [ ] **Add action integration tests** - Execute actions against real Postgres, verify data

### Phase 5: E2E Hardening & Polish (Week 5)

**Goal**: Full E2E coverage across 3 browsers. CI pipeline is fast and reliable.

- [ ] **Add E2E retry configuration** - 2 retries in CI, 0 locally
- [ ] **Add browser matrix** - Chromium, Firefox, WebKit in parallel CI jobs
- [ ] **Unskip helpdesk tests** - Fix real-time update and access control E2E tests
- [ ] **Add E2E webhook tests** - Test webhook delivery through Stripe mock
- [ ] **Add CI caching** - Go modules, Playwright browsers, Node modules
- [ ] **Add benchmark CI step** - Track compilation time regression
- [ ] **Write developer guide** - See Section 11

---

## 5. Test Fixture Design

### 5.1 Go: Shared Compilation Helper

Every compiler test repeats the parse-analyze-normalize pipeline. Extract a shared helper:

```go
// compiler/internal/testutil/testutil.go
package testutil

import (
    "testing"

    "github.com/forge-lang/forge/compiler/internal/analyzer"
    "github.com/forge-lang/forge/compiler/internal/ast"
    "github.com/forge-lang/forge/compiler/internal/normalizer"
    "github.com/forge-lang/forge/compiler/internal/parser"
)

// Parse parses source and fails the test on error.
func Parse(t *testing.T, source string) *ast.File {
    t.Helper()
    p := parser.New(source, "test.forge")
    file := p.ParseFile()
    if p.Diagnostics().HasErrors() {
        t.Fatalf("parse errors: %v", p.Diagnostics().Errors())
    }
    return file
}

// Analyze parses and analyzes source.
func Analyze(t *testing.T, source string) (*ast.File, *analyzer.Scope) {
    t.Helper()
    file := Parse(t, source)
    a := analyzer.New(file)
    diags := a.Analyze()
    if diags.HasErrors() {
        t.Fatalf("analysis errors: %v", diags.Errors())
    }
    return file, a.Scope()
}

// Normalize parses, analyzes, and normalizes source.
func Normalize(t *testing.T, source string) *normalizer.Output {
    t.Helper()
    file, scope := Analyze(t, source)
    n := normalizer.New(file, scope)
    output, diags := n.Normalize()
    if diags.HasErrors() {
        t.Fatalf("normalization errors: %v", diags.Errors())
    }
    return output
}
```

### 5.2 Go: Mock Database Factory

Extend the existing mock pattern with a factory for common scenarios:

```go
// runtime/internal/server/testutil_test.go

// newMockDB returns a mockDB preconfigured for common test scenarios.
func newMockDB(opts ...mockDBOption) *mockDB {
    db := &mockDB{}
    for _, opt := range opts {
        opt(db)
    }
    return db
}

type mockDBOption func(*mockDB)

// withQueryResult configures Query to return a single row with the given columns and values.
func withQueryResult(columns []string, values ...[]any) mockDBOption {
    return func(db *mockDB) {
        db.queryFunc = func(ctx context.Context, sql string, args ...any) (Rows, error) {
            return &mockRows{
                columns: columns,
                rows:    values,
                index:   -1,
            }, nil
        }
    }
}

// withExecResult configures Exec to return the given rows affected count.
func withExecResult(rowsAffected int64) mockDBOption {
    return func(db *mockDB) {
        db.execFunc = func(ctx context.Context, sql string, args ...any) (Result, error) {
            return &mockResult{rowsAffected: rowsAffected}, nil
        }
    }
}
```

### 5.3 TypeScript: E2E Authentication Helper

The existing `e2e/fixtures/auth.ts` is well-designed. Extend it with a proper Playwright fixture:

```typescript
// e2e/fixtures/forge.ts
import { test as base, expect } from '@playwright/test';
import { authenticateAs, TestUser, testUsers } from './auth';
import { cleanTickets, createTicket } from './db';

type ForgeFixtures = {
  asAdmin: void;
  asAgent: void;
  asCustomer: void;
  cleanData: void;
};

export const test = base.extend<ForgeFixtures>({
  asAdmin: [async ({ page }, use) => {
    await authenticateAs(page, testUsers.admin);
    await use();
  }, { auto: false }],

  asAgent: [async ({ page }, use) => {
    await authenticateAs(page, testUsers.agent);
    await use();
  }, { auto: false }],

  asCustomer: [async ({ page }, use) => {
    await authenticateAs(page, testUsers.customer);
    await use();
  }, { auto: false }],

  cleanData: [async ({ request }, use) => {
    await cleanTickets(request);
    await use();
    await cleanTickets(request);
  }, { auto: true }],
});

export { expect };
```

---

## 6. Testcontainers Setup

### 6.1 Add Dependency

```bash
cd runtime && go get github.com/testcontainers/testcontainers-go
cd runtime && go get github.com/testcontainers/testcontainers-go/modules/postgres
```

### 6.2 Shared Container Helper

```go
// runtime/internal/testutil/postgres.go
package testutil

import (
    "context"
    "fmt"
    "testing"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
    "github.com/testcontainers/testcontainers-go/wait"
)

// PostgresContainer wraps a testcontainers Postgres instance.
type PostgresContainer struct {
    *postgres.PostgresContainer
    ConnString string
}

// StartPostgres creates a Postgres container for the test.
// The container is automatically terminated when the test finishes.
func StartPostgres(t *testing.T) *PostgresContainer {
    t.Helper()
    ctx := context.Background()

    container, err := postgres.Run(ctx,
        "postgres:16-alpine",
        postgres.WithDatabase("forge_test"),
        postgres.WithUsername("forge"),
        postgres.WithPassword("forge"),
        testcontainers.WithWaitStrategy(
            wait.ForLog("database system is ready to accept connections").
                WithOccurrence(2).
                WithStartupTimeout(30*time.Second),
        ),
    )
    if err != nil {
        t.Fatalf("failed to start postgres container: %v", err)
    }

    t.Cleanup(func() {
        if err := container.Terminate(ctx); err != nil {
            t.Logf("failed to terminate postgres: %v", err)
        }
    })

    connStr, err := container.ConnectionString(ctx, "sslmode=disable")
    if err != nil {
        t.Fatalf("failed to get connection string: %v", err)
    }

    return &PostgresContainer{
        PostgresContainer: container,
        ConnString:        connStr,
    }
}

// ConnectPool creates a pgxpool connected to the container.
func (c *PostgresContainer) ConnectPool(t *testing.T) *pgxpool.Pool {
    t.Helper()
    ctx := context.Background()
    pool, err := pgxpool.New(ctx, c.ConnString)
    if err != nil {
        t.Fatalf("failed to connect: %v", err)
    }
    t.Cleanup(pool.Close)
    return pool
}

// CreateSchema creates an isolated schema for a single test.
// This allows parallel tests against the same container.
func (c *PostgresContainer) CreateSchema(t *testing.T, pool *pgxpool.Pool) string {
    t.Helper()
    schema := fmt.Sprintf("test_%d", time.Now().UnixNano())
    ctx := context.Background()
    _, err := pool.Exec(ctx, fmt.Sprintf("CREATE SCHEMA %s", schema))
    if err != nil {
        t.Fatalf("failed to create schema: %v", err)
    }
    _, err = pool.Exec(ctx, fmt.Sprintf("SET search_path TO %s", schema))
    if err != nil {
        t.Fatalf("failed to set search_path: %v", err)
    }
    t.Cleanup(func() {
        pool.Exec(ctx, fmt.Sprintf("DROP SCHEMA %s CASCADE", schema))
    })
    return schema
}
```

### 6.3 Usage in Tests

```go
// runtime/internal/db/db_integration_test.go
package db

import (
    "context"
    "testing"

    "github.com/forge-lang/forge/runtime/internal/testutil"
)

func TestPostgresAdapter_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }

    pg := testutil.StartPostgres(t)
    pool := pg.ConnectPool(t)
    schema := pg.CreateSchema(t, pool)
    _ = schema

    ctx := context.Background()

    // Apply a migration
    _, err := pool.Exec(ctx, `
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    `)
    if err != nil {
        t.Fatalf("migration failed: %v", err)
    }

    // Insert
    _, err = pool.Exec(ctx, "INSERT INTO users (email) VALUES ($1)", "test@example.com")
    if err != nil {
        t.Fatalf("insert failed: %v", err)
    }

    // Query
    var email string
    err = pool.QueryRow(ctx, "SELECT email FROM users LIMIT 1").Scan(&email)
    if err != nil {
        t.Fatalf("query failed: %v", err)
    }
    if email != "test@example.com" {
        t.Errorf("got email %q, want %q", email, "test@example.com")
    }
}
```

---

## 7. Coverage Targets

### 7.1 Module-by-Module Targets

| Module | Current (est.) | Target (Week 5) | Target (3 months) |
|--------|---------------|------------------|-------------------|
| `compiler/internal/lexer` | ~85% | 90% | 95% |
| `compiler/internal/parser` | ~75% | 85% | 90% |
| `compiler/internal/analyzer` | ~70% | 80% | 85% |
| `compiler/internal/normalizer` | ~60% | 75% | 85% |
| `compiler/internal/planner` | 0% | 60% | 80% |
| `compiler/internal/emitter` | 0% | 60% | 80% |
| `compiler/internal/diag` | 0% | 50% | 75% |
| `compiler/forge` | ~50% | 70% | 80% |
| `runtime/internal/server` | ~55% | 65% | 80% |
| `runtime/internal/db` | 0% | 40% | 75% |
| `runtime/internal/provider` | ~60% | 70% | 80% |
| `runtime/internal/jobs` | 0% | 40% | 70% |
| `runtime/internal/security` | ~50% | 70% | 80% |
| `runtime/internal/config` | 0% | 50% | 70% |
| `runtime/cmd/forge` | ~40% | 55% | 70% |
| **Overall** | **~35%** | **60%** | **80%** |

### 7.2 Coverage Ratcheting Strategy

Never let coverage decrease. Enforce via CI:

```yaml
# In CI coverage job
- name: Check coverage threshold
  run: |
    THRESHOLD=60
    COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | tr -d '%')
    echo "Coverage: ${COVERAGE}%"
    if (( $(echo "$COVERAGE < $THRESHOLD" | bc -l) )); then
      echo "::error::Coverage ${COVERAGE}% is below threshold ${THRESHOLD}%"
      exit 1
    fi
```

Increase the threshold by 5% each month until reaching 80%.

### 7.3 Coverage Exclusions

Some code is not worth covering with unit tests:

```go
// coverage:ignore - main entry point, tested via E2E
func main() {

// coverage:ignore - generated code
func (s *Server) registerGeneratedRoutes() {
```

---

## 8. How to Make Tests Reliable

### 8.1 Eliminate Port Conflicts

**Problem**: Tests that bind to fixed ports fail when run in parallel or when ports are occupied.

**Solution**: Always use port 0 (OS-assigned) and extract the actual port:

```go
// Before (brittle):
server := httptest.NewServer(handler) // Good - already uses port 0

// For servers that need explicit port:
listener, err := net.Listen("tcp", ":0") // OS assigns free port
port := listener.Addr().(*net.TCPAddr).Port
```

### 8.2 Eliminate State Leakage

**Problem**: Tests that modify global state (environment variables, global registries) break other tests.

**Solution**: Use `t.Setenv()` (auto-restores) and always reset registries:

```go
// Before (leaks):
os.Setenv("FORGE_ENV", "production")
// ...test...
os.Unsetenv("FORGE_ENV")

// After (safe):
t.Setenv("FORGE_ENV", "production")
// automatically restored when test ends

// For registries:
func TestProvider(t *testing.T) {
    t.Cleanup(func() { provider.Reset() }) // already exists in provider_test.go
    provider.Register(&MyProvider{})
    // ...
}
```

### 8.3 Eliminate Sleep-Based Synchronization

**Problem**: `time.Sleep` is the #1 cause of flaky tests. It's either too short (fails under load) or too long (slows CI).

**Solution**: Use channel-based signaling or polling with timeout:

```go
// Pattern 1: Channel signaling (preferred for event-driven code)
ch := make(chan struct{})
hub.OnBroadcast(func() { close(ch) })
hub.Broadcast(msg)
select {
case <-ch:
    // success
case <-time.After(5 * time.Second):
    t.Fatal("timeout")
}

// Pattern 2: Polling (for state that converges)
func waitFor(t *testing.T, timeout time.Duration, fn func() bool) {
    t.Helper()
    deadline := time.Now().Add(timeout)
    for time.Now().Before(deadline) {
        if fn() {
            return
        }
        time.Sleep(10 * time.Millisecond)
    }
    t.Fatal("condition not met within timeout")
}

// Usage:
waitFor(t, 2*time.Second, func() bool {
    return hub.ClientCount() == 1
})
```

### 8.4 Database Isolation

**Problem**: Tests sharing a database see each other's data.

**Solution**: Schema-per-test pattern (see Section 6.2 `CreateSchema`). Each test gets a unique PostgreSQL schema within the same container, providing full isolation without the overhead of creating separate databases.

### 8.5 Test Timeout Policy

Set explicit timeouts to prevent hung tests from blocking CI:

```go
// In TestMain or individual tests:
func TestMain(m *testing.M) {
    // Global timeout for all tests in this package
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
    defer cancel()
    _ = ctx
    os.Exit(m.Run())
}
```

In CI, also set a job-level timeout:

```yaml
jobs:
  unit-runtime:
    timeout-minutes: 10
```

---

## 9. How to Run Tests Locally

### 9.1 Single Commands

```bash
# Run ALL tests (fast, no integration)
make test

# Run all tests including integration (requires Docker)
make test-all

# Run only compiler tests
make test-compiler

# Run only runtime tests
make test-runtime

# Run E2E tests
make test-e2e

# Run with coverage report (opens browser)
make coverage

# Run fuzz tests (2 minutes each)
make fuzz

# Update snapshots
make snapshot-update
```

### 9.2 Makefile

```makefile
# Makefile (project root)

.PHONY: test test-all test-compiler test-runtime test-e2e coverage fuzz snapshot-update lint

# Fast tests only (no Docker required)
test:
	cd compiler && go test -race -short ./...
	cd runtime && go test -race -short ./...

# All tests including integration (Docker required)
test-all:
	cd compiler && go test -race ./...
	cd runtime && go test -race -count=1 ./...

# Individual modules
test-compiler:
	cd compiler && go test -race -v ./...

test-runtime:
	cd runtime && go test -race -v -short ./...

# E2E (builds everything first)
test-e2e:
	cd runtime && go build -o ../bin/forge ./cmd/forge
	cd e2e && npx playwright test

# Coverage with HTML report
coverage:
	cd compiler && go test -race -coverprofile=coverage.out ./...
	cd compiler && go tool cover -html=coverage.out -o coverage.html
	cd runtime && go test -race -short -coverprofile=coverage.out ./...
	cd runtime && go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage reports:"
	@echo "  compiler/coverage.html"
	@echo "  runtime/coverage.html"

# Fuzz (2 minutes per target)
fuzz:
	cd compiler && go test -fuzz=FuzzLexer -fuzztime=2m ./internal/lexer/
	cd compiler && go test -fuzz=FuzzParser -fuzztime=2m ./internal/parser/

# Update golden snapshots
snapshot-update:
	cd compiler && go test ./forge/... -update

# Lint
lint:
	cd compiler && golangci-lint run ./...
	cd runtime && golangci-lint run ./...
```

---

## 10. CI Caching Strategy

### 10.1 Go Module Cache

```yaml
- uses: actions/setup-go@v5
  with:
    go-version: "1.22"
    cache-dependency-path: |
      compiler/go.sum
      runtime/go.sum
```

The `setup-go` action automatically caches `~/go/pkg/mod` based on `go.sum` hash. No additional configuration needed.

### 10.2 Go Build Cache

Go build cache (`~/.cache/go-build`) is cached by `setup-go@v5` by default. This makes incremental builds significantly faster.

### 10.3 Node Module Cache

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: npm
    cache-dependency-path: |
      package-lock.json
      e2e/package-lock.json
```

### 10.4 Playwright Browser Cache

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('e2e/package-lock.json') }}

- name: Install Playwright browsers
  working-directory: e2e
  run: npx playwright install --with-deps
```

### 10.5 Docker Layer Cache (for testcontainers)

```yaml
- name: Cache Docker layers
  uses: actions/cache@v4
  with:
    path: /tmp/.docker-cache
    key: docker-${{ runner.os }}-postgres16
    restore-keys: |
      docker-${{ runner.os }}-
```

---

## 11. How to Add a New Test (Developer Guide)

### 11.1 Adding a Compiler Unit Test

1. Find the appropriate `*_test.go` file in the package you're testing
2. Add a new entry to the existing table-driven test, or create a new test function
3. Follow the pattern: parse -> analyze -> normalize -> assert

```go
// Example: adding a test to normalizer_test.go
{
    name: "new_relation_type becomes _id suffix",
    source: `
app Test {}
entity User { email: string }
entity Invoice { amount: int }
relation Invoice.payer -> User
access Invoice { read: user == payer }
`,
    entityName:   "Invoice",
    accessField:  "read",
    wantContains: "payer_id",
},
```

4. Run: `cd compiler && go test -run TestExprToSQL_RelationToUser -v ./internal/normalizer/`

### 11.2 Adding a Runtime Unit Test

1. Use `createTestServerWithoutDB()` or `createTestServerWithAuth()` helpers
2. Use `httptest.NewRecorder()` for HTTP handler tests
3. Use `mockDB` for database-dependent code

```go
func TestNewEndpoint(t *testing.T) {
    srv := createTestServerWithoutDB(t)
    req := httptest.NewRequest("GET", "/api/new-endpoint", nil)
    rec := httptest.NewRecorder()
    srv.Handler.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK {
        t.Errorf("got status %d, want %d", rec.Code, http.StatusOK)
    }
}
```

4. Run: `cd runtime && go test -run TestNewEndpoint -v ./internal/server/`

### 11.3 Adding an Integration Test

1. Gate behind `-short` flag
2. Use `testutil.StartPostgres(t)` for database
3. Use `t.Cleanup()` for teardown (never `defer` in subtests)

```go
func TestMyIntegration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }

    pg := testutil.StartPostgres(t)
    pool := pg.ConnectPool(t)
    _ = pg.CreateSchema(t, pool)

    // ... test with real database
}
```

4. Run: `cd runtime && go test -run TestMyIntegration -v -count=1 ./internal/db/`

### 11.4 Adding an E2E Test

1. Add to existing spec file or create a new one in `e2e/tests/`
2. Use the auth fixtures for authentication
3. Use API helpers from `e2e/fixtures/db.ts` for test data setup

```typescript
import { test, expect } from '@playwright/test';
import { authenticateAs, testUsers } from '../fixtures/auth';

test.describe('New Feature', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAs(page, testUsers.admin);
  });

  test('should do the thing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Expected')).toBeVisible();
  });
});
```

4. Run: `cd e2e && npx playwright test tests/my-new-test.spec.ts`

### 11.5 Adding a Snapshot Test

1. Add a new test case in `compiler/forge/snapshot_test.go`
2. Run with `-update` to generate the golden file
3. Commit the golden file alongside the test

```go
func TestSnapshot_NewApp(t *testing.T) {
    source := readFile(t, "testdata/newapp.forge")
    result, diags := forge.Compile(source, "newapp.forge")
    if diags.HasErrors() {
        t.Fatalf("compilation failed: %v", diags.Errors())
    }
    snapshotJSON(t, "testdata/snapshots/newapp-artifact.json", result.Artifact)
}
```

4. Generate: `cd compiler && go test -run TestSnapshot_NewApp -update ./forge/...`
5. Verify: `cd compiler && go test -run TestSnapshot_NewApp ./forge/...`

---

## 12. Verification Checklist

Use this checklist to verify that the testing infrastructure is complete and working.

### CI Pipeline

- [ ] `ci.yml` runs on every push to `main` and every PR
- [ ] Lint job catches formatting and static analysis issues
- [ ] Compiler unit tests pass with `-race -short`
- [ ] Runtime unit tests pass with `-race -short`
- [ ] Integration tests run with real Postgres service
- [ ] Snapshot tests detect drift and fail with clear message
- [ ] E2E tests run across 3 browsers (Chromium, Firefox, WebKit)
- [ ] Coverage report uploads to Codecov
- [ ] Coverage threshold enforced (fails if below target)
- [ ] Fuzz tests run nightly
- [ ] Build matrix produces binaries for linux/darwin x amd64/arm64
- [ ] Failed E2E uploads screenshots and traces as artifacts
- [ ] CI completes in under 15 minutes for unit + integration
- [ ] Concurrency group cancels stale runs

### Test Quality

- [ ] No `time.Sleep` in tests (use channels or polling)
- [ ] No hardcoded ports (use `:0` or `httptest`)
- [ ] No `os.Setenv` (use `t.Setenv`)
- [ ] No shared mutable state between tests
- [ ] All integration tests gated behind `-short`
- [ ] All tests have explicit timeouts via CI job `timeout-minutes`
- [ ] Flaky test count is 0 (track with `go test -count=10`)

### Coverage

- [ ] Codecov configured with PR comments
- [ ] Coverage threshold set and enforced
- [ ] Threshold increases by 5% monthly until 80%
- [ ] Every new package has tests before merge

### Developer Experience

- [ ] `make test` runs fast tests in < 30 seconds
- [ ] `make test-all` runs everything including integration
- [ ] `make coverage` opens HTML report
- [ ] `make fuzz` runs fuzz tests locally
- [ ] `make snapshot-update` regenerates golden files
- [ ] New test guide is discoverable (linked from CLAUDE.md)

---

## Appendix A: Test File Locations

```
compiler/
  internal/lexer/lexer_test.go
  internal/parser/parser_test.go
  internal/analyzer/analyzer_test.go
  internal/normalizer/normalizer_test.go
  internal/planner/planner_test.go          # TO CREATE
  internal/emitter/emitter_test.go          # TO CREATE
  internal/diag/diag_test.go                # TO CREATE
  forge/compile_test.go
  forge/snapshot_test.go                    # TO CREATE
  forge/bench_test.go                       # TO CREATE
  internal/lexer/lexer_fuzz_test.go         # TO CREATE
  internal/parser/parser_fuzz_test.go       # TO CREATE

runtime/
  internal/server/server_test.go
  internal/server/auth_test.go
  internal/server/action_test.go
  internal/server/websocket_test.go
  internal/server/watcher_test.go
  internal/provider/registry_test.go
  internal/provider/builtin/http_test.go
  internal/db/db_test.go                    # TO CREATE
  internal/db/db_integration_test.go        # TO CREATE
  internal/jobs/executor_test.go            # TO CREATE
  internal/security/ratelimit_test.go
  internal/security/botfilter_test.go
  internal/security/turnstile_test.go
  internal/security/middleware_test.go      # TO CREATE
  internal/config/config_test.go            # TO CREATE
  internal/testutil/postgres.go             # TO CREATE (shared helper)
  cmd/forge/main_test.go

e2e/
  tests/smoke.spec.ts
  tests/helpdesk.spec.ts
  tests/chat.spec.ts
  fixtures/auth.ts
  fixtures/db.ts
  fixtures/forge.ts                         # TO CREATE
```

## Appendix B: Dependency Changes

```bash
# New test dependencies to add
cd runtime && go get github.com/testcontainers/testcontainers-go@latest
cd runtime && go get github.com/testcontainers/testcontainers-go/modules/postgres@latest

# Dependency to eventually remove (after migration)
# github.com/fergusstrange/embedded-postgres v1.25.0
```

## Appendix C: Environment Variables for Testing

| Variable | Used By | Default | Description |
|----------|---------|---------|-------------|
| `FORGE_TEST_INTEGRATION` | Integration tests | `""` | Set to `"true"` to run integration tests |
| `DATABASE_URL` | Integration tests | `""` | Postgres connection string (CI provides via service) |
| `FORGE_ENV` | Server tests | `"development"` | Controls dev endpoint availability |
| `CI` | E2E config | `""` | Detected by Playwright for retry/worker config |
| `FORGE_BIN` | E2E tests | `"../bin/forge"` | Path to forge binary |
