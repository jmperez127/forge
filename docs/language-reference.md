# FORGE Language Reference

Complete reference for the `.forge` file syntax.

## File Structure

FORGE apps consist of multiple `.forge` files. The compiler combines all files in a directory.

Recommended structure:
```
app.forge        # App configuration
entities.forge   # Data model
relations.forge  # Entity connections
rules.forge      # Business rules
access.forge     # Access control
actions.forge    # Named transactions
messages.forge   # Error/success messages
hooks.forge      # Action triggers
jobs.forge       # Background jobs
webhooks.forge   # Inbound webhooks
views.forge      # Frontend projections
tests.forge      # Invariant tests
```

## Comments

```text
# Single-line comment (hash style)
// Single-line comment (C style)
/* Multi-line
   comment */
```

---

## App Declaration

Defines application-level configuration.

```text
app AppName {
  auth: oauth | jwt | none
  database: postgres
  frontend: web | mobile | both
}
```

**Properties:**
- `auth` - Authentication method (default: `none`)
- `database` - Database type (only `postgres` supported)
- `frontend` - Frontend type (default: `web`)

---

## Entities

Entities define the data model. They compile to database tables.

```text
entity EntityName {
  field_name: type [constraints] [= default]
}
```

### Field Types

| Type | Description | PostgreSQL |
|------|-------------|------------|
| `string` | Text | `text` |
| `int` | Integer | `integer` |
| `float` | Decimal | `double precision` |
| `bool` | Boolean | `boolean` |
| `time` | Timestamp | `timestamp with time zone` |
| `uuid` | UUID | `uuid` |
| `enum(...)` | Enumeration | Custom enum type |

### Constraints

| Constraint | Syntax | Example |
|------------|--------|---------|
| Unique | `unique` | `email: string unique` |
| Length | `length <= N` | `title: string length <= 100` |
| Length | `length >= N` | `body: string length >= 10` |

### Default Values

```text
status: enum(active, inactive) = active
count: int = 0
enabled: bool = true
name: string = "Untitled"
```

### Implicit Fields

Every entity automatically gets:
- `id: uuid` - Primary key
- `created_at: time` - Creation timestamp
- `updated_at: time` - Update timestamp

### Example

```text
entity User {
  email: string unique
  name: string length <= 100
  role: enum(admin, user, guest) = user
  bio: string
  active: bool = true
}
```

---

## Relations

Relations define connections between entities.

```text
relation Entity.field -> TargetEntity [many]
```

### One-to-One / Many-to-One

```text
relation Ticket.author -> User
relation Comment.ticket -> Ticket
```

### One-to-Many / Many-to-Many

```text
relation Organization.members -> User many
relation Ticket.tags -> Tag many
```

### Generated Columns

Relations create foreign key columns:
- `author -> User` creates `author_id uuid references users(id)`

---

## Rules

Rules define invariants and forbidden transitions. They cannot be bypassed.

```text
rule Entity.operation {
  forbid if condition
    emit MESSAGE_CODE

  require if condition
    emit MESSAGE_CODE
}
```

### Operations

- `create` - When creating new records
- `update` - When updating records
- `delete` - When deleting records

### Keywords

- `forbid if` - Reject when condition is true
- `require if` - Reject when condition is false
- `emit` - Return this message code on rejection

### Examples

```text
# Cannot update closed tickets
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

# Comments must have content
rule Comment.create {
  require if body length >= 1
    emit COMMENT_EMPTY
}

# Only author can delete
rule Comment.delete {
  forbid if author != user
    emit NOT_AUTHOR
}
```

### Expression Syntax

```text
# Comparison
field == value
field != value
field < value
field > value
field <= value
field >= value

# Logic
condition and condition
condition or condition
not condition

# Membership
user in collection

# Path traversal
entity.relation.field
```

---

## Access Control

Access rules define who can read/write entities. They compile to PostgreSQL Row Level Security (RLS) policies.

```text
access Entity {
  read: expression
  write: expression
}
```

### The `user` Variable

The special `user` variable refers to the authenticated user.

```text
access Task {
  read: user == owner
  write: user == owner
}
```

### Path Expressions

```text
access Ticket {
  # User must be in the ticket's organization's members
  read: user in org.members

  # User is author, assignee, or an agent
  write: user == author or user == assignee or user.role == agent
}
```

### Examples

```text
# Only admins can see all users
access User {
  read: user.role == admin or user.id == id
  write: user.role == admin or user.id == id
}

# Organization members can read, owner can write
access Organization {
  read: user in members or user == owner
  write: user == owner
}
```

---

## Actions

Actions are named, typed transactions. They replace controllers.

```text
action action_name {
  input: EntityType
}
```

### Example

```text
action create_ticket {
  input: Ticket
}

action close_ticket {
  input: Ticket
}

action assign_ticket {
  input: Ticket
}
```

### Generated Endpoints

Each action creates an API endpoint:
```
POST /api/actions/{action_name}
```

---

## Messages

Messages are structured outcomes for errors and notifications.

```text
message MESSAGE_CODE {
  level: error | warning | info
  default: "Human-readable message"
}
```

### Example

```text
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}

message TICKET_CREATED {
  level: info
  default: "Your ticket has been created."
}

message LOW_PRIORITY_WARNING {
  level: warning
  default: "Low priority tickets may take longer to resolve."
}
```

### Using Messages

Messages are returned in API responses:
```json
{
  "status": "error",
  "messages": [
    { "code": "TICKET_CLOSED", "message": "This ticket is already closed." }
  ]
}
```

---

## Hooks

Hooks trigger effects after actions complete.

```text
hook Entity.timing_operation {
  enqueue job_name
}
```

### Timing

- `before_create` - Before insert
- `after_create` - After insert
- `before_update` - Before update
- `after_update` - After update
- `before_delete` - Before delete
- `after_delete` - After delete

### Example

```text
hook Ticket.after_create {
  enqueue notify_agents
}

hook Comment.after_create {
  enqueue notify_ticket_participants
}
```

---

## Jobs

Jobs are background tasks that run after commit. They have limited capabilities.

```text
job job_name {
  input: EntityType
  needs: path [where condition]
  effect: capability.action
}
```

### Properties

- `input` - The entity that triggered the job
- `needs` - Data to pre-fetch (jobs have no query power)
- `effect` - The capability to use

### Capabilities

- `email.send` - Send emails
- `http.call` - Make HTTP requests
- `file.write` - Write files

### Example

```text
job notify_agents {
  input: Ticket
  needs: Ticket.org.members where role == agent
  effect: email.send
}

job sync_to_crm {
  input: User
  needs: User
  effect: http.call
}
```

---

## Views

Views define frontend projections. They are queryable and subscribable.

```text
view ViewName {
  source: Entity
  fields: field1, field2, relation.field
}
```

### Example

```text
view TicketList {
  source: Ticket
  fields: subject, status, priority, author.name
}

view TicketDetail {
  source: Ticket
  fields: subject, description, status, author, comments
}
```

### Generated Endpoints

```
GET /api/views/{view_name}
WebSocket /ws (subscribe to view)
```

---

## Tests

Tests define invariants that must hold.

```text
test Entity.operation {
  given field = value
  when operation Entity
  expect result
}
```

### Expectations

- `expect Entity.field = value` - Field has expected value
- `expect reject MESSAGE_CODE` - Operation rejected with message

### Example

```text
test Ticket.update {
  given status = closed
  when update Ticket
  expect reject TICKET_CLOSED
}

test Ticket.update {
  given status = open
  when update Ticket
  expect Ticket.status = pending
}

test close_ticket {
  given Ticket.status = open
  when action close_ticket
  expect Ticket.status = closed
}
```

---

## Migrations

Define how to migrate data between schema versions.

```text
migrate Entity.version {
  from: old_type
  to: new_type

  map:
    old_value -> new_value
}
```

### Example

```text
migrate Subscription.v2 {
  from: plan enum(free, pro)
  to: tier enum(free, starter, pro, enterprise)

  map:
    free -> free
    pro -> starter
}
```

---

## Webhooks

Webhooks receive events from external services and route them to actions. Providers handle data normalization automatically - no field mappings needed.

```text
webhook webhook_name {
  provider: provider_name
  events: [event.type1, event.type2]
  triggers: action_name
}
```

### Properties

- `provider` - The provider that handles signature validation and data normalization (required)
- `events` - List of event types to accept (required)
- `triggers` - The action to trigger with normalized data (required)

### Providers

| Provider | Description | Data Normalization |
|----------|-------------|-------------------|
| `generic` | HMAC-SHA256 signature validation | Converts all keys to snake_case |
| `stripe` | Stripe webhook signatures | Flattens `data.object.*` to top level |
| `twilio` | Twilio request validation | Converts `Body`→`body`, `From`→`from`, etc. |

### Provider-Owned Normalization

Each provider normalizes external data formats to FORGE conventions (snake_case). You don't write field mappings - the provider handles this.

| Provider | External Format | Normalized |
|----------|----------------|------------|
| Stripe | `data.object.amount` | `amount` |
| Twilio | `Body`, `From`, `To` | `body`, `from`, `to` |
| GitHub | `repository.full_name` | `repository_full_name` |
| Generic | camelCase/PascalCase | snake_case |

### Example

```text
# Receive Stripe payments - provider normalizes data
webhook stripe_payments {
  provider: stripe
  events: [payment_intent.succeeded, payment_intent.failed]
  triggers: handle_payment
}

action handle_payment {
  input {
    amount: int           # Provider extracts from data.object.amount
    currency: string      # Provider extracts from data.object.currency
    customer_id: string   # Provider extracts from data.object.customer
  }
  creates: Payment
}

# Receive Twilio SMS - provider normalizes field names
webhook twilio_sms {
  provider: twilio
  events: [message.received]
  triggers: receive_sms
}

action receive_sms {
  input {
    body: string    # Provider normalizes Twilio's "Body" → "body"
    from: string    # Provider normalizes Twilio's "From" → "from"
    to: string      # Provider normalizes Twilio's "To" → "to"
  }
  creates: InboundMessage
}

# Generic webhook with HMAC validation
webhook github_push {
  provider: generic
  events: [push]
  triggers: handle_push
}
```

### Generated Endpoints

Webhooks create POST endpoints:
```
POST /webhooks/{webhook_name}
```

### Webhook Flow

1. External service sends POST to `/webhooks/{name}`
2. Provider validates signature
3. Event type is checked against `events` list
4. Provider normalizes data to FORGE conventions (snake_case)
5. Action executes with normalized data (normal pipeline with rules/access)
6. 200 OK returned (or error)

---

## Imperative Code

Escape hatch for custom logic. Use sparingly.

```text
imperative function_name {
  input: EntityType
  returns: ReturnType
}
```

### Example

```text
imperative export_csv {
  input: Ticket
  returns: file
}

imperative calculate_metrics {
  input: Organization
  returns: MetricsResult
}
```

Imperative code:
- Cannot mutate state unless declared
- Runs in a capability sandbox
- Must be implemented in Go

---

## Reserved Words

The following are reserved and cannot be used as identifiers:

```
app, entity, relation, rule, access, action, message, job, hook, view,
webhook, provider, events, triggers,
imperative, migrate, test, forbid, require, if, emit, read, write,
before, after, create, update, delete, input, needs, effect, returns,
where, source, fields, given, when, expect, reject, from, to, map,
and, or, not, in, true, false, many, unique, length, default, enum,
string, int, float, bool, time, uuid, file
```
