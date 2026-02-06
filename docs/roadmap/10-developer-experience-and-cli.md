# Roadmap: Developer Experience & CLI Improvements

**Status**: Planning
**Priority**: High -- DX is the primary growth lever for adoption
**Scope**: CLI, compiler diagnostics, VS Code extension, dev mode, onboarding

---

## 1. Current State Assessment

### What Works

| Area | Status | Notes |
|------|--------|-------|
| `forge init` | Basic | Creates `app.forge`, `forge.runtime.toml`, `web/` directory |
| `forge check` | Working | Validates .forge files, prints diagnostics |
| `forge build` | Working | Produces artifact.json, schema.sql, SDK |
| `forge run` | Working | Starts server with artifact, graceful shutdown |
| `forge dev` | Working with issues | Build + watch + server, but race conditions exist |
| `forge migrate` | Working | Status, apply, dry-run modes |
| `forge version` | Working | Prints version, commit, build date |
| VS Code extension | Partial | Syntax highlighting, completions, go-to-def, hover, rename |
| Dev info pages | Working | Full dashboard at `/_dev` with 13 sub-pages |
| Diagnostics system | Structured | LSP-ready with Range, Severity, Code, FixHint, Related |
| Error codes | Defined | 40+ codes across E01xx-E07xx, W01xx, H01xx |

### Pain Points

1. **Error messages are terse and lack context.** The CLI prints `filename:line:column: error[E0301]: Undefined entity` with no source line, no caret, no suggestion. Compare to Rust/Elm where the error itself teaches you the language.

2. **`forge dev` has race conditions.** The server goroutine in `cmdDev` has no graceful shutdown -- when a rebuild triggers `serverRestart`, the old server is never stopped (the `go srv.Run()` on line 470 launches the server but there is no mechanism to call `srv.Shutdown()`). Each rebuild leaks a server goroutine and potentially a port binding.

3. **`forge init` produces a single template.** No choice of starter project. The generated `app.forge` uses `auth: token` (not the recommended `auth: password`). No `.gitignore` is created. No instructions for installing dependencies.

4. **No `forge test` command.** The spec lists `forge test` as a CLI command (Section 23), but it is not implemented. Test declarations in `.forge` files are parsed but never executed.

5. **No `forge doctor` or environment validation.** New users get cryptic errors when PostgreSQL is not installed, Go version is wrong, or `forge.runtime.toml` is misconfigured.

6. **No progress indicators.** Long operations (embedded Postgres startup, migration apply, initial build) show no progress. The user sees a blank terminal for 5-15 seconds.

7. **No color in terminal output.** All output is plain text. Errors and warnings look identical at a glance.

8. **VS Code extension diagnostics use a separate parser.** The LSP server (`vscode-forge/src/server/parser.ts`) is a hand-written parser that is separate from the Go compiler. Diagnostics in the editor may differ from `forge check`. The LSP parser does not produce the same error codes.

9. **No incremental compilation.** Every rebuild parses all `.forge` files from scratch. For large projects this could become slow.

10. **No browser auto-refresh.** The server broadcasts `artifact_reload` over WebSocket, but the generated SDK does not listen for it to trigger a page refresh.

### Missing Features

- `forge doctor` -- environment health check
- `forge status` -- project summary (entity count, action count, coverage)
- `forge generate` -- regenerate SDK without full rebuild
- `forge test` -- execute `.forge` test declarations
- `forge init` with templates
- Interactive mode / REPL
- Error code documentation links
- Terminal UI for dev mode

---

## 2. Error Message Improvements

### 2.1 Compiler Errors with Source Context

**Current output:**
```
app.forge:15:3: error[E0301]: Undefined entity: Organization
app.forge:22:5: error[E0302]: Undefined field: Ticket.assignee
```

**Target output:**
```
error[E0301]: Undefined entity 'Organization'
  --> app.forge:15:3
   |
14 |   access Ticket {
15 |     read: user in Organization.members
   |                   ^^^^^^^^^^^^ not found
   |
   = help: Did you mean 'Org'? (defined in entities.forge:8)
   = help: See https://forge-lang.dev/errors/E0301

error[E0302]: Undefined field 'assignee' on entity 'Ticket'
  --> app.forge:22:5
   |
22 |     write: user == assignee
   |                    ^^^^^^^^ 'Ticket' has no field 'assignee'
   |
   = help: Available fields on Ticket: id, subject, status, author, created_at
   = help: Did you mean 'author'?
```

**Files to modify:**
- `compiler/forge/compile.go` -- Add source content to `Diagnostic` struct
- `runtime/cmd/forge/main.go` -- Replace `printDiagnostics` with rich formatter
- New file: `runtime/cmd/forge/diagnostic_printer.go` -- Formatting logic

**Implementation approach:**
1. Extend `forge.Diagnostic` with a `SourceLine string` field and `EndLine`/`EndColumn` for multi-character underlines.
2. In `parseAndAnalyze`, store file content in a map keyed by filename. When converting `diag.Diagnostic` to `forge.Diagnostic`, look up the source line.
3. Create a `DiagnosticPrinter` that formats with ANSI colors, source context, caret underlines, and help text.
4. The printer reads the original file to extract surrounding lines (2 lines of context above and below).

**Acceptance criteria:**
- [ ] Every error shows the source line with the error span underlined
- [ ] Multi-line errors show all relevant lines
- [ ] At least one line of context above and below the error
- [ ] Filename, line, and column are in `-->` format (Rust style)
- [ ] Colors are disabled when stdout is not a TTY (check `os.Getenv("NO_COLOR")` and `isatty`)

### 2.2 Suggested Fixes in Error Messages

**Files to modify:**
- `compiler/internal/analyzer/analyzer.go` -- Add Levenshtein distance suggestions
- `compiler/internal/diag/diag.go` -- Already has `FixHint` / `CodeAction` / `Related`
- `runtime/cmd/forge/main.go` -- Print fix hints

**Implementation approach:**
1. The `diag.Diagnostic` struct already supports `FixHint *CodeAction` and `Related []Related`. These are populated by the analyzer but never displayed by the CLI.
2. For `E0301` (undefined entity): compute edit distance against all known entity names. If distance <= 2, suggest "Did you mean 'X'?"
3. For `E0302` (undefined field): list available fields on the entity.
4. For `E0305` (undefined message): suggest creating the message with a skeleton.
5. For `E0207` (invalid declaration): suggest valid declaration keywords.

**Before/after example:**
```
# Before
app.forge:12:3: error[E0305]: Undefined message: TCIKET_CLOSED

# After
error[E0305]: Undefined message 'TCIKET_CLOSED'
  --> app.forge:12:3
   |
12 |     emit TCIKET_CLOSED
   |          ^^^^^^^^^^^^^ not defined
   |
   = help: Did you mean 'TICKET_CLOSED'? (defined in messages.forge:1)
   = fix: Add this to your .forge file:
   |   message TCIKET_CLOSED {
   |     level: error
   |     default: "TODO"
   |   }
```

**Acceptance criteria:**
- [ ] Typo suggestions for entity, field, message, job, action references (edit distance <= 3)
- [ ] "Available X" lists when the set is small (< 10 items)
- [ ] Skeleton code suggestions for missing declarations
- [ ] Fix hints are printed below the error with `= fix:` prefix

### 2.3 Color-Coded Terminal Output

**Files to modify:**
- New file: `runtime/cmd/forge/color.go` -- ANSI color utilities
- `runtime/cmd/forge/main.go` -- Use colors in all output

**Color scheme:**
| Element | Color | ANSI Code |
|---------|-------|-----------|
| `error` | Red bold | `\033[1;31m` |
| `warning` | Yellow bold | `\033[1;33m` |
| `info` | Blue | `\033[34m` |
| `hint` | Cyan | `\033[36m` |
| Error code (e.g., `E0301`) | Dim | `\033[2m` |
| Source line number | Blue | `\033[34m` |
| Caret/underline | Red/Yellow (matches severity) | |
| Success messages | Green | `\033[32m` |
| File path | Bold | `\033[1m` |

**Implementation approach:**
1. Create a `color` package with `Red()`, `Green()`, `Yellow()`, `Blue()`, `Bold()`, `Dim()`, `Reset()` functions.
2. Check `NO_COLOR` env var and `isatty(stdout)` to disable colors automatically.
3. Apply to all CLI output: diagnostics, success messages, progress indicators.

**Acceptance criteria:**
- [ ] Errors are red, warnings are yellow, success is green
- [ ] Colors disabled when `NO_COLOR` is set or stdout is not a TTY
- [ ] Piping output to a file produces clean, color-free text
- [ ] Tests pass with colors disabled

### 2.4 Error Codes with Documentation Links

**Files to modify:**
- `runtime/cmd/forge/diagnostic_printer.go` -- Append URL to each diagnostic
- New: `docs/errors/` directory with one file per error category
- Website: error code pages

**Implementation approach:**
1. Append `= help: See https://forge-lang.dev/errors/E0301` to every diagnostic.
2. Create error reference pages on the website. Each page shows:
   - Error code and message template
   - Common causes
   - How to fix it
   - Example of correct code
3. The URL format is `https://forge-lang.dev/errors/{CODE}` (e.g., `/errors/E0301`).

**Acceptance criteria:**
- [ ] Every diagnostic includes a documentation URL
- [ ] Error reference pages exist for all E01xx through E07xx codes
- [ ] Links work in both terminal (clickable in modern terminals) and web

---

## 3. CLI Improvements

### 3.1 `forge init` with Templates

**Current behavior:**
```bash
forge init myapp
# Creates: myapp/app.forge, myapp/forge.runtime.toml, myapp/web/
```

**Target behavior:**
```bash
forge init myapp
# Interactive: Choose template
#   > blank      - Empty project with a single entity
#     helpdesk   - Ticket management system (entities, rules, access)
#     chat       - Real-time chat application (channels, messages, WebSocket)
#     api        - API-only project (no frontend, JWT auth)

forge init myapp --template helpdesk   # Non-interactive
forge init myapp --template blank      # Explicit blank
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Extend `cmdInit` with template flag and logic
- New: `runtime/cmd/forge/templates/` -- Embedded template files (using `//go:embed`)

**Template contents:**

| Template | Files | Description |
|----------|-------|-------------|
| `blank` | `app.forge`, `forge.runtime.toml`, `.gitignore` | Minimal: 1 entity, 1 view, password auth |
| `helpdesk` | `app.forge`, `entities.forge`, `rules.forge`, `access.forge`, `actions.forge`, `messages.forge`, `views.forge`, `forge.runtime.toml`, `.gitignore` | Full example with Ticket, Comment, User entities |
| `chat` | `app.forge`, `entities.forge`, `relations.forge`, `access.forge`, `actions.forge`, `views.forge`, `forge.runtime.toml`, `.gitignore` | Channel, Message, User with real-time |
| `api` | `app.forge`, `forge.runtime.toml`, `.gitignore` | JWT auth, no frontend directory |

**Terminal output after init:**
```
  Created FORGE project: myapp (template: helpdesk)

  myapp/
    app.forge            Application config
    entities.forge       Ticket, Comment, User entities
    rules.forge          Business rules (forbid closing closed tickets)
    access.forge         Access control (agents read all, users read own)
    actions.forge        create_ticket, close_ticket, add_comment
    messages.forge       TICKET_CLOSED, COMMENT_REQUIRED
    views.forge          TicketList, TicketDetail
    forge.runtime.toml   Runtime configuration
    .gitignore           Ignores .forge-runtime/, .forge-data/

  Next steps:
    cd myapp
    forge dev            Start development server
    open http://localhost:8080/_dev    Explore your app
```

**Acceptance criteria:**
- [ ] `forge init myapp` with no flags uses `blank` template
- [ ] `--template` flag selects a specific template
- [ ] All templates include `.gitignore` with `.forge-runtime/`, `.forge-data/`, `node_modules/`
- [ ] All templates use `auth: password` (not `auth: token`)
- [ ] All templates use embedded PostgreSQL by default
- [ ] Generated output shows the created file tree
- [ ] Templates are embedded in the binary (no external files needed)

### 3.2 `forge doctor` -- Environment Diagnostics

**Target behavior:**
```bash
forge doctor

  FORGE Doctor
  ============

  forge binary     v0.2.0 (commit abc1234)          OK
  Go version       go1.22.5                          OK
  PostgreSQL       psql 16.2 (via embedded)          OK
  Node.js          v20.11.0                          OK (optional)
  npm              v10.2.4                           OK (optional)
  Project          ./app.forge found                 OK
  Config           ./forge.runtime.toml found        OK
  Build artifact   ./.forge-runtime/artifact.json    MISSING
                   Run 'forge build' to create

  1 issue found. Run the suggested commands to fix.
```

**Error case:**
```bash
forge doctor

  FORGE Doctor
  ============

  forge binary     v0.2.0                            OK
  Go version       go1.21.0                          WARN: 1.22+ recommended
  PostgreSQL       not found                         ERROR
                   Install: brew install postgresql@16
                   Or use embedded mode (default)
  Node.js          not found                         WARN (optional for backend-only)
  Project          no .forge files found             ERROR
                   Run 'forge init myapp' to create a project
  Config           forge.runtime.toml not found      WARN
                   Using defaults (embedded postgres, port 8080)

  2 errors, 2 warnings. Fix errors before running 'forge dev'.
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Add `doctor` command to switch statement
- New file: `runtime/cmd/forge/doctor.go` -- All doctor logic

**Checks to perform:**
1. FORGE binary version and build info
2. Go version (check `runtime.Version()`)
3. PostgreSQL availability (`psql --version` or embedded availability)
4. Node.js and npm (optional, for frontend development)
5. `.forge` files exist in current directory
6. `forge.runtime.toml` exists and is valid TOML
7. `.forge-runtime/artifact.json` exists (has `forge build` been run?)
8. Database connectivity (if configured with external postgres)
9. Port availability (is port 8080 already in use?)
10. Disk space for embedded postgres data directory

**Acceptance criteria:**
- [ ] `forge doctor` exits 0 when all checks pass
- [ ] `forge doctor` exits 1 when any ERROR check fails
- [ ] Each check shows OK / WARN / ERROR with color
- [ ] Failing checks include remediation instructions
- [ ] Optional dependencies (Node.js) show WARN, not ERROR
- [ ] Works correctly when run outside a FORGE project directory

### 3.3 `forge status` -- Project Summary

**Target behavior:**
```bash
forge status

  myapp (v0.1.0) -- auth: password, database: postgres (embedded)

  Entities    3    User, Ticket, Comment
  Relations   2    Ticket.author -> User, Comment.ticket -> Ticket
  Actions     4    create_ticket, close_ticket, add_comment, delete_ticket
  Rules       2    Ticket.update (forbid if closed), Comment.create (require body)
  Access      3    User, Ticket, Comment
  Views       2    TicketList, TicketDetail
  Jobs        1    notify_agent
  Hooks       1    Ticket.after_create
  Messages    2    TICKET_CLOSED, COMMENT_REQUIRED
  Tests       3    Ticket.update, Comment.create, create_ticket

  Last build: 2 minutes ago (artifact.json: 4.2 KB)
  Server:     not running
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Add `status` command
- New file: `runtime/cmd/forge/status.go` -- Status logic

**Implementation approach:**
1. Run `forge.Check(files)` to get the parsed AST without building.
2. Count each declaration type from the parse result.
3. Check if `.forge-runtime/artifact.json` exists and its modification time.
4. Check if a server is running by attempting to connect to the configured port.
5. Print a summary table.

**Acceptance criteria:**
- [ ] Shows all declaration counts with names
- [ ] Shows last build time (or "never built")
- [ ] Shows server status (running / not running)
- [ ] Works even with compilation errors (shows partial info)
- [ ] Exits 0 always (informational only)

### 3.4 `forge generate` -- SDK Regeneration

**Target behavior:**
```bash
forge generate

  Regenerated SDK:
    .forge-runtime/sdk/client.ts    (12.4 KB)
    .forge-runtime/sdk/react.tsx    (8.7 KB)

  Tip: Import from '.forge-runtime/sdk/client' in your frontend code.
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Add `generate` command
- Reuse existing build pipeline but skip artifact.json and schema.sql output

**Implementation approach:**
1. Run the full compile pipeline (same as `forge build`).
2. Write only the SDK files (`client.ts`, `react.tsx`).
3. This is useful when the TypeScript SDK template changes without .forge file changes.

**Acceptance criteria:**
- [ ] Regenerates `client.ts` and `react.tsx` without touching `artifact.json` or `schema.sql`
- [ ] Prints file sizes
- [ ] Exits 1 if compilation fails

### 3.5 `forge test` -- Execute Test Declarations

**Target behavior:**
```bash
forge test

  Running 3 tests...

  PASS  Ticket.update -- forbid closed ticket update      (2ms)
  PASS  Comment.create -- require comment body             (1ms)
  FAIL  create_ticket -- creates ticket with defaults      (3ms)
        Expected: status = open
        Actual:   status = null
        at tests.forge:15

  2 passed, 1 failed (6ms total)
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Add `test` command
- New file: `runtime/cmd/forge/test.go` -- Test runner
- `compiler/forge/compile.go` -- Expose parsed test declarations in `CompileResult`

**Implementation approach:**
1. Parse `.forge` files and extract `test` declarations from the AST.
2. For each test:
   a. Set up a transaction with the `given` state
   b. Execute the `when` operation
   c. Check the `expect` outcome
   d. Roll back the transaction
3. Use the embedded PostgreSQL for test isolation.
4. Report results in TAP-like format.

**Acceptance criteria:**
- [ ] Discovers all `test` declarations across all `.forge` files
- [ ] Each test runs in an isolated transaction (rolled back after)
- [ ] PASS/FAIL output with timing
- [ ] Failed tests show expected vs actual
- [ ] Exit code = number of failed tests (0 = all passed)
- [ ] `--filter` flag to run specific tests by name

### 3.6 Improved Help Text

**Current:**
```
FORGE - Compile application intent into a sealed runtime

Usage:
  forge <command> [options]

Commands:
  init [name]       Create a new FORGE project
  check             Validate .forge files
  build             Compile .forge files to runtime artifact
  run               Start the runtime server
  dev               Build, run, and watch for changes
  migrate           Show or apply database migrations
  version           Print version information
  help              Show this help

Run 'forge <command> --help' for more information on a command.
```

**Target:**
```
FORGE - Compile application intent into a sealed runtime

Usage:  forge <command> [options]

Development:
  init [name]       Create a new FORGE project
  dev               Build, run, and watch for changes (recommended)
  check             Validate .forge files without building
  build             Compile .forge files to runtime artifact
  generate          Regenerate TypeScript SDK

Server:
  run               Start the runtime server
  migrate           Show or apply database migrations

Testing:
  test              Run .forge test declarations

Info:
  status            Show project summary
  doctor            Check environment and dependencies
  version           Print version information
  help              Show this help

Run 'forge <command> --help' for more information on a command.
Documentation: https://forge-lang.dev/docs
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Update `printUsage` function

**Acceptance criteria:**
- [ ] Commands grouped by category (Development, Server, Testing, Info)
- [ ] Documentation URL in help output
- [ ] `forge dev` is listed first in Development (it is the most common command)
- [ ] Unknown command error suggests the closest valid command

---

## 4. Dev Mode Improvements

### 4.1 Fix Race Conditions in Hot Reload

**Current problem (in `cmdDev`, lines 442-527 of `runtime/cmd/forge/main.go`):**

1. The server goroutine on line 470 (`go srv.Run()`) starts a server but there is no reference kept to `srv` for shutdown. When a restart signal arrives, a new `NewServer` is created, but the old server's `http.Server` is never shut down. This leaks goroutines and may fail to bind the port.

2. The debounce timer callback on line 504 captures `event.Name` from the outer loop variable. Under rapid file changes, the printed filename may be stale or wrong.

3. There is no mutual exclusion between the rebuild function and the server restart. If the rebuild takes time, a second file change could trigger a concurrent rebuild.

**Target architecture:**
```
cmdDev
  |
  +-- Initial build
  |
  +-- Start server (with context for cancellation)
  |
  +-- Start file watcher
  |
  +-- Event loop:
        File changed ->
          1. Cancel old server context (graceful shutdown with 5s timeout)
          2. Wait for server to stop
          3. Rebuild
          4. If build succeeded: start new server
          5. If build failed: print errors, keep watching
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Rewrite `cmdDev` function
- `runtime/forge/server.go` -- Add `Shutdown(ctx)` method to public API

**Implementation approach:**
1. Store a reference to the current `*runtimeforge.Server` and its cancel function.
2. On rebuild:
   a. Call `cancel()` on the current server's context
   b. Wait for `srv.Shutdown()` to complete (max 5 seconds)
   c. Close the database connection
   d. Run `build()`
   e. If successful, create a new server and start it
3. Use a mutex around the rebuild+restart sequence to prevent concurrent restarts.
4. The debounce timer should use a copy of the filename, not a closure over the loop variable.

**Before/after behavior:**

```
# Before: Second file save while rebuilding
File changed: app.forge
Rebuild successful!
Server running on http://localhost:8080    <-- old server still running
File changed: app.forge
Rebuild successful!
Server error: bind: address already in use  <-- port conflict

# After: Second file save while rebuilding
File changed: app.forge
Stopping server...
Rebuilding... done (142ms)
Server running on http://localhost:8080

File changed: entities.forge
Stopping server...
Rebuilding... done (98ms)
Server running on http://localhost:8080
```

**Acceptance criteria:**
- [ ] Old server is shut down before new server starts
- [ ] Port is released before rebind attempt
- [ ] Concurrent file changes are debounced (only one rebuild per 200ms window)
- [ ] Build errors do not crash the watcher -- keep watching for fixes
- [ ] Ctrl+C cleanly shuts down the server and exits

### 4.2 Faster Rebuild (Incremental Compilation)

**Current behavior:** Every rebuild parses all `.forge` files, runs the full analyzer, normalizer, planner, and emitter.

**Target:** Skip unchanged files using content hashing.

**Files to modify:**
- `compiler/forge/compile.go` -- Add file content hash cache
- New file: `compiler/internal/cache/cache.go` -- File hash + AST cache

**Implementation approach:**
1. Before parsing each file, compute its SHA-256 hash.
2. If the hash matches the cached value, reuse the cached AST.
3. If any file changed, re-run the analyzer (since cross-file references may have changed).
4. Cache the analyzer scope and skip re-analysis if no files changed.
5. Store the cache in memory (not on disk) since it only benefits `forge dev`.

**Performance target:**
- Cold build: same as current
- Warm rebuild (1 file changed out of 10): < 50ms
- Warm rebuild (no files changed): < 10ms

**Acceptance criteria:**
- [ ] `forge build` produces identical output with or without cache
- [ ] Cache is invalidated when any file content changes
- [ ] Memory cache only, no disk artifacts
- [ ] Build timing is printed: `Rebuilt 1/10 files in 42ms`

### 4.3 Browser Auto-Refresh on Rebuild

**Current behavior:** The server broadcasts `artifact_reload` over WebSocket when the artifact file changes (see `runtime/internal/server/server.go` line 471). The generated SDK does not handle this event.

**Target:** The generated React SDK automatically triggers a page reload when it receives `artifact_reload`.

**Files to modify:**
- `compiler/internal/emitter/` -- Update TypeScript React SDK template
- Generated file: `.forge-runtime/sdk/react.tsx`

**Implementation approach:**
1. In the generated `ForgeProvider` component, listen for `artifact_reload` WebSocket events.
2. When received in development mode, show a toast "App updated, refreshing..." and call `window.location.reload()` after 500ms.
3. Only enable this behavior when `process.env.NODE_ENV !== 'production'` or when connected to a dev server.
4. Alternatively, inject a small `<script>` into the `/_dev` dashboard HTML that auto-refreshes.

**Acceptance criteria:**
- [ ] Browser automatically refreshes when `.forge` files change
- [ ] Toast notification shown before refresh
- [ ] Only active in development mode
- [ ] Does not interfere with production builds

### 4.4 Terminal UI with Status Dashboard

**Target behavior during `forge dev`:**
```
  FORGE Dev Server                           v0.2.0

  App:      Helpdesk (auth: password)
  Server:   http://localhost:8080            RUNNING
  Database: embedded (port 15432)            CONNECTED
  Watching: 7 .forge files

  Last build: 142ms (0 errors, 1 warning)

  W0101: Entity 'AuditLog' is defined but never referenced
    --> audit.forge:1:1

  Press 'r' to rebuild, 'o' to open browser, 'q' to quit
```

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Rewrite `cmdDev` output
- New file: `runtime/cmd/forge/tui.go` -- Terminal UI rendering

**Implementation approach:**
1. Use ANSI escape codes to create a simple status display (not a full TUI framework like bubbletea -- keep it lightweight).
2. Clear and redraw the status section on each rebuild.
3. Show the last N diagnostics (warnings/errors) in a scrolling section.
4. Support keyboard shortcuts: `r` (manual rebuild), `o` (open browser), `q` (quit).
5. Fall back to simple line-based output when not a TTY.

**Acceptance criteria:**
- [ ] Status dashboard shows server state, last build time, error count
- [ ] Diagnostics are displayed inline without scrolling away
- [ ] Keyboard shortcuts work
- [ ] Graceful fallback when stdout is not a TTY (e.g., CI, piped output)

### 4.5 Clear Error Display on Rebuild Failure

**Current behavior:** Errors are printed sequentially, then "Rebuild failed. Fix errors and save again." appears. On the next rebuild attempt, old errors scroll up and new errors appear below, making it hard to tell which errors are current.

**Target behavior:**
```
  Build failed (3 errors)

  error[E0301]: Undefined entity 'Organizaton'
    --> app.forge:15:3
     |
  15 |   read: user in Organizaton.members
     |                 ^^^^^^^^^^^ not found
     |
     = help: Did you mean 'Organization'?

  error[E0302]: Undefined field 'asignee' on entity 'Ticket'
    --> app.forge:22:5
     |
  22 |   write: user == asignee
     |                  ^^^^^^^ not found on Ticket
     |
     = help: Available fields: id, subject, status, author, created_at

  error[E0305]: Undefined message 'TICKET_CLSOED'
    --> rules.forge:5:5
     |
   5 |     emit TICKET_CLSOED
     |          ^^^^^^^^^^^^^ not defined
     |
     = help: Did you mean 'TICKET_CLOSED'?

  Watching for changes... (fix errors and save)
```

**Implementation approach:**
1. On rebuild failure in dev mode, clear the terminal (ANSI clear screen) and print only current errors.
2. Keep the "Watching for changes..." line at the bottom.
3. When the rebuild succeeds, clear errors and show the success dashboard.

**Acceptance criteria:**
- [ ] On rebuild failure, only current errors are visible (old errors cleared)
- [ ] Error count is shown in the header
- [ ] Success after failure clears the error display

---

## 5. VS Code Extension

### 5.1 Diagnostics from the Go Compiler

**Current state:** The VS Code extension has its own TypeScript parser (`vscode-forge/src/server/parser.ts`) that generates diagnostics independently of the Go compiler. This means errors shown in VS Code may not match `forge check`.

**Target:** Run the Go compiler from the LSP server and surface its diagnostics.

**Files to modify:**
- `vscode-forge/src/server/server.ts` -- Add compiler invocation
- `runtime/cmd/forge/main.go` -- Add `check --json` flag for machine-readable output

**Implementation approach:**
1. Add a `--json` flag to `forge check` that outputs diagnostics as JSON:
   ```json
   {
     "diagnostics": [
       {
         "filename": "app.forge",
         "line": 15,
         "column": 3,
         "end_line": 15,
         "end_column": 15,
         "severity": "error",
         "code": "E0301",
         "message": "Undefined entity: Organization",
         "fix_hint": "Did you mean 'Org'?"
       }
     ]
   }
   ```
2. In the LSP server, on document save, run `forge check --json` and parse the output.
3. Convert compiler diagnostics to LSP diagnostics.
4. Keep the TypeScript parser for instant feedback (syntax errors), but overlay compiler diagnostics for semantic errors.
5. Debounce compiler invocations (wait 500ms after last change).

**Acceptance criteria:**
- [ ] `forge check --json` outputs machine-readable diagnostics
- [ ] VS Code shows the same errors as `forge check`
- [ ] Diagnostics update within 1 second of saving a file
- [ ] Syntax highlighting and completions remain instant (no waiting for compiler)

### 5.2 Enhanced Auto-Completion

**Current state:** The completion provider (`vscode-forge/src/server/completion.ts`) offers:
- Declaration keyword snippets (entity, action, view, etc.)
- Type completions inside entity blocks
- Constraint completions after types
- Context-aware body completions (rule-body, access-body, etc.)
- Entity/action/job/message/view name completions from the symbol table

**Improvements needed:**

1. **Field completions after `source: Entity`**: When typing `fields:` in a view, suggest fields from the source entity.
2. **Relation target completions**: When typing `relation Entity.field -> `, suggest all entities.
3. **Enum value completions in rules**: When typing `status == `, suggest the enum values from the field definition.
4. **`creates:`/`updates:`/`deletes:` completions in actions**: Suggest entity names.
5. **Provider and capability completions**: When typing `effect: `, suggest known capabilities.

**Files to modify:**
- `vscode-forge/src/server/completion.ts` -- Add new completion contexts
- `vscode-forge/src/server/symbols.ts` -- Add field lookup by entity name

**Acceptance criteria:**
- [ ] View `fields:` suggests fields from the `source:` entity
- [ ] Action body suggests `creates:`, `updates:`, `deletes:` with entity completions
- [ ] Relation `->` suggests all entity names
- [ ] Rule conditions suggest enum values for enum fields

### 5.3 Enhanced Go-to-Definition

**Current state:** Go-to-definition works for entities, actions, jobs, messages, views, relations, and fields via the symbol table.

**Improvements needed:**

1. **Go-to-definition for `creates: Entity` / `updates: Entity` / `deletes: Entity`**
2. **Go-to-definition from view fields to entity field definitions** (e.g., `fields: subject` jumps to `subject: string` in the entity)
3. **Go-to-definition for `effect: email.send`** (jump to provider configuration or documentation)

**Files to modify:**
- `vscode-forge/src/server/server.ts` -- Extend `onDefinition` handler
- `vscode-forge/src/server/parser.ts` -- Parse additional reference sites

**Acceptance criteria:**
- [ ] Ctrl+click on a view field jumps to the entity field definition
- [ ] Ctrl+click on `creates: Ticket` jumps to entity Ticket

### 5.4 Hover Information

**Current state:** Hover shows entity fields, action/job/message/view descriptions, and type information.

**Improvements needed:**

1. **Show access rules on entity hover**: `entity Ticket` hover should show the read/write access expressions.
2. **Show rules on action hover**: `action close_ticket` should show which rules apply.
3. **Show field constraints on field hover**: `subject: string length <= 120` should show on hover over `subject` in a view.
4. **Show relation cardinality**: `relation Ticket.author -> User` vs `many`.

**Files to modify:**
- `vscode-forge/src/server/server.ts` -- Extend `onHover` handler
- `vscode-forge/src/server/symbols.ts` -- Add accessors for related declarations

**Acceptance criteria:**
- [ ] Entity hover shows field list + access rules
- [ ] Field hover shows type, constraints, and default value
- [ ] Action hover shows input entity and applicable rules

### 5.5 Code Actions (Suggested Fixes)

**Current state:** Quick fixes exist for undefined entities, messages, and jobs (create a skeleton declaration).

**Improvements needed:**

1. **Create access block when entity has no access rules** (warning: "Entity 'Ticket' has no access rules")
2. **Add missing `creates:`/`updates:`/`deletes:` to actions** when the compiler reports it
3. **Create missing message when `emit UNKNOWN_MSG` is found**
4. **Extract entity from inline field definition** (refactoring: move fields to a separate file)

**Files to modify:**
- `vscode-forge/src/server/server.ts` -- Extend `onCodeAction` handler

**Acceptance criteria:**
- [ ] "Create entity" quick fix inserts at end of file (not beginning)
- [ ] "Add access rules" creates a skeleton access block
- [ ] All quick fixes produce valid .forge syntax

---

## 6. Documentation & Onboarding

### 6.1 Getting Started Guide (0 to Running App in 5 Minutes)

**Current state:** `docs/getting-started.md` exists but references building from source with a two-step compile, expects external PostgreSQL, and the "first API call" is 10 steps away.

**Target:** A new user can go from zero to a running app in 5 minutes with a single install command.

**Revised flow:**
```
Step 1: Install FORGE                            (30 seconds)
  curl -fsSL https://forge-lang.dev/install | bash

Step 2: Create a project                         (10 seconds)
  forge init myapp --template helpdesk
  cd myapp

Step 3: Start development                        (60 seconds, includes embedded postgres)
  forge dev

Step 4: Open the dashboard                       (5 seconds)
  open http://localhost:8080/_dev

Step 5: Make a change and see it hot-reload       (30 seconds)
  # Edit app.forge, save, see terminal rebuild
```

**Files to modify:**
- `docs/getting-started.md` -- Complete rewrite

**Key changes:**
1. Remove the "build from source" instructions from the quick start (move to "Contributing" docs).
2. Use `curl | bash` install as the primary method.
3. Use `--template helpdesk` to give users a real app immediately.
4. Embedded PostgreSQL means no database setup step.
5. Show the `/_dev` dashboard in a screenshot.
6. Total steps: 5 (not 10).

**Acceptance criteria:**
- [ ] A developer with no FORGE knowledge can follow the guide and have a running app in 5 minutes
- [ ] No external dependency installation required (no `createdb`, no `brew install postgresql`)
- [ ] Guide tested on macOS (Apple Silicon), macOS (Intel), and Linux (Ubuntu)

### 6.2 Interactive Tutorial

**Target:** `forge tutorial` command that walks through creating an app step-by-step.

**Implementation approach:**
1. A CLI-based guided experience:
   ```
   forge tutorial

     Welcome to FORGE!

     This tutorial will walk you through building a Todo app.
     Each step explains a concept and asks you to write .forge code.

     Step 1/8: Define your first entity
     ====================================

     Entities are the data models of your app. Define a Task entity
     with a title (string) and completed (bool) field:

     Edit todo.forge and add:

       entity Task {
         title: string
         completed: bool = false
       }

     Press Enter when ready to check...
   ```
2. After each step, run `forge check` and validate the expected declarations exist.
3. Progress is stored in `.forge-tutorial-state` (JSON).

**Files to modify:**
- `runtime/cmd/forge/main.go` -- Add `tutorial` command
- New file: `runtime/cmd/forge/tutorial.go`

**Acceptance criteria:**
- [ ] Tutorial covers: entity, relation, access, action, view, rule, message
- [ ] Each step validates the user's code
- [ ] Can resume from where you left off
- [ ] Can skip to any step

### 6.3 Error Code Reference

**Target:** Each error code has a dedicated documentation page.

**Structure:**
```
docs/errors/
  E0101.md   # Unexpected character
  E0102.md   # Unterminated string
  ...
  E0301.md   # Undefined entity
  E0302.md   # Undefined field
  ...
  index.md   # Error code table with categories
```

**Each error page contains:**
1. Error code and one-line summary
2. What triggers this error
3. Example of code that produces it
4. How to fix it
5. Related error codes

**Acceptance criteria:**
- [ ] Every error code in `compiler/internal/diag/diag.go` has a documentation page
- [ ] Error pages are linked from CLI output
- [ ] Error pages are published on the documentation website

### 6.4 Architecture Guide for Contributors

**Target:** `docs/architecture.md` explaining the compiler pipeline, runtime internals, and how to add a new language feature.

**Contents:**
1. High-level data flow diagram (`.forge` -> tokens -> AST -> scope -> normalized -> plan -> artifact)
2. Package-by-package explanation with key types
3. How to add a new declaration type (step-by-step with file list)
4. How to add a new error code
5. How to add a new CLI command
6. Testing strategy and how to run tests

**Acceptance criteria:**
- [ ] A new contributor can understand the codebase structure in 30 minutes
- [ ] Adding a new error code is a documented procedure
- [ ] All package responsibilities are listed

---

## 7. Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Fix the most painful issues and establish the error formatting system.

| TODO | Files | Approach | Acceptance Criteria |
|------|-------|----------|-------------------|
| Fix `forge dev` race conditions | `runtime/cmd/forge/main.go` | Store server reference, add graceful shutdown, mutex around rebuild | Old server shut down before new one starts; no port conflicts; Ctrl+C exits cleanly |
| Add color utilities | New: `runtime/cmd/forge/color.go` | ANSI color functions with `NO_COLOR` and isatty support | Colors in TTY, plain text in pipes |
| Rich diagnostic printer | New: `runtime/cmd/forge/diagnostic_printer.go`, modify `compiler/forge/compile.go` | Source line extraction, caret underlines, severity colors | Every error shows source context with underline |
| Add `--json` flag to `forge check` | `runtime/cmd/forge/main.go` | JSON output mode for machine consumption | Valid JSON output with all diagnostic fields |
| Improve help text | `runtime/cmd/forge/main.go` | Group commands by category, add doc URL | Help text matches the design in section 3.6 |

### Phase 2: Error Intelligence (Weeks 3-4)

**Goal:** Make errors teach the language.

| TODO | Files | Approach | Acceptance Criteria |
|------|-------|----------|-------------------|
| Typo suggestions (Levenshtein) | `compiler/internal/analyzer/analyzer.go`, new `compiler/internal/util/levenshtein.go` | Compute edit distance against known names | "Did you mean X?" for distance <= 3 |
| "Available fields" in E0302 | `compiler/internal/analyzer/analyzer.go` | Include field list in diagnostic message | E0302 shows all fields on the entity |
| Skeleton suggestions | `compiler/internal/analyzer/analyzer.go` | Generate fix hint with skeleton code | E0305 (undefined message) suggests skeleton declaration |
| Error documentation links | `runtime/cmd/forge/diagnostic_printer.go`, new `docs/errors/` | Append URL to each diagnostic | Every error includes a URL |
| Write error reference docs | New: `docs/errors/*.md` | One markdown file per error code | All E01xx through E07xx documented |

### Phase 3: CLI Expansion (Weeks 5-6)

**Goal:** Add missing CLI commands.

| TODO | Files | Approach | Acceptance Criteria |
|------|-------|----------|-------------------|
| `forge init` with templates | `runtime/cmd/forge/main.go`, new template files with `//go:embed` | Embedded templates, `--template` flag | `forge init myapp --template helpdesk` creates full project |
| `forge doctor` | New: `runtime/cmd/forge/doctor.go` | Check Go, Postgres, Node, project files, port availability | All checks pass/warn/fail with remediation |
| `forge status` | New: `runtime/cmd/forge/status.go` | Parse without building, count declarations, check artifact age | Summary table with all counts |
| `forge generate` | `runtime/cmd/forge/main.go` | Build + write SDK files only | SDK regenerated without touching artifact |
| `.gitignore` in `forge init` | `runtime/cmd/forge/main.go` | Include `.forge-runtime/`, `.forge-data/`, `node_modules/` | `.gitignore` created by all templates |

### Phase 4: Dev Mode Polish (Weeks 7-8)

**Goal:** Make `forge dev` the best development experience.

| TODO | Files | Approach | Acceptance Criteria |
|------|-------|----------|-------------------|
| Terminal status dashboard | New: `runtime/cmd/forge/tui.go` | ANSI-based status display, clear on rebuild | App name, server status, last build time, error count |
| Clear error display on failure | `runtime/cmd/forge/main.go` | Clear screen, print only current errors | Old errors do not persist after rebuild |
| Build timing | `runtime/cmd/forge/main.go` | `time.Since` around build call | "Rebuilt in 142ms" |
| Browser auto-refresh | `compiler/internal/emitter/` (SDK template) | Listen for `artifact_reload` WebSocket event, reload page | Browser refreshes on `.forge` file save |
| Progress indicators | `runtime/cmd/forge/main.go` | Spinner for long operations (embedded postgres startup) | User sees activity during wait |
| Incremental compilation (cache) | New: `compiler/internal/cache/cache.go`, modify `compiler/forge/compile.go` | SHA-256 hash-based AST cache | Warm rebuilds < 50ms for single file change |

### Phase 5: VS Code Extension (Weeks 9-10)

**Goal:** Make the editor experience seamless.

| TODO | Files | Approach | Acceptance Criteria |
|------|-------|----------|-------------------|
| Compiler-backed diagnostics | `vscode-forge/src/server/server.ts` | Run `forge check --json` on save, merge with TS parser diagnostics | Same errors as CLI |
| View field completions | `vscode-forge/src/server/completion.ts` | Look up source entity, suggest its fields | `fields:` in view shows source entity fields |
| Action operation completions | `vscode-forge/src/server/completion.ts` | Suggest `creates:`, `updates:`, `deletes:` with entity names | Action body gets operation completions |
| Enhanced hover info | `vscode-forge/src/server/server.ts` | Show access rules, constraints, relations on hover | Entity hover shows access rules |
| Improved code actions | `vscode-forge/src/server/server.ts` | Insert at end of file, add access blocks, add operation types | Quick fixes produce valid code |

### Phase 6: Documentation & Onboarding (Weeks 11-12)

**Goal:** New users succeed on their first attempt.

| TODO | Files | Approach | Acceptance Criteria |
|------|-------|----------|-------------------|
| Rewrite getting started guide | `docs/getting-started.md` | 5-step flow, no external deps, embedded postgres | 0 to running app in 5 minutes |
| `forge test` command | New: `runtime/cmd/forge/test.go`, modify `main.go` | Parse test declarations, execute against embedded postgres | Tests run and report pass/fail |
| `forge tutorial` command | New: `runtime/cmd/forge/tutorial.go` | Step-by-step CLI tutorial with validation | 8 steps covering all declaration types |
| Architecture guide | New: `docs/architecture.md` | Package map, data flow, how-to-add-feature guide | New contributor understands codebase in 30 minutes |
| Error code reference website pages | Website integration | Publish `docs/errors/*.md` on the website | All error codes have web-accessible pages |

---

## 8. Verification Checklist

### "First 5 Minutes" Experience

- [ ] `curl -fsSL https://forge-lang.dev/install | bash` installs the binary
- [ ] `forge version` prints version info
- [ ] `forge init myapp --template helpdesk` creates a complete project with `.gitignore`
- [ ] `cd myapp && forge dev` starts embedded postgres, builds, and runs without errors
- [ ] `http://localhost:8080/_dev` shows the development dashboard with entities, routes, etc.
- [ ] Editing `app.forge` and saving triggers a hot reload visible in the terminal
- [ ] Browser at `/_dev` auto-refreshes after rebuild
- [ ] `forge doctor` reports all green for the fresh project
- [ ] `forge status` shows entity/action/view counts
- [ ] `Ctrl+C` cleanly shuts down the server

### Error Messages That Teach

- [ ] `E0301` (undefined entity) shows source line, caret, and "Did you mean X?" when applicable
- [ ] `E0302` (undefined field) shows available fields on the entity
- [ ] `E0305` (undefined message) suggests creating the message with skeleton code
- [ ] All errors include a documentation URL
- [ ] Errors are colored (red for errors, yellow for warnings)
- [ ] Colors are disabled when piping to a file or when `NO_COLOR` is set
- [ ] `forge check --json` outputs machine-readable diagnostics

### Dev Feedback Loop

- [ ] `forge dev` shows a status dashboard with app name, server URL, and build status
- [ ] File changes trigger rebuild within 200ms of last save
- [ ] Rebuild time is displayed (e.g., "Rebuilt in 142ms")
- [ ] Build failures show only current errors (old errors cleared)
- [ ] Build success after failure clears the error display
- [ ] No port conflicts on rebuild (old server shut down first)
- [ ] Concurrent file changes are debounced (no double rebuilds)
- [ ] `forge dev` survives 100 consecutive save-rebuild cycles without leaking memory or goroutines

### IDE Experience

- [ ] VS Code extension installs and activates on `.forge` files
- [ ] Syntax highlighting covers all declaration types, keywords, and expressions
- [ ] Auto-completion works for: declarations, types, constraints, entities, fields, messages, jobs
- [ ] Go-to-definition works for: entities, actions, jobs, messages, views, relations, fields
- [ ] Hover shows: entity fields with types, action details, field constraints
- [ ] Red squiggles appear for: parse errors, undefined entities/messages/jobs
- [ ] Quick fixes: create missing entity, create missing message, create missing job
- [ ] Rename works across files

### CLI Help Quality

- [ ] `forge help` shows commands grouped by category
- [ ] `forge <command> --help` shows usage, options, examples
- [ ] `forge unknowncommand` suggests the closest valid command
- [ ] Documentation URL is shown in help output

### Progress Indicators

- [ ] `forge dev` shows a spinner or message during embedded postgres startup
- [ ] `forge migrate -apply` shows progress for each statement
- [ ] `forge build` shows timing on completion
- [ ] `forge test` shows a progress bar or count (1/10, 2/10, etc.)

### Reliability

- [ ] `forge dev` handles rapid file saves (< 50ms between saves) without crashing
- [ ] `forge dev` handles syntax errors in `.forge` files without stopping the watcher
- [ ] `forge dev` handles the artifact file being deleted and recreated
- [ ] `forge dev` handles the `.forge-runtime/` directory being deleted
- [ ] All new CLI commands have corresponding tests in `main_test.go`
- [ ] All error formatting code has unit tests with snapshot comparisons

### Documentation Sync

- [ ] `CLAUDE.md` CLI Reference section updated with new commands
- [ ] `docs/getting-started.md` rewritten for the new flow
- [ ] `docs/cli-reference.md` updated with `doctor`, `status`, `generate`, `test`, `tutorial`
- [ ] Error code reference exists for all error codes
- [ ] Website syntax highlighter is in sync with VS Code TextMate grammar
- [ ] `FORGE_SPEC.md` Section 23 updated to reflect implemented commands
