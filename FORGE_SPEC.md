# FORGE — Application Compiler & Runtime

## Specification & Developer Manual

FORGE is a compiler and sealed runtime for building full applications by describing **state, rules, access, and intent** instead of writing glue code.

This document is the **authoritative specification** for FORGE. It defines the language, runtime model, frontend contract, job system, concurrency model, and extension points.

---

## 1. Core Philosophy

### 1.1 What FORGE Is
FORGE is:
- A **compiler** for application semantics
- A **sealed runtime** that enforces invariants
- A **new application layer**, above Rails / Node / Django

FORGE compiles declarative specifications into:
- Database schema
- Safe transactional queries
- Access control
- Async jobs
- Frontend SDKs
- Realtime state updates

---

### 1.2 What FORGE Is Not
FORGE is not:
- A web framework
- A UI framework
- A low-code builder
- An ORM
- An AI dependency

LLMs can *edit* FORGE specs well, but FORGE does not require AI.

---

### 1.3 Mental Model

Traditional stacks:
Request → Controller → Service → Model → Response

FORGE:
Intent → Rule → Transition → Effect → Message

---

## 2. Application Structure

A FORGE application is defined by `.forge` files only.

```
app/
├── app.forge
├── entities.forge
├── relations.forge
├── rules.forge
├── access.forge
├── actions.forge
├── messages.forge
├── jobs.forge
├── hooks.forge
├── views.forge
└── imperative.forge
```

There are **no controllers, routes, serializers, or policies**.

---

## 3. app.forge

Defines runtime-level intent.

```text
app Helpdesk {
  auth: oauth
  database: postgres
  frontend: web
}
```

---

## 4. Entities

Entities define **state shape only**.

```text
entity Ticket {
  subject: string length <= 120
  status: enum(open, pending, closed) = open
  created_at: time
}
```

Entities:
- Are immutable at runtime except through actions
- Compile to DB tables
- Contain no behavior

---

## 5. Relations

Relations define ownership and connectivity.

```text
relation Ticket.author -> User
relation Ticket.org -> Organization
```

Relations:
- Define foreign keys
- Define traversal paths
- Are used by rules, access, jobs, and views

---

## 6. Rules

Rules define **invariants and forbidden transitions**.

```text
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}
```

Rules:
- Are enforced at compile-time and runtime
- Compile into SQL predicates
- Cannot be bypassed by jobs or code

---

## 7. Access Control

Access rules define who may read or write entities.

```text
access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}
```

Access rules:
- Are enforced before queries
- Apply to API, jobs, and realtime
- Cannot be bypassed

---

## 8. Actions

Actions are **named, typed transactions**.

```text
action close_ticket {
  input: Ticket
}
```

Actions:
- Load entities by ID
- Run in a single transaction
- Enforce rules and access
- Emit messages
- Trigger hooks and jobs

Actions are not endpoints; endpoints are generated automatically.

---

## 9. Messages

Messages are structured outcomes.

```text
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}
```

Messages:
- Are identified by codes
- Are machine-readable
- Power UI feedback, logs, analytics

---

## 10. Jobs

Jobs are **deferred effects**, not logic.

```text
job notify_agent {
  input: Ticket
  needs: Ticket.org.members where role == agent
  effect: email.send
}
```

Jobs:
- Run after commit
- Receive compiler-resolved data
- Have no query power
- Cannot bypass rules

---

## 11. Hooks

Hooks bind actions to effects.

```text
hook Ticket.after_create {
  enqueue notify_agent
}
```

Hooks:
- Cannot mutate state
- May emit messages
- May enqueue jobs

---

## 12. Views

Views define frontend projections.

```text
view TicketList {
  source: Ticket
  fields: subject, status
}
```

Views:
- Are queryable and subscribable
- Respect access rules
- Power realtime updates

---

## 12.1 Presence

Presence tracks **ephemeral user state** with automatic expiration.

```text
presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline) = offline
  custom_status: string optional
  last_seen: time
  ttl: 5m
  scope: workspace
}
```

Presence:
- Auto-expires to default state after TTL without refresh
- Stored in Redis/memory, NOT PostgreSQL
- Scoped to a relation (workspace, channel, etc.)
- Respects access rules via scope
- Queryable via views

### Presence Views

```text
view OnlineUsers {
  source: UserPresence
  filter: workspace == param.workspace and status != offline
  fields: user.id, user.display_name, status
  realtime: true
}
```

### Presence Actions

```text
action update_presence {
  input {
    status: enum(online, away, dnd)
  }
  updates: UserPresence
}
```

---

## 12.2 Ephemeral

Ephemeral defines **broadcast-only state** that never persists.

```text
ephemeral Typing {
  user: User
  channel: Channel optional
  dm: DirectMessage optional
  ttl: 3s
}
```

Ephemeral:
- Never written to storage
- Broadcast via WebSocket only
- Client-side TTL expiration
- No delivery guarantees
- Fire-and-forget semantics

### Ephemeral Views

```text
view ChannelTyping {
  source: Typing
  filter: channel == param.channel
  fields: user.id, user.display_name
  realtime: true
}
```

### Ephemeral Actions

```text
action start_typing {
  input {
    channel: Channel optional
    dm: DirectMessage optional
  }
  creates: Typing
}
```

---

## 13. Frontend SDK

FORGE generates:
- `@forge/client` (transport + cache)
- `@forge/react` (React hooks)

Example:

```tsx
const { data } = useList("TicketList")
```

No manual fetching, no cache invalidation.

---

## 14. Realtime Model

Clients subscribe to views.

- Runtime tracks dependencies
- Emits diffs over WebSocket
- Enforces permissions per event

No manual realtime logic is required.

---

## 15. Concurrency Model

- All mutations go through actions
- Entity-level locking
- Rules compiled into atomic SQL
- Race conditions are prevented by construction

---

## 16. Schema Evolution

You never write migrations.

You change the spec.

```text
migrate Subscription.v2 {
  from: plan enum(free, pro)
  to: tier enum(free, starter, pro)

  map:
    free -> free
    pro  -> starter
}
```

---

## 17. Imperative Code

Imperative code is allowed **only at the edge**.

```text
imperative export_csv {
  input: Ticket
  returns: file
}
```

Imperative code:
- Cannot mutate state unless declared
- Runs in a capability sandbox
- Never owns business logic

---

## 18. Capabilities & Security

Jobs and imperative code run with declared capabilities only:
- email.send
- http.call
- file.write

No raw DB access is allowed.

---

## 19. Runtime Configuration

Runtime config is external.

```toml
[database]
url = "env:DATABASE_URL"

[email]
provider = "smtp"
```

Specs never contain secrets.

---

## 20. Guarantees

FORGE guarantees:
- No hidden state mutations
- No bypassable rules
- No authorization leaks
- Deterministic behavior
- LLM-safe structure

---

## 21. Non-Goals

FORGE does not aim to:
- Replace frontend frameworks
- Handle infrastructure provisioning
- Be infinitely flexible

FORGE is opinionated by design.

---

## 22. Summary

FORGE replaces:
- Controllers with actions
- Policies with access rules
- Jobs with declared effects
- Tests with invariants
- Glue with guarantees

FORGE is the application layer **after** Rails.



---

## 23. CLI & Tooling

FORGE is operated exclusively via CLI.

### Commands

```bash
forge init
forge check
forge build
forge migrate
forge run
forge test
```

- `forge init` — scaffold empty FORGE app
- `forge check` — static validation only
- `forge build` — compile spec → runtime artifact
- `forge migrate` — apply schema changes
- `forge run` — start runtime
- `forge test` — execute invariant tests

---

## 24. Compiler Pipeline

```
.parse → .analyze → .normalize → .plan → .emit
```

1. **Parse**: grammar → AST
2. **Analyze**: type checking, relation resolution
3. **Normalize**: derive implicit effects
4. **Plan**: build action + rule graph
5. **Emit**: runtime artifact + frontend SDK

Compiler failures are fatal. Runtime never guesses.

---

## 25. Runtime Artifact

The compiled artifact contains:

- Entity schemas
- Rule predicates
- Access filters
- Action graphs
- View dependency graph
- Message catalog
- Migration plan
- Capability manifest

Artifacts are immutable and versioned.

---

## 26. Frontend Contract Versioning

Each build emits a versioned frontend SDK.

- Breaking spec changes require version bump
- Clients may pin SDK versions
- Runtime supports multiple versions concurrently

This prevents frontend/runtime drift.

---

## 27. Error Model

FORGE never throws strings.

All failures return:

```json
{
  "status": "error",
  "messages": [{ "code": "TICKET_CLOSED" }]
}
```

Errors are:
- deterministic
- enumerable
- testable

---

## 28. Testing Model

FORGE tests invariants, not behavior.

### Rule Test

```text
test Ticket.update {
  given status = closed
  when update Ticket
  expect reject TICKET_CLOSED
}
```

### Action Test

```text
test close_ticket {
  given Ticket.status = open
  when action close_ticket
  expect Ticket.status = closed
}
```

FORGE can generate property tests automatically.

---

## 29. Observability

Runtime emits structured events:

- action.started
- action.committed
- rule.rejected
- job.enqueued
- job.failed

These are consumable by logs, metrics, tracing.

---

## 30. Multi-Tenancy

Multi-tenancy is modeled, not configured.

```text
relation Organization.members -> User many
```

All access, actions, and views are scoped automatically.

Cross-tenant access is impossible unless explicitly declared.

---

## 31. Offline & Optimistic UI

- Actions are optimistic by default
- Rollbacks handled via messages
- Realtime diffs reconcile state

Frontend never manually manages consistency.

---

## 32. Ejection / Escape Hatch

FORGE allows controlled escape via `imperative`.

- Explicit
- Auditable
- Capability-limited

No silent escape exists.

---

## 33. Design Constraints

FORGE intentionally forbids:

- Arbitrary SQL
- Arbitrary HTTP handlers
- Global mutable state
- Runtime schema changes

These are necessary constraints, not limitations.

---

## 34. Known Limits

FORGE is not ideal for:
- Numerical simulation
- Streaming pipelines
- Unstructured document stores

FORGE excels at **business applications**.

---

## 35. Runtime Plugins

FORGE supports extending the runtime through compile-time plugins.

### Plugin Types

- **Database Providers**: Alternative storage backends
- **Capabilities**: New job effects
- **Integrations**: External system synchronization

### Compile-Time Only

Plugins compile into the runtime binary. There is no dynamic plugin loading.

This preserves the sealed runtime guarantee:
- What you build is what runs
- No arbitrary code loading at startup
- Single binary deployment

### Configuration

```toml
[database]
provider = "mongodb"
url = "env:MONGODB_URL"

[plugins.salesforce]
client_id = "env:SF_CLIENT_ID"
```

### Build Command

```bash
forge build --plugins ./plugins/mongodb,./plugins/salesforce
```

Plugins implement Go interfaces (`provider.DatabaseProvider`, `capability.Capability`, `integration.Integration`).

---

## 36. Glossary

- **Action**: Named state transition
- **Rule**: Invariant or forbidden transition
- **Effect**: Side-effect execution
- **View**: State projection
- **Artifact**: Compiled app bytecode
- **Capability**: Allowed side-effect class
- **Plugin**: Compile-time runtime extension

---

## 37. Final Note

FORGE is designed so that:
- Meaning lives in the spec
- Code executes meaning
- Runtime enforces guarantees

If you find yourself writing glue code, the model has failed.

