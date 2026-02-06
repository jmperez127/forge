# Roadmap: Imperative Escape Hatch

> The system that lets developers write custom Go code when declarative rules are not enough, without breaking FORGE's sealed runtime guarantee.

---

## 1. Current State Assessment

### What Exists

The `imperative` keyword is fully recognized across the compiler pipeline at the syntactic level:

**Lexer/Token** (`compiler/internal/token/token.go`):
- `IMPERATIVE` token type is defined (line 32)
- `"imperative"` is registered in the keyword map (line 264)
- `RETURNS` keyword exists and is used by imperative parsing

**Parser** (`compiler/internal/parser/parser.go`):
- `parseImperativeDecl()` is implemented (lines 828-872)
- Parses the full syntax: `imperative name { input: Entity, returns: Type }`
- `ImperativeDecl` nodes are collected into `file.Imperatives` (lines 196-197)
- Dispatch from `parseDeclaration()` is wired up (lines 234-235)

**AST** (`compiler/internal/ast/ast.go`):
- `ImperativeDecl` struct defined with `Name`, `Input`, `Returns` fields (lines 313-319)
- `File.Imperatives` slice exists (line 45)
- Node interface methods implemented

**Spec** (`FORGE_SPEC.md`):
- Section 17 defines imperative code as "allowed only at the edge"
- Section 18 declares capability sandboxing for imperative code
- Section 32 describes the escape hatch contract (explicit, auditable, capability-limited)
- Section 33 explicitly forbids arbitrary HTTP handlers and global mutable state

### What Is Missing

The imperative system stops at the parser. Nothing downstream processes it:

| Component | Status | Gap |
|-----------|--------|-----|
| **Lexer/Tokens** | Complete | None |
| **Parser** | Complete | No `capabilities` or `effect` parsing in imperative blocks |
| **Analyzer** | Not implemented | `Imperatives` not collected, no validation |
| **Normalizer** | Not implemented | No `NormalizedImperative` type, not processed |
| **Planner** | Not implemented | No `ImperativeNode`, no execution plan |
| **Emitter** | Not implemented | No `ImperativeSchema` in artifact, no SDK types |
| **Artifact** | No field | No `imperatives` key in `Artifact` struct |
| **Runtime** | No handler | No route, no executor, no sandbox |
| **Go code loading** | No mechanism | No way to compile, load, or call developer Go code |
| **SDK** | No types | No TypeScript types or client methods for imperative endpoints |
| **Tests** | None | No parser tests, no integration tests |

### Parser Limitation

The current `parseImperativeDecl` only handles `input` and `returns`. The spec implies imperative blocks need:

```text
imperative export_csv {
  input: Ticket
  returns: file
  capabilities: [http.call]    # <-- not parsed
  mutates: false               # <-- not parsed
}
```

The parser will need extension to handle `capabilities` and `mutates` fields.

---

## 2. Design Philosophy

### Why This Matters

FORGE's value proposition is that 90% of application logic is declarative. But the remaining 10% -- custom validation, PDF generation, third-party API orchestration, complex calculations -- is the reason teams reject otherwise excellent tools. Without an imperative escape hatch, every edge case becomes "FORGE can't do that" and the developer walks away.

The escape hatch must satisfy two audiences simultaneously:

1. **The developer** who needs to ship a feature that FORGE's declarative model cannot express
2. **The system** that must maintain its sealed runtime guarantees even when running arbitrary code

### Design Constraints

These constraints are non-negotiable. They come directly from the spec and the project philosophy.

1. **Imperative code cannot bypass rules.** If a rule says `forbid if status == closed`, no imperative block can circumvent that. Rules compile to SQL predicates. Imperative code sits above the query layer, not inside it.

2. **Imperative code cannot bypass access control.** RLS policies are enforced at the PostgreSQL level. Imperative code receives a database handle that is already scoped to the user.

3. **Imperative code runs within declared capabilities only.** If an imperative block does not declare `http.call`, it cannot make HTTP requests. The sandbox is allowlist-based.

4. **Imperative code must be explicit and auditable.** The `.forge` file declares what exists. The Go code implements it. There is no silent escape.

5. **Single binary deployment must be preserved.** Dynamic code loading at runtime would break the sealed runtime guarantee. All imperative code compiles into the binary.

6. **Imperative code does not own business logic.** It handles edge-case computation, formatting, and external orchestration. State transitions belong to actions and rules.

---

## 3. Architecture Options

### Option A: Go Plugin System (`plugin` Package)

Use Go's `plugin` package to compile developer code into `.so` files that are loaded at runtime.

**Mechanism:** Developer writes Go files, `forge build` compiles them to shared objects, runtime loads them via `plugin.Open()`.

**Pros:**
- Developer writes native Go
- Full access to Go ecosystem
- Hot-reloadable in development

**Cons:**
- `plugin` package is Linux/macOS only (no Windows, no WASM)
- Shared libraries break the single-binary deployment model
- Version skew between plugin and runtime Go versions causes panics
- No sandbox -- loaded code has full process access
- Go team has stated `plugin` is not a priority and has known bugs
- Debugging is painful (no source maps, opaque crashes)

**Verdict: Rejected.** Violates the sealed runtime guarantee. Introduces deployment complexity. Platform-limited.

### Option B: Embedded Scripting (Lua, Starlark, or JavaScript)

Embed a scripting runtime and let developers write imperative code in a non-Go language.

**Mechanism:** Imperative blocks reference script files. The runtime embeds an interpreter (e.g., `gopher-lua`, `go-starlark`, `goja`).

**Pros:**
- Natural sandboxing (interpreter controls what is available)
- Scripts can be hot-reloaded without recompilation
- Starlark is intentionally non-Turing-complete (aligns with FORGE philosophy)

**Cons:**
- Developers must learn a second language
- Performance overhead for computation-heavy logic
- Marshaling data between Go and the scripting language is complex
- Debugging requires tooling for the embedded language
- External library ecosystem is nonexistent (no npm, no pip)
- The spec says FORGE generates a single Go binary; scripts are external files

**Verdict: Rejected.** Forces a language context switch. The target user is a Go developer deploying a FORGE app. Making them write Lua to export a CSV is hostile.

### Option C: Go Function Registry (Compile-Time Registration)

Developer writes Go functions that implement a well-defined interface. Functions are registered at compile time (like providers) and referenced from `.forge` files.

**Mechanism:**
1. Developer writes a Go package with functions matching `ImperativeFunc` interface
2. Package registers itself via `init()` (same pattern as providers)
3. `.forge` file declares `imperative export_csv { ... }`
4. Compiler validates the declaration matches a registered function
5. Runtime routes requests to the registered function
6. Function receives a sandboxed context (scoped DB, declared capabilities only)

**Pros:**
- Familiar pattern (identical to how providers work today)
- Single binary (compiled in, no dynamic loading)
- Full Go performance
- Debuggable with standard Go tooling
- Type-safe at compile time
- Sandboxed via interface contract (function receives only what it declares)
- No new languages, no interpreters, no runtime dependencies

**Cons:**
- Requires recompilation to change imperative code
- Developer must understand Go interfaces
- Testing requires building the full binary

**Verdict: Recommended.** This is the simplest approach that preserves every FORGE guarantee. It reuses the proven provider pattern, maintains single-binary deployment, and gives developers the full power of Go within a sandboxed contract.

### Option D: WebAssembly Modules

Compile developer code to WASM and execute it in an embedded WASM runtime.

**Mechanism:** Developer writes code in any language, compiles to `.wasm`, runtime embeds `wazero` or `wasmtime-go` to execute.

**Pros:**
- Language-agnostic (Go, Rust, C, AssemblyScript)
- Strong sandboxing (WASM is capability-based by design)
- Deterministic execution

**Cons:**
- WASM-Go interop is immature (TinyGo required, no full Go stdlib)
- Performance penalty for host function calls (data copying across boundary)
- File I/O, network I/O, and database access all require host function trampolines
- Debugging WASM is substantially harder than debugging Go
- Adds a significant dependency (WASM runtime is ~10MB)
- Developer toolchain complexity (compile to WASM, test WASM, deploy WASM)
- Overkill for the problem scope (business logic edge cases, not untrusted code)

**Verdict: Rejected for now.** Correct architecture for multi-tenant untrusted code execution, which is not FORGE's problem. The complexity cost is not justified when the developer is the same person deploying the binary.

### Recommendation: Option C -- Go Function Registry

Option C is the right choice because it **deletes complexity instead of adding it**. This is the FORGE philosophy.

The provider system (`runtime/internal/provider/`) already proves this pattern works:

```go
// Existing provider pattern (runtime/internal/provider/provider.go)
type Provider interface {
    Name() string
    Init(config map[string]string) error
}
```

The imperative system follows the same shape:

```go
type ImperativeFunc interface {
    Name() string
    Execute(ctx *ImperativeContext) (any, error)
}
```

Same registration via `init()`. Same compile-time linking. Same single binary. The developer already understands this if they have written a provider.

---

## 4. Implementation Plan

### Phase 1: Compiler Support

#### TODO 1: Extend the Imperative AST Node

**File:** `/Users/jean/dev/ai/forge/compiler/internal/ast/ast.go`

Add `Capabilities` and `Mutates` fields to `ImperativeDecl`:

```go
type ImperativeDecl struct {
    Name         *Ident
    Input        *Ident
    Returns      *Ident
    Capabilities []*Ident
    Mutates      bool
    StartPos     token.Position
    EndPos       token.Position
}
```

- [ ] Add `Capabilities []*Ident` field
- [ ] Add `Mutates bool` field

#### TODO 2: Extend the Parser

**File:** `/Users/jean/dev/ai/forge/compiler/internal/parser/parser.go`

Extend `parseImperativeDecl()` to handle `capabilities` and `mutates`:

```text
imperative export_csv {
  input: Ticket
  returns: file
  capabilities: [http.call]
  mutates: false
}
```

- [ ] Parse `capabilities:` as a bracket-delimited list of dotted identifiers (reuse `parseEventList` pattern from webhooks)
- [ ] Parse `mutates:` as a boolean literal
- [ ] Add parser tests for all imperative syntax variants
- [ ] Add parser error tests for malformed imperative blocks

#### TODO 3: Add Analyzer Support

**File:** `/Users/jean/dev/ai/forge/compiler/internal/analyzer/analyzer.go`

The analyzer currently ignores `file.Imperatives` entirely.

- [ ] Add `Imperatives map[string]*ast.ImperativeDecl` to the `Scope` struct
- [ ] Collect imperative declarations in `collectDeclarations()`
- [ ] Check for duplicate imperative names
- [ ] Validate `input` references an existing entity (when it is an entity name)
- [ ] Validate `returns` is a known return type (`file`, `json`, `string`, `bytes`, or an entity name)
- [ ] Validate `capabilities` entries match known capability patterns (`provider.action`)
- [ ] Emit warning if `mutates: true` is declared (this is the escape hatch for the escape hatch -- it should be rare)

#### TODO 4: Add Normalizer Support

**File:** `/Users/jean/dev/ai/forge/compiler/internal/normalizer/normalizer.go`

- [ ] Define `NormalizedImperative` struct
- [ ] Add `Imperatives []*NormalizedImperative` to `normalizer.Output`
- [ ] Implement `normalizeImperatives()` in the normalization pass

#### TODO 5: Add Planner Support

**File:** `/Users/jean/dev/ai/forge/compiler/internal/planner/planner.go`

- [ ] Define `ImperativeNode` struct
- [ ] Add `Imperatives map[string]*ImperativeNode` to `Plan`
- [ ] Implement `planImperatives()` to build imperative execution nodes
- [ ] If `mutates: true`, attach access rules for the input entity

#### TODO 6: Add Emitter Support

**File:** `/Users/jean/dev/ai/forge/compiler/internal/emitter/emitter.go`

- [ ] Define `ImperativeSchema` in the artifact
- [ ] Add `Imperatives map[string]*ImperativeSchema` to `Artifact`
- [ ] Emit imperative schemas in `generateArtifact()`
- [ ] Generate TypeScript client methods for imperative endpoints
- [ ] Generate React hooks for imperative calls

### Phase 2: Runtime Execution

#### TODO 7: Define the Imperative Function Interface

**New file:** `runtime/internal/imperative/imperative.go`

- [ ] Create the `runtime/internal/imperative/` package
- [ ] Define `ImperativeContext` with sandboxed DB, capabilities, and logger
- [ ] Define `ImperativeFunc` interface
- [ ] Define `ReadOnlyDB` interface
- [ ] Define `ScopedCapabilities` (allowlist wrapper around provider registry)

#### TODO 8: Create the Imperative Registry

**New file:** `runtime/internal/imperative/registry.go`

Follow the exact same pattern as `/Users/jean/dev/ai/forge/runtime/internal/provider/registry.go`.

- [ ] Create `Registry` struct with thread-safe function map
- [ ] Implement `Register()` function (called from `init()`)
- [ ] Implement `Get()`, `List()`, `Has()` methods
- [ ] Implement `Reset()` for testing

#### TODO 9: Add Runtime Handler

**File:** `/Users/jean/dev/ai/forge/runtime/internal/server/handlers.go`

- [ ] Add `handleImperative` handler function
- [ ] Route: `POST /api/imperative/{name}` (registered in `setupRoutes()`)
- [ ] Build `ImperativeContext` with sandboxed resources
- [ ] Handle return types: json, file, string, bytes
- [ ] Convert errors to FORGE message responses

#### TODO 10: Validate Imperative Registration at Startup

**File:** `/Users/jean/dev/ai/forge/runtime/internal/server/server.go`

- [ ] In `New()`, validate registered functions match declared imperatives
- [ ] Log warnings for missing implementations
- [ ] In production, fail startup if imperatives are declared but not registered

### Phase 3: Sandboxing and Database Access

#### TODO 11: Implement ReadOnlyDB Wrapper

- [ ] Reject non-SELECT statements
- [ ] Wrap with user-scoped connection for RLS enforcement
- [ ] Add query timeout enforcement

#### TODO 12: Transaction Context for Mutating Imperatives

- [ ] Wrap mutating imperative execution in a database transaction
- [ ] On success commit, on error rollback
- [ ] Broadcast entity changes if mutations occurred

### Phase 4: Error Handling

#### TODO 13: Imperative Error to FORGE Message Conversion

- [ ] Define `ImperativeError` type with `Code` and `Message`
- [ ] Map to FORGE message responses
- [ ] Never expose internal error details to the frontend

#### TODO 14: Panic Recovery

- [ ] Wrap `Execute()` in `defer recover()`
- [ ] Log panics with full stack trace
- [ ] Return `IMPERATIVE_PANIC` error to client

### Phase 5: Testing

#### TODO 15-18: Test Coverage

- [ ] Unit tests for imperative parsing (all syntax variants)
- [ ] Unit tests for imperative analysis (validation, duplicates, references)
- [ ] Integration tests for imperative execution (sandbox, capabilities, DB access)
- [ ] End-to-end test (declare, implement, build, call, verify)

### Phase 6: Documentation and Developer Workflow

#### TODO 19-20: Docs and CLI

- [ ] Developer guide with complete examples
- [ ] Add `--imperative` flag to `forge build`
- [ ] Update language reference, runtime reference, and SDK reference

---

## 5. Security Model

### Sandbox Contract

The imperative sandbox is an **allowlist**, not a denylist. The function receives only what it declared.

| Resource | Default | With Declaration |
|----------|---------|-----------------|
| Database (read) | Allowed (user-scoped, RLS enforced) | Allowed |
| Database (write) | Denied | Allowed only if `mutates: true` |
| Capabilities (http.call, etc.) | Denied | Allowed only if declared in `capabilities` |
| File system | Denied | Denied (no escape) |
| Network (raw) | Denied | Denied (use capabilities) |
| Environment variables | Denied | Denied (use runtime config) |
| Goroutine spawning | Allowed (context deadline enforced) | Same |
| Standard library | Allowed (math, strings, encoding, etc.) | Same |

### What the Sandbox Cannot Prevent

Because imperative code compiles into the same Go binary, it has theoretical access to anything in the process. The sandbox is a **contract**, not a VM boundary.

The `ImperativeContext` is the enforcement mechanism: if you do not pass a resource to the function, the function has no way to reference it (no global `db` variable, no global `http.Client`). This is capability-based security via dependency injection.

**Mitigation for compile-time bypass:**
- `forge build --imperative` runs a static analysis pass on the imperative package
- Reject imports of `os`, `os/exec`, `net`, `net/http`, `syscall`, `unsafe`, `plugin`
- Allow a `--allow-import` escape hatch for specific packages (explicit opt-in)

### Timeout Enforcement

- Context deadline: 30 seconds default, configurable per block
- Database queries inherit the deadline
- Capability executions inherit the deadline
- Exceeded deadline returns 504 Gateway Timeout

---

## 6. Integration with Existing Systems

### With Rules

Imperative code does **not** trigger rule evaluation the way actions do. Rules are SQL predicates enforced at the database level. Imperative read queries see only data that passes RLS. Imperative writes (when `mutates: true`) are subject to RLS write policies.

### With Access Control

Enforced at two levels: endpoint authentication and database-level RLS via `db.WithUser(uid)`.

### With Hooks

Imperative executions do not trigger hooks. This is intentional -- hooks are part of the declarative action pipeline. If the developer needs hooks to fire, they should use an action.

### With Jobs

Imperative code cannot enqueue jobs directly. To enqueue a job, trigger an action that has the appropriate hook. Future enhancement may add `enqueue` support.

### With Views and Realtime

Mutating imperatives (`mutates: true`) should trigger WebSocket broadcasts via `broadcastEntityChange()`. Read-only imperatives have no view interaction.

### With the SDK

The emitter generates TypeScript client methods and React hooks for each imperative block. Return type determines client-side handling (JSON parsing, Blob download, text).

---

## 7. Verification Checklist

### Compiler

- [ ] `imperative` keyword tokenizes correctly
- [ ] Parser handles all valid imperative syntax variations
- [ ] Parser produces correct diagnostics for invalid syntax
- [ ] Analyzer validates input entity references
- [ ] Analyzer validates return types
- [ ] Analyzer validates capability declarations
- [ ] Analyzer detects duplicate imperative names
- [ ] Normalizer produces `NormalizedImperative` entries
- [ ] Planner produces `ImperativeNode` entries
- [ ] Emitter includes `ImperativeSchema` in artifact JSON
- [ ] Emitter generates TypeScript client methods
- [ ] Emitter generates React hooks

### Runtime

- [ ] Server loads imperative schemas from artifact
- [ ] Server validates registered functions match declared imperatives
- [ ] Handler routes `POST /api/imperative/{name}` correctly
- [ ] Handler returns 404 for unknown imperative names
- [ ] Handler returns 501 for declared-but-unregistered imperatives
- [ ] Handler returns 401 for unauthenticated requests (when auth required)
- [ ] `ImperativeContext` provides correct user ID
- [ ] `ReadOnlyDB` rejects non-SELECT statements
- [ ] `ReadOnlyDB` enforces RLS via user-scoped connection
- [ ] `MutableDB` is nil when `mutates: false`
- [ ] `MutableDB` wraps execution in a transaction when `mutates: true`
- [ ] `ScopedCapabilities` rejects undeclared capabilities
- [ ] `ScopedCapabilities` correctly delegates to provider registry
- [ ] Errors are converted to FORGE message responses
- [ ] Panics are caught, logged, and returned as error responses
- [ ] Context deadline is enforced
- [ ] Return types handled correctly (json, file, string, bytes)

### Integration

- [ ] End-to-end: declare, implement, build, call, verify response
- [ ] SDK: generated types match runtime response format
- [ ] Dev info page (`/_dev/imperatives`) lists declared imperative blocks
- [ ] Hot reload: schema changes reflected after `forge dev` rebuild

### Security

- [ ] Static analysis rejects restricted imports in imperative packages
- [ ] RLS enforced on all database access from imperative code
- [ ] Capabilities restricted to declared allowlist
- [ ] Timeout enforced on imperative execution
- [ ] Error details not leaked to clients in production
