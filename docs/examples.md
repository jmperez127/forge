# FORGE Examples

Real-world examples demonstrating FORGE patterns.

## Helpdesk Application

A complete ticket management system with organizations, users, and real-time updates.

### File Structure

```
projects/helpdesk/
├── app.forge
├── entities.forge
├── relations.forge
├── rules.forge
├── access.forge
├── actions.forge
├── messages.forge
├── hooks.forge
├── jobs.forge
├── views.forge
└── tests.forge
```

### app.forge

```text
app Helpdesk {
  auth: oauth
  database: postgres
  frontend: web
}
```

### entities.forge

```text
entity User {
  email: string unique
  name: string length <= 100
  role: enum(admin, agent, customer) = customer
  avatar_url: string
}

entity Organization {
  name: string length <= 100
  plan: enum(free, starter, pro, enterprise) = free
  domain: string unique
}

entity Ticket {
  subject: string length <= 120
  description: string
  status: enum(open, pending, resolved, closed) = open
  priority: enum(low, medium, high, urgent) = medium
}

entity Comment {
  body: string length >= 1
  internal: bool = false
}

entity Tag {
  name: string unique
  color: string = "#gray"
}
```

### relations.forge

```text
relation Organization.owner -> User
relation Organization.members -> User many

relation Ticket.author -> User
relation Ticket.assignee -> User
relation Ticket.org -> Organization
relation Ticket.tags -> Tag many

relation Comment.author -> User
relation Comment.ticket -> Ticket
```

### rules.forge

```text
# Cannot update closed tickets
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

# Cannot delete tickets with comments
rule Ticket.delete {
  forbid if comments count > 0
    emit TICKET_HAS_COMMENTS
}

# Comments must have content
rule Comment.create {
  require if body length >= 1
    emit COMMENT_EMPTY
}

# Only agents can post internal comments
rule Comment.create {
  forbid if internal == true and user.role != agent
    emit INTERNAL_COMMENT_FORBIDDEN
}
```

### access.forge

```text
access User {
  read: user.role == admin or user.id == id
  write: user.role == admin or user.id == id
}

access Organization {
  read: user in members or user == owner
  write: user == owner or user.role == admin
}

access Ticket {
  read: user in org.members
  write: user == author or user == assignee or user.role == agent
}

access Comment {
  read: user in ticket.org.members and (internal == false or user.role == agent)
  write: user == author or user.role == agent
}

access Tag {
  read: true
  write: user.role == admin or user.role == agent
}
```

### actions.forge

```text
action create_ticket {
  input: Ticket
}

action assign_ticket {
  input: Ticket
}

action close_ticket {
  input: Ticket
}

action reopen_ticket {
  input: Ticket
}

action add_comment {
  input: Comment
}

action add_tag {
  input: Ticket
}
```

### messages.forge

```text
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}

message TICKET_HAS_COMMENTS {
  level: error
  default: "Cannot delete a ticket that has comments."
}

message COMMENT_EMPTY {
  level: error
  default: "Comment cannot be empty."
}

message INTERNAL_COMMENT_FORBIDDEN {
  level: error
  default: "Only agents can post internal comments."
}

message TICKET_CREATED {
  level: info
  default: "Your ticket has been created. We'll respond soon."
}

message TICKET_ASSIGNED {
  level: info
  default: "Ticket has been assigned."
}

message TICKET_RESOLVED {
  level: info
  default: "Ticket has been resolved."
}
```

### hooks.forge

```text
hook Ticket.after_create {
  enqueue notify_agents
  enqueue send_confirmation
}

hook Ticket.after_update {
  enqueue notify_ticket_update
}

hook Comment.after_create {
  enqueue notify_comment
}
```

### jobs.forge

```text
job notify_agents {
  input: Ticket
  needs: Ticket.org.members where role == agent
  effect: email.send
}

job send_confirmation {
  input: Ticket
  needs: Ticket.author
  effect: email.send
}

job notify_ticket_update {
  input: Ticket
  needs: Ticket.author, Ticket.assignee
  effect: email.send
}

job notify_comment {
  input: Comment
  needs: Comment.ticket.author, Comment.ticket.assignee
  effect: email.send
}
```

### views.forge

```text
view TicketList {
  source: Ticket
  fields: subject, status, priority, author.name, assignee.name, created_at
}

view TicketDetail {
  source: Ticket
  fields: subject, description, status, priority, author, assignee, tags, comments, created_at, updated_at
}

view MyTickets {
  source: Ticket
  fields: subject, status, priority, created_at
}

view AgentQueue {
  source: Ticket
  fields: subject, status, priority, author.name, org.name, created_at
}

view OrganizationList {
  source: Organization
  fields: name, plan, members
}

view UserList {
  source: User
  fields: email, name, role
}

view TagList {
  source: Tag
  fields: name, color
}
```

### tests.forge

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

test reopen_ticket {
  given Ticket.status = closed
  when action reopen_ticket
  expect Ticket.status = open
}

test Comment.create {
  given body = ""
  when create Comment
  expect reject COMMENT_EMPTY
}
```

### Frontend (React + shadcn/ui)

The helpdesk frontend uses React with shadcn/ui components, Tailwind CSS, and Lucide icons for a modern, polished UI.

**Tech Stack:**
- React 18 + TypeScript
- shadcn/ui (Radix UI primitives + Tailwind)
- Lucide React icons
- React Router DOM
- Vite

```tsx
// App.tsx
import { ForgeProvider } from '@forge/react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Inbox, Plus } from 'lucide-react';

const forgeConfig = {
  url: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  token: import.meta.env.VITE_API_TOKEN,
};

export default function App() {
  return (
    <ForgeProvider config={forgeConfig}>
      <BrowserRouter>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50">
          <header className="sticky top-0 border-b bg-white/80 backdrop-blur-lg">
            <nav className="mx-auto max-w-6xl flex items-center gap-8 px-4 h-16">
              <Link to="/" className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-violet-600">Helpdesk</span>
              </Link>
              <Button variant="ghost" asChild><Link to="/"><Inbox className="h-4 w-4 mr-2" />Tickets</Link></Button>
              <Button variant="ghost" asChild><Link to="/new"><Plus className="h-4 w-4 mr-2" />New Ticket</Link></Button>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">
            <Routes>
              <Route path="/" element={<TicketList />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/new" element={<NewTicket />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ForgeProvider>
  );
}
```

```tsx
// pages/TicketList.tsx
import { useList } from '@forge/react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Clock, User, ChevronRight, Flame, AlertTriangle } from 'lucide-react';

export function TicketList() {
  const { data: tickets, loading, error } = useList<Ticket>('TicketList');

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorCard message="Failed to load tickets" />;
  if (!tickets?.length) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Tickets</h1>
          <p className="text-muted-foreground">{tickets.length} tickets in queue</p>
        </div>
        <Link to="/new">
          <Button className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600">
            <Plus className="h-4 w-4" /> New Ticket
          </Button>
        </Link>
      </div>

      <div className="grid gap-3">
        {tickets.map((ticket) => (
          <Link key={ticket.id} to={`/tickets/${ticket.id}`}>
            <Card className="group hover:shadow-md hover:border-violet-200 transition-all">
              <CardContent className="flex items-center gap-4 p-4">
                <PriorityIcon priority={ticket.priority} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate group-hover:text-violet-700">
                    {ticket.subject}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span><User className="h-3.5 w-3.5 inline" /> {ticket.author?.name}</span>
                    <span><Clock className="h-3.5 w-3.5 inline" /> {formatDate(ticket.created_at)}</span>
                  </div>
                </div>
                <Badge variant={getStatusVariant(ticket.status)}>{ticket.status}</Badge>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// pages/TicketDetail.tsx
import { useParams, Link } from 'react-router-dom';
import { useEntity, useList, useAction } from '@forge/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ticket, loading } = useEntity<Ticket>('Ticket', id!);
  const { data: comments } = useList<Comment>('CommentThread');
  const closeTicket = useAction('close_ticket');
  const addComment = useAction('add_comment');

  if (loading) return <LoadingSpinner />;
  if (!ticket) return <NotFound />;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <p className="text-muted-foreground">Created by {ticket.author?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(ticket.status)}>{ticket.status}</Badge>
          {ticket.status !== 'closed' && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Close Ticket</Button>
              </DialogTrigger>
              <DialogContent>
                <p>Are you sure you want to close this ticket?</p>
                <Button onClick={() => closeTicket.execute({ ticket: ticket.id })}>
                  Confirm
                </Button>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Description</CardTitle></CardHeader>
        <CardContent><p>{ticket.description}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Comments ({comments?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          {comments?.map(comment => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
          {ticket.status !== 'closed' && (
            <CommentForm onSubmit={(body, internal) =>
              addComment.execute({ ticket: ticket.id, body, internal })
            } />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Blog Platform

A multi-author blog with posts, comments, and categories.

### entities.forge

```text
entity Author {
  email: string unique
  name: string length <= 100
  bio: string
  avatar_url: string
}

entity Post {
  title: string length <= 200
  slug: string unique
  content: string
  excerpt: string length <= 500
  status: enum(draft, published, archived) = draft
  published_at: time
}

entity Comment {
  content: string length >= 1
  author_name: string
  author_email: string
  approved: bool = false
}

entity Category {
  name: string unique
  slug: string unique
  description: string
}
```

### relations.forge

```text
relation Post.author -> Author
relation Post.categories -> Category many

relation Comment.post -> Post
```

### rules.forge

```text
# Only published posts can have comments
rule Comment.create {
  forbid if post.status != published
    emit POST_NOT_PUBLISHED
}

# Cannot edit published posts (must create new version)
rule Post.update {
  forbid if status == published and status changed
    emit CANNOT_UNPUBLISH
}
```

### access.forge

```text
access Author {
  read: true
  write: user.id == id
}

access Post {
  read: status == published or user.id == author.id
  write: user.id == author.id
}

access Comment {
  read: post.status == published and approved == true
  write: user.id == post.author.id
}

access Category {
  read: true
  write: user.role == admin
}
```

### views.forge

```text
view PublishedPosts {
  source: Post
  fields: title, slug, excerpt, author.name, categories, published_at
}

view PostDetail {
  source: Post
  fields: title, slug, content, author, categories, comments, published_at
}

view DraftPosts {
  source: Post
  fields: title, status, created_at, updated_at
}

view CategoryList {
  source: Category
  fields: name, slug, description
}
```

---

## E-Commerce Store

Product catalog with orders and inventory.

### entities.forge

```text
entity Product {
  name: string length <= 200
  slug: string unique
  description: string
  price: int
  inventory: int = 0
  status: enum(draft, active, discontinued) = draft
}

entity Order {
  status: enum(pending, paid, shipped, delivered, cancelled) = pending
  total: int
  shipping_address: string
}

entity OrderItem {
  quantity: int
  unit_price: int
}

entity Customer {
  email: string unique
  name: string
  phone: string
}
```

### relations.forge

```text
relation Order.customer -> Customer
relation Order.items -> OrderItem many

relation OrderItem.order -> Order
relation OrderItem.product -> Product
```

### rules.forge

```text
# Cannot order more than available inventory
rule OrderItem.create {
  forbid if quantity > product.inventory
    emit INSUFFICIENT_INVENTORY
}

# Cannot cancel shipped orders
rule Order.update {
  forbid if status == shipped and status changed to cancelled
    emit CANNOT_CANCEL_SHIPPED
}

# Cannot modify completed orders
rule Order.update {
  forbid if status == delivered
    emit ORDER_COMPLETED
}
```

### hooks.forge

```text
hook Order.after_create {
  enqueue send_order_confirmation
  enqueue reserve_inventory
}

hook Order.after_update {
  enqueue notify_order_status
}
```

### jobs.forge

```text
job send_order_confirmation {
  input: Order
  needs: Order.customer, Order.items
  effect: email.send
}

job reserve_inventory {
  input: Order
  needs: Order.items.product
  effect: http.call
}

job notify_order_status {
  input: Order
  needs: Order.customer
  effect: email.send
}
```

---

## Task Management

Kanban-style task board with projects and teams.

### entities.forge

```text
entity Team {
  name: string length <= 100
}

entity Project {
  name: string length <= 100
  description: string
  status: enum(active, archived) = active
}

entity Column {
  name: string length <= 50
  position: int
}

entity Task {
  title: string length <= 200
  description: string
  position: int
  due_date: time
}

entity User {
  email: string unique
  name: string
  avatar_url: string
}
```

### relations.forge

```text
relation Team.members -> User many
relation Team.projects -> Project many

relation Project.team -> Team
relation Project.columns -> Column many

relation Column.project -> Project
relation Column.tasks -> Task many

relation Task.column -> Column
relation Task.assignee -> User
relation Task.created_by -> User
```

### access.forge

```text
access Team {
  read: user in members
  write: user in members
}

access Project {
  read: user in team.members
  write: user in team.members and status == active
}

access Column {
  read: user in project.team.members
  write: user in project.team.members
}

access Task {
  read: user in column.project.team.members
  write: user in column.project.team.members
}
```

### views.forge

```text
view ProjectBoard {
  source: Project
  fields: name, columns.name, columns.tasks
}

view TaskList {
  source: Task
  fields: title, column.name, assignee.name, due_date
}

view TeamMembers {
  source: Team
  fields: name, members
}
```

---

## Common Patterns

### Soft Delete

```text
entity Post {
  title: string
  deleted_at: time
}

# Access rule filters out deleted
access Post {
  read: deleted_at == null
  write: deleted_at == null
}

action delete_post {
  input: Post
  # Sets deleted_at instead of actual delete
}
```

### Audit Trail

```text
entity AuditLog {
  entity_type: string
  entity_id: uuid
  action: enum(create, update, delete)
  changes: string
  performed_by: uuid
  performed_at: time
}

relation AuditLog.user -> User

hook Ticket.after_create {
  enqueue log_audit
}

hook Ticket.after_update {
  enqueue log_audit
}
```

### Status Machine

```text
entity Ticket {
  status: enum(draft, submitted, in_review, approved, rejected) = draft
}

rule Ticket.update {
  # draft -> submitted only
  forbid if status == draft and status changed and status != submitted
    emit INVALID_TRANSITION

  # submitted -> in_review only
  forbid if status == submitted and status changed and status != in_review
    emit INVALID_TRANSITION

  # in_review -> approved or rejected only
  forbid if status == in_review and status changed and status != approved and status != rejected
    emit INVALID_TRANSITION

  # No changes from terminal states
  forbid if status == approved or status == rejected
    emit TICKET_FINALIZED
}
```

### Multi-Tenancy

```text
entity Tenant {
  name: string
  subdomain: string unique
}

entity User {
  email: string
}

relation User.tenant -> Tenant

# All entities belong to a tenant
entity Project {
  name: string
}

relation Project.tenant -> Tenant

# Access scoped to tenant
access Project {
  read: user.tenant == tenant
  write: user.tenant == tenant
}
```

### Invitation System

```text
entity Invitation {
  email: string
  token: string unique
  status: enum(pending, accepted, expired) = pending
  expires_at: time
}

relation Invitation.organization -> Organization
relation Invitation.invited_by -> User

rule Invitation.update {
  forbid if status != pending
    emit INVITATION_NOT_PENDING

  forbid if expires_at < now
    emit INVITATION_EXPIRED
}

action accept_invitation {
  input: Invitation
}

hook Invitation.after_create {
  enqueue send_invitation_email
}
```

---

## Running Examples

### Build and Run Helpdesk

```bash
cd projects/helpdesk

# Build
forge build

# Create database
createdb helpdesk_dev

# Apply schema
psql helpdesk_dev -f .forge-runtime/schema.sql

# Start server
DATABASE_URL="postgres://localhost/helpdesk_dev" forge run
```

### Test with cURL

```bash
# Create organization
curl -X POST http://localhost:8080/api/entities/Organization \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp"}'

# Create user
curl -X POST http://localhost:8080/api/entities/User \
  -H "Content-Type: application/json" \
  -d '{"email": "agent@acme.com", "name": "Agent", "role": "agent"}'

# Create ticket
curl -X POST http://localhost:8080/api/actions/create_ticket \
  -H "Content-Type: application/json" \
  -d '{"subject": "Help needed", "description": "Something is broken"}'

# List tickets
curl http://localhost:8080/api/views/TicketList
```
