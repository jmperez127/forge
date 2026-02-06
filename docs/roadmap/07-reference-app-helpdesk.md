# 07 -- Reference Application: ForgeDesk Helpdesk

**Status:** Planning
**Priority:** Critical Path
**Owner:** TBD
**Depends on:** Compiler pipeline (done), Runtime server (partial), SDK (partial)

---

## 1. Current State

The helpdesk project at `projects/helpdesk/` exists but is incomplete. Here is what we have and what is missing.

### What Exists

**FORGE specification (11 .forge files):**

| File | Status | Notes |
|------|--------|-------|
| `app.forge` | Exists, needs change | Uses `auth: oauth` -- should be `auth: password` per CLAUDE.md rules |
| `entities.forge` | Solid | User, Organization, Ticket, Comment, Tag with correct field types and defaults |
| `relations.forge` | Solid | Author, assignee, org, comment-ticket, tags (many-to-many) |
| `rules.forge` | Partial | Has closed-ticket guard and comment rules, but missing assignment and transition rules |
| `access.forge` | Solid foundation | Read/write for User, Organization, Ticket, Comment |
| `actions.forge` | Skeleton only | 6 actions declared but missing transition logic |
| `messages.forge` | Partial | 7 messages, missing several needed for new rules |
| `hooks.forge` | Reasonable | 3 hooks for post-create and post-update |
| `jobs.forge` | Reasonable | 3 jobs for notifications |
| `views.forge` | Good coverage | 7 views covering lists, details, dashboard, profile |
| `tests.forge` | Good start | 12 tests covering status rules, defaults, and action outcomes |

**Frontend (`web/` directory):**

| Component | Status | Notes |
|-----------|--------|-------|
| Vite + React + Tailwind | Configured | Working build toolchain, path aliases, CSS variables |
| `App.tsx` | Exists | Layout with header/footer, routing for 3 pages, hardcoded dev token |
| `TicketList.tsx` | Exists | Uses `useList`, loading/empty/error states, good UI |
| `TicketDetail.tsx` | Exists | Uses `useEntity`, `useList`, `useAction` for close and comment |
| `NewTicket.tsx` | Exists | Form with subject/description/priority, uses `useAction` |
| UI Components | 11 components | button, card, input, textarea, label, badge, select, checkbox, avatar, separator, dialog |
| Authentication | **Missing** | No login/register pages, hardcoded dev token, no auth flow |
| Assignment UI | **Missing** | No agent picker, no assign action in UI |
| Dashboard | **Missing** | No metrics, no org-level view |
| Real-time | **Not wired** | No WebSocket subscriptions active in list views |

**E2E tests (`e2e/`):**

| Suite | Status | Notes |
|-------|--------|-------|
| `smoke.spec.ts` | 4 tests | Frontend loads, health endpoint, API, debug artifact |
| `helpdesk.spec.ts` | 17 tests (2 skipped) | List, create, detail, comment, close, navigation, responsive |
| Fixtures | `auth.ts`, `db.ts` | 3 test users (admin, agent, customer), API-based data creation |

### What Is Missing

1. **No authentication flow.** The app uses a hardcoded base64 token. No login, register, or logout pages. The chat project has a complete auth flow as reference.
2. **Actions have no transition logic.** `close_ticket` is declared but does not express that it sets `status = closed`.
3. **No assignment workflow.** No UI to select an agent, no rule preventing assignment to non-agents.
4. **No status transition rules.** No guards beyond the closed-ticket rule.
5. **No real-time updates.** The frontend fetches data on mount but does not subscribe to WebSocket.
6. **No dashboard.** The `AgentDashboard` view is defined but never rendered.
7. **E2E tests have skipped cases.** Real-time and access control tests are `test.skip`.
8. **No README.** No quickstart documentation.

---

## 2. Target State

ForgeDesk is the "TodoMVC" of FORGE. When complete, it must:

- **Run in 2 minutes** from a fresh clone with zero external dependencies
- **Demonstrate every FORGE construct** (entities, relations, rules, access, actions, messages, hooks, jobs, views, tests)
- **Feel like a real product** -- not a demo, not a toy
- **Show real-time behavior** -- open two browsers, see changes propagate instantly
- **Show rule enforcement** -- try to break invariants, see structured error messages
- **Work on mobile** -- responsive layout that functions on 375px viewports

### User Stories

**As a Customer:**
1. I register with email and password
2. I log in and see my tickets
3. I create a new ticket with subject, description, and priority
4. I see the ticket appear in my list in real-time (no refresh)
5. I open a ticket and read the conversation thread
6. I add a comment to my ticket
7. I see agent replies appear in real-time
8. I cannot see internal agent notes
9. I try to update a closed ticket and see a clear error message
10. I log out

**As an Agent:**
1. I log in and see all tickets in my organization
2. I see a dashboard with open/pending/resolved/closed counts
3. I click a ticket to see full details
4. I assign a ticket to myself or another agent
5. I add a public reply that the customer sees in real-time
6. I add an internal note that only agents can see
7. I change ticket priority (escalate)
8. I close a resolved ticket
9. I reopen a closed ticket
10. I filter tickets by status and priority

**As an Admin:**
1. I see all tickets across the organization
2. I see the organization dashboard with aggregate metrics
3. I manage organization members
4. I can do everything an agent can do

**As a Developer (the primary audience):**
1. I clone the repo and run `forge dev` in the helpdesk directory
2. The app starts with zero configuration -- embedded PostgreSQL, auto-migration, seeded data
3. I open `http://localhost:3000` and see a login screen
4. I register, create a ticket, see it appear -- all working
5. I open the `.forge` files and understand the entire application in 5 minutes
6. I modify a rule, save, and see the behavior change on hot reload
7. I am convinced FORGE eliminates 50% of the code I normally write

---

## 3. App Specification

### 3.1 app.forge

```text
app Helpdesk {
  auth: password
  database: postgres
}
```

Change from `oauth` to `password`. This gives us built-in email/password registration and login endpoints (`/auth/register`, `/auth/login`) without any external OAuth provider setup. Zero-config.

### 3.2 entities.forge

No changes to entity shapes. The existing definitions are correct. User, Organization, Ticket, Comment, and Tag are well-defined with appropriate field types, constraints, and defaults.

### 3.3 relations.forge

No changes. The relation graph (Organization.members, Organization.owner, Ticket.org, Ticket.author, Ticket.assignee, Comment.ticket, Comment.author, Ticket.tags) is correct and complete.

### 3.4 rules.forge

```text
# Cannot modify a closed ticket (must reopen first)
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

# Can only delete closed tickets
rule Ticket.delete {
  forbid if status != closed
    emit TICKET_NOT_CLOSED
}

# Can only assign to agents or admins
rule assign_ticket {
  forbid if assignee.role == customer
    emit ASSIGNEE_NOT_AGENT
}

# Cannot close an already-closed ticket
rule close_ticket {
  forbid if status == closed
    emit TICKET_ALREADY_CLOSED
}

# Can only reopen closed tickets
rule reopen_ticket {
  forbid if status != closed
    emit TICKET_NOT_CLOSED_REOPEN
}

# Comment body must not be empty
rule Comment.create {
  require if body length >= 1
    emit COMMENT_EMPTY
}

# Only the author can edit their own comments
rule Comment.update {
  forbid if author != user
    emit NOT_AUTHOR
}
```

**Changes from current:**
- Added `assign_ticket` rule: agents/admins only
- Added `close_ticket` rule: prevent double-close
- Added `reopen_ticket` rule: only closed tickets can be reopened

### 3.5 access.forge

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
  write: user == author or user == assignee or user.role == agent or user.role == admin
}

access Comment {
  read: (internal == false and user in ticket.org.members) or
        (internal == true and (user.role == agent or user.role == admin))
  write: user == author or user.role == agent or user.role == admin
}
```

**Key change:** Comment read rule now filters internal comments. Customers cannot see internal notes. This is the critical access-control-visible-to-user demonstration.

### 3.6 actions.forge

```text
action create_ticket {
  input: Ticket
  creates: Ticket
}

action update_ticket {
  input: Ticket
  updates: Ticket
}

action close_ticket {
  input: Ticket
  updates: Ticket
}

action reopen_ticket {
  input: Ticket
  updates: Ticket
}

action assign_ticket {
  input: Ticket
  updates: Ticket
}

action escalate_ticket {
  input: Ticket
  updates: Ticket
}

action add_comment {
  input: Comment
  creates: Comment
}

action update_comment {
  input: Comment
  updates: Comment
}
```

**Changes:** Added `update_ticket` and `update_comment`.

### 3.7 messages.forge

```text
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed and cannot be modified."
}

message TICKET_NOT_CLOSED {
  level: error
  default: "Only closed tickets can be deleted."
}

message TICKET_ALREADY_CLOSED {
  level: error
  default: "This ticket is already closed."
}

message TICKET_NOT_CLOSED_REOPEN {
  level: error
  default: "Only closed tickets can be reopened."
}

message ASSIGNEE_NOT_AGENT {
  level: error
  default: "Tickets can only be assigned to agents or admins."
}

message COMMENT_EMPTY {
  level: error
  default: "Comment body cannot be empty."
}

message NOT_AUTHOR {
  level: error
  default: "Only the author can edit this comment."
}

message TICKET_CREATED {
  level: info
  default: "Your ticket has been created successfully."
}

message TICKET_ASSIGNED {
  level: info
  default: "The ticket has been assigned."
}

message TICKET_ESCALATED {
  level: warning
  default: "This ticket has been escalated to priority urgent."
}

message TICKET_REOPENED {
  level: info
  default: "The ticket has been reopened."
}

message TICKET_CLOSED_SUCCESS {
  level: info
  default: "The ticket has been closed."
}
```

**Added:** TICKET_ALREADY_CLOSED, TICKET_NOT_CLOSED_REOPEN, ASSIGNEE_NOT_AGENT, TICKET_REOPENED, TICKET_CLOSED_SUCCESS.

### 3.8 views.forge

```text
view TicketList {
  source: Ticket
  fields: subject, status, priority, author.name, assignee.name, created_at
}

view TicketDetail {
  source: Ticket
  fields: subject, description, status, priority, author, assignee, tags, created_at, updated_at
}

view MyTickets {
  source: Ticket
  fields: subject, status, priority, created_at
  filter: author == user
}

view AssignedToMe {
  source: Ticket
  fields: subject, status, priority, author.name, created_at
  filter: assignee == user
}

view OrganizationTickets {
  source: Ticket
  fields: subject, status, priority, created_at
}

view AgentDashboard {
  source: Ticket
  fields: subject, status, priority, org.name, author.name, assignee.name
}

view CommentThread {
  source: Comment
  fields: body, author.name, author.role, internal, created_at
  filter: ticket == param.ticket_id
}

view UserProfile {
  source: User
  fields: email, name, role, avatar_url
}

view OrganizationMembers {
  source: User
  fields: email, name, role
  filter: user in org.members
}
```

**Added:** MyTickets (author == user), AssignedToMe (assignee == user), author.role in CommentThread, parameterized filter on CommentThread.

### 3.9 tests.forge (additions)

```text
test assign_ticket {
  given assignee.role = customer
  when action assign_ticket
  expect reject ASSIGNEE_NOT_AGENT
}

test assign_ticket {
  given assignee.role = agent
  when action assign_ticket
  expect Ticket.assignee = assignee
}

test close_ticket {
  given Ticket.status = closed
  when action close_ticket
  expect reject TICKET_ALREADY_CLOSED
}

test reopen_ticket {
  given Ticket.status = open
  when action reopen_ticket
  expect reject TICKET_NOT_CLOSED_REOPEN
}

test reopen_ticket {
  given Ticket.status = closed
  when action reopen_ticket
  expect Ticket.status = open
}

test Comment.read {
  given internal = true
  given user.role = customer
  when read Comment
  expect deny
}

test Comment.read {
  given internal = true
  given user.role = agent
  when read Comment
  expect allow
}
```

---

## 4. Frontend Design

### 4.1 Page Structure

```
/login              -> LoginPage
/register           -> RegisterPage
/                   -> TicketListPage (default, requires auth)
/tickets/:id        -> TicketDetailPage (requires auth)
/new                -> NewTicketPage (requires auth)
/dashboard          -> DashboardPage (agents/admins only)
/settings           -> UserSettingsPage (requires auth)
```

### 4.2 Component Hierarchy

```
App
 +-- ForgeProvider (config, auth)
 +-- BrowserRouter
      +-- AuthGuard
      |    +-- Layout
      |         +-- Header
      |         |    +-- Logo ("ForgeDesk")
      |         |    +-- NavLinks (Tickets, Dashboard, New Ticket)
      |         |    +-- UserMenu (avatar, name, role badge, logout)
      |         |    +-- ConnectionStatus (green dot / reconnecting)
      |         +-- Main
      |         |    +-- <Route /> (page content)
      |         +-- Footer ("Built with FORGE")
      |
      +-- LoginPage
      |    +-- LoginForm (email, password, submit, link to register)
      |
      +-- RegisterPage
           +-- RegisterForm (name, email, password, role select, submit)

--- Pages inside AuthGuard ---

TicketListPage
 +-- StatsBar (open count, pending, in_progress, resolved, closed)
 +-- FilterBar (status dropdown, priority dropdown, "My Tickets" toggle, "Assigned to Me" toggle)
 +-- TicketCard[] (priority icon, subject, author, assignee avatar, status badge, time ago)
 +-- EmptyState (when no tickets match filters)
 +-- FAB (mobile: floating "+" button)

TicketDetailPage
 +-- TicketHeader (subject, status badge, priority, back button)
 +-- TicketBody (description)
 +-- ActionBar (Assign, Escalate, Close/Reopen buttons)
 +-- Sidebar (priority, assignee, reporter, tags, timestamps)
 +-- CommentThread
 |    +-- CommentCard[] (avatar, author, time, body, internal badge)
 |    +-- CommentForm (textarea, internal checkbox, post button)
 |    +-- ClosedBanner (when ticket is closed)
 +-- ErrorToast (rule violation messages)

NewTicketPage
 +-- TicketForm (subject with counter, description, priority select)
 +-- SubmitButton (loading state)
 +-- ErrorDisplay (structured error messages)

DashboardPage
 +-- MetricsGrid (4 cards: Open, In Progress, Pending, Resolved)
 +-- TicketsByPriority (breakdown)
 +-- RecentActivity (latest ticket updates)
 +-- UnassignedTickets (tickets needing attention)
```

### 4.3 SDK Usage Patterns

The helpdesk frontend uses two layers:

**Layer 1: Generic `@forge/react` hooks** (from the published SDK)

```tsx
const { data: tickets, loading, error } = useList<Ticket>("TicketList");
const { data: ticket } = useEntity<Ticket>("Ticket", id);
const closeTicket = useAction("close_ticket");
await closeTicket.execute({ id: ticketId });
```

**Layer 2: App-specific client** (following the chat project pattern)

A local `lib/forge/client.ts` and `lib/forge/react.tsx` that wraps the generic SDK with typed methods for auth, actions, and views. This provides:
- `useAuth()` hook with login/register/logout
- Typed action methods (createTicket, closeTicket, assignTicket, etc.)
- WebSocket subscription management with reconnect logic

### 4.4 Styling Approach

- **Tailwind CSS** with the existing shadcn/ui component library
- **CSS variables** for theming (violet/purple primary palette already defined)
- **Responsive breakpoints**: mobile-first, `sm:` for tablet, `lg:` for desktop
- **No additional CSS frameworks** -- everything through Tailwind utility classes
- **Dark mode ready** -- CSS variables already defined for `.dark` class

### 4.5 Real-time Updates

Every list view subscribes to WebSocket updates:

```tsx
useEffect(() => {
  const unsubscribe = client.subscribe<Ticket>("TicketList", {
    onData: (data) => setTickets(data),
  });
  return unsubscribe;
}, [client]);
```

Demonstrated in:
1. **Ticket list**: new tickets appear without refresh
2. **Ticket detail**: status changes, assignee changes appear live
3. **Comment thread**: new comments appear as they are posted
4. **Dashboard counters**: metrics update as tickets change state

### 4.6 Error Handling and Toasts

Rule violations surfaced via structured `ForgeError` messages:

```tsx
try {
  await closeTicket.execute({ id: ticketId });
  toast.success("Ticket closed");
} catch (err) {
  const messages = (err as ForgeError).messages;
  messages.forEach(msg => toast.error(msg.message || msg.code));
}
```

Toast types: rule violation errors (red), success confirmations (green), warnings like escalation (amber).

---

## 5. Implementation Plan

### Phase 1: Specification Hardening (Day 1)

- [ ] **1.1** Change `app.forge` from `auth: oauth` to `auth: password`
- [ ] **1.2** Add missing rules to `rules.forge` (assignment, close guard, reopen guard)
- [ ] **1.3** Add missing messages to `messages.forge` (5 new messages)
- [ ] **1.4** Add filtered views to `views.forge` (MyTickets, AssignedToMe, parameterized CommentThread)
- [ ] **1.5** Add new actions to `actions.forge` (update_ticket, update_comment)
- [ ] **1.6** Update access rules for internal comment filtering in `access.forge`
- [ ] **1.7** Add new tests to `tests.forge` (assignment, transition, access control)
- [ ] **1.8** Run `forge check` -- all files must pass validation
- [ ] **1.9** Run `forge build` -- artifact must generate successfully
- [ ] **1.10** Run `forge test` -- all invariant tests must pass

**Verification:** `forge check && forge build && forge test` exits 0.

### Phase 2: Authentication Flow (Day 1-2)

- [ ] **2.1** Create `lib/forge/client.ts` -- typed client with auth methods following chat project pattern
- [ ] **2.2** Create `lib/forge/react.tsx` -- ForgeProvider with AuthContext, useAuth hook
- [ ] **2.3** Create `pages/Login.tsx` -- email/password form, error display, link to register
- [ ] **2.4** Create `pages/Register.tsx` -- name/email/password/role form, link to login
- [ ] **2.5** Create `components/AuthGuard.tsx` -- redirect to /login if not authenticated
- [ ] **2.6** Update `App.tsx` -- remove hardcoded token, add AuthGuard, add login/register routes
- [ ] **2.7** Add `UserMenu` component to header -- avatar, name, role badge, logout button
- [ ] **2.8** Test: register new user, login, see ticket list, logout, redirect to login

**Verification:** Can register, login, navigate, and logout. Token persists across page refresh. Expired token redirects to login.

### Phase 3: Ticket List with Real-time (Day 2-3)

- [ ] **3.1** Add `ConnectionStatus` component -- shows WebSocket connection state
- [ ] **3.2** Add stats bar above ticket list -- counts by status
- [ ] **3.3** Add filter bar -- status dropdown, priority dropdown, "My Tickets" toggle
- [ ] **3.4** Wire `useList` to WebSocket subscription for live updates
- [ ] **3.5** Add mobile-responsive floating action button for ticket creation
- [ ] **3.6** Test: open two browsers, create ticket in one, see it appear in the other

**Verification:** Ticket list loads, filters work, real-time updates propagate across browser tabs.

### Phase 4: Ticket Creation (Day 3)

- [ ] **4.1** Update `NewTicket.tsx` to use typed client action
- [ ] **4.2** Add toast notification on success (TICKET_CREATED message)
- [ ] **4.3** Add error display for rule violations
- [ ] **4.4** Verify auto-population of `author_id` from authenticated user
- [ ] **4.5** Test: create ticket, see it in list, verify defaults (status=open, priority=medium)

**Verification:** Ticket created via action endpoint, author set from JWT, defaults applied, success toast shown.

### Phase 5: Ticket Detail with Comments (Day 3-4)

- [ ] **5.1** Update `TicketDetail.tsx` to use typed client
- [ ] **5.2** Wire comment thread to parameterized `CommentThread` view
- [ ] **5.3** Subscribe comment thread to WebSocket for live comment updates
- [ ] **5.4** Show `author.role` on comments (agent badge, customer badge)
- [ ] **5.5** Style internal comments with amber background and "Internal" badge
- [ ] **5.6** Verify: customers cannot see internal comments (access rule enforcement)
- [ ] **5.7** Show comment count in header
- [ ] **5.8** Add confirmation dialog for close action (already partially exists)
- [ ] **5.9** Test: add comment, see it appear live in second browser, verify internal note visibility

**Verification:** Comments load, post, appear in real-time. Internal notes hidden from customers. Close confirmation works.

### Phase 6: Assignment Workflow (Day 4-5)

- [ ] **6.1** Create `AssigneeSelect` component -- dropdown of agents in the organization
- [ ] **6.2** Wire to `assign_ticket` action
- [ ] **6.3** Show assignment change in real-time on ticket detail
- [ ] **6.4** Show error toast when trying to assign to a customer (ASSIGNEE_NOT_AGENT)
- [ ] **6.5** Add "Assign to me" shortcut button for agents
- [ ] **6.6** Test: assign ticket, see assignee update, try invalid assignment

**Verification:** Agent picker shows org agents only. Assignment persists. Rule violation shown for invalid assignee.

### Phase 7: Status Transitions with Rule Enforcement (Day 5)

- [ ] **7.1** Create `StatusTransition` component -- buttons for valid next states
- [ ] **7.2** Close: sets status = closed, shows confirmation dialog
- [ ] **7.3** Reopen: sets status = open (only visible on closed tickets)
- [ ] **7.4** Escalate: sets priority = urgent, shows warning toast
- [ ] **7.5** Show structured error messages when rules reject transitions
- [ ] **7.6** Disable/hide invalid transition buttons based on current state
- [ ] **7.7** Test: close ticket, try to update it (see TICKET_CLOSED error), reopen it, try to reopen an open ticket (see error)

**Verification:** Every status transition that violates a rule shows the correct structured error message. Valid transitions succeed.

### Phase 8: Dashboard (Day 5-6)

- [ ] **8.1** Create `pages/Dashboard.tsx` -- metrics grid
- [ ] **8.2** Add 4 metric cards: Open, In Progress, Pending, Resolved ticket counts
- [ ] **8.3** Add "Unassigned Tickets" section -- tickets with no assignee
- [ ] **8.4** Add "Recent Activity" section -- latest 10 ticket updates
- [ ] **8.5** Wire dashboard to real-time subscriptions
- [ ] **8.6** Add dashboard link in navigation (visible to agents/admins only)
- [ ] **8.7** Test: create/close tickets, see dashboard counters update in real-time

**Verification:** Dashboard loads, shows correct counts, updates in real-time as ticket states change.

### Phase 9: Polish and Mobile (Day 6)

- [ ] **9.1** Responsive ticket list -- single column on mobile, card layout
- [ ] **9.2** Responsive ticket detail -- stacked layout on mobile (sidebar below main)
- [ ] **9.3** Mobile navigation -- hamburger menu or bottom tabs
- [ ] **9.4** Touch-friendly tap targets (minimum 44px)
- [ ] **9.5** Loading skeletons instead of spinner (for perceived performance)
- [ ] **9.6** Empty states with clear CTAs for every list
- [ ] **9.7** Keyboard navigation for forms (Tab order, Enter to submit)
- [ ] **9.8** Error boundaries around each page section

**Verification:** Full user journey completable on 375x667 viewport. No horizontal scroll. All interactive targets are touch-friendly.

### Phase 10: E2E Tests (Day 6-7)

- [ ] **10.1** Enable and fix skipped real-time test
- [ ] **10.2** Enable and fix skipped access control test (internal comments)
- [ ] **10.3** Add auth flow tests (register, login, logout, expired token redirect)
- [ ] **10.4** Add assignment workflow tests
- [ ] **10.5** Add status transition tests with rule enforcement
- [ ] **10.6** Add dashboard tests
- [ ] **10.7** Add multi-user real-time test (agent + customer in parallel)
- [ ] **10.8** Add mobile viewport tests for all pages
- [ ] **10.9** Verify all tests pass on chromium, firefox, and webkit
- [ ] **10.10** Add test for structured error message display

**Verification:** `npx playwright test` passes all tests across all 3 browsers.

### Phase 11: Seed Data and Developer Experience (Day 7)

- [ ] **11.1** Create seed script or `forge seed` support -- pre-populate demo data
- [ ] **11.2** Seed data: 1 organization, 3 users (admin, agent, customer), 10 tickets across statuses, 20 comments
- [ ] **11.3** Seed data credentials displayed on login page in dev mode
- [ ] **11.4** Write `projects/helpdesk/README.md` -- 2-minute quickstart
- [ ] **11.5** Verify: `forge dev` from fresh clone gets to working app in under 2 minutes
- [ ] **11.6** Add `.env.example` with all environment variables documented

**Verification:** Fresh `git clone && cd projects/helpdesk && forge dev` results in a working app with data within 2 minutes.

---

## 6. E2E Test Plan

### 6.1 Authentication Journey

| Test | Steps | Expected |
|------|-------|----------|
| Register new user | Fill form, submit | Redirect to ticket list, user menu shows name |
| Login existing user | Fill form, submit | Redirect to ticket list |
| Login with wrong password | Fill form, submit | Error: "Invalid email or password" |
| Logout | Click user menu, Logout | Redirect to login page |
| Expired token | Navigate with expired token | Redirect to login page |
| Auth persistence | Login, reload page | Still authenticated |

### 6.2 Ticket Lifecycle

| Test | Steps | Expected |
|------|-------|----------|
| Create ticket | Fill form, submit | Redirect to list, ticket visible |
| Create with defaults | Submit with subject + description only | status=open, priority=medium |
| Subject max length | Type 121 chars | Input stops at 120, counter shows 120/120 |
| View ticket detail | Click ticket in list | Detail page with description, comments, sidebar |
| Close ticket | Click Close, confirm dialog | Status changes to "Closed" |
| Close already-closed | Try to close closed ticket | Error: TICKET_ALREADY_CLOSED |
| Reopen ticket | Click Reopen on closed ticket | Status changes to "Open" |
| Reopen open ticket | Try to reopen open ticket | Error: TICKET_NOT_CLOSED_REOPEN |
| Update closed ticket | Try to add comment to closed ticket | Comment form disabled, banner shown |
| Delete open ticket | Try to delete open ticket | Error: TICKET_NOT_CLOSED |

### 6.3 Comments

| Test | Steps | Expected |
|------|-------|----------|
| Add public comment | Type comment, click Post | Comment appears in thread |
| Add internal comment | Check "Internal", type, post | Comment appears with amber styling and "Internal" badge |
| Empty comment | Click Post with empty textarea | Button disabled, no submission |
| Customer cannot see internal | Login as customer, view ticket with internal comment | Internal comment not visible |
| Agent can see internal | Login as agent, view same ticket | Internal comment visible |
| Comment form cleared | Post comment | Textarea emptied, internal checkbox unchecked |

### 6.4 Assignment

| Test | Steps | Expected |
|------|-------|----------|
| Assign to agent | Select agent from dropdown | Assignee shown on ticket detail |
| Assign to me | Click "Assign to me" | Current agent shown as assignee |
| Assign to customer | Try to select customer | Error: ASSIGNEE_NOT_AGENT |
| Unassign | Remove assignee | Assignee shows "Unassigned" |

### 6.5 Real-time

| Test | Steps | Expected |
|------|-------|----------|
| Ticket appears in list | Create ticket in browser A | Appears in browser B without refresh |
| Status change propagates | Close ticket in browser A | Status badge updates in browser B |
| Comment appears live | Post comment in browser A | Appears in browser B's comment thread |
| Assignee change propagates | Assign in browser A | Assignee avatar updates in browser B |
| Dashboard updates | Close ticket in browser A | Dashboard counters update in browser B |

### 6.6 Access Control

| Test | Steps | Expected |
|------|-------|----------|
| Customer sees own tickets | Login as customer | Only tickets authored by customer visible |
| Agent sees org tickets | Login as agent | All org tickets visible |
| Admin sees all | Login as admin | All tickets visible |
| Customer hidden from dashboard | Login as customer, go to /dashboard | Redirect to tickets or 403 |
| Internal comments filtered | Login as customer, view ticket | No internal comments in DOM |

### 6.7 Navigation and Responsiveness

| Test | Steps | Expected |
|------|-------|----------|
| Nav links work | Click each nav link | Correct page loads |
| Back button on detail | Click back arrow | Returns to ticket list |
| Mobile ticket list | Set viewport 375x667 | List renders, cards readable, scrollable |
| Mobile ticket detail | Set viewport 375x667 | Sidebar stacks below, comment form usable |
| Mobile create ticket | Set viewport 375x667 | Form fills viewport, submit works |

### 6.8 Error States

| Test | Steps | Expected |
|------|-------|----------|
| Non-existent ticket | Navigate to /tickets/bad-id | Error state with "Ticket not found" |
| API failure | Mock API error | Error card with retry option |
| WebSocket disconnect | Kill WS connection | ConnectionStatus shows "Reconnecting...", auto-reconnects |

---

## 7. Documentation

The `projects/helpdesk/README.md` must provide the 2-minute quickstart:

```
# ForgeDesk -- FORGE Reference Application

A complete helpdesk/ticketing system built entirely with FORGE.

## Quick Start (2 minutes)

    git clone https://github.com/forge-lang/forge.git
    cd forge/projects/helpdesk
    forge dev

Open http://localhost:3000

### Demo Credentials

| Role     | Email              | Password |
|----------|--------------------|----------|
| Admin    | admin@demo.com     | admin    |
| Agent    | agent@demo.com     | agent    |
| Customer | customer@demo.com  | customer |

## Try These Scenarios

1. Create a ticket as customer, log in as agent and assign it
2. Close a ticket, try to add a comment (see the rule in action)
3. Add an internal note as agent, switch to customer view (note hidden)
4. Open ticket list in two browsers, create a ticket in one
5. Escalate a ticket to urgent, see the dashboard update
```

The README is a door. The `.forge` files are the tutorial.

---

## 8. Verification Checklist

### Specification

- [ ] `forge check` passes with zero diagnostics
- [ ] `forge build` generates artifact, schema SQL, and TypeScript SDK
- [ ] `forge test` passes all invariant tests
- [ ] Every entity has access rules
- [ ] Every action specifies creates/updates/deletes
- [ ] Every rule violation has a corresponding message
- [ ] Every message is referenced by at least one rule

### Frontend

- [ ] Login page loads and works (register + login + logout)
- [ ] Ticket list loads with real data
- [ ] Ticket list receives real-time updates via WebSocket
- [ ] Ticket creation form works with validation
- [ ] Ticket detail page shows description, comments, sidebar
- [ ] Comments can be added (public and internal)
- [ ] Internal comments are hidden from customers
- [ ] Tickets can be closed with confirmation dialog
- [ ] Closed tickets show disabled comment form with explanation
- [ ] Tickets can be reopened
- [ ] Tickets can be assigned to agents
- [ ] Invalid assignment shows error message
- [ ] Tickets can be escalated
- [ ] Dashboard shows correct metrics
- [ ] Dashboard updates in real-time
- [ ] All pages work on 375px mobile viewport
- [ ] Loading states shown for every async operation
- [ ] Error states shown with clear messages
- [ ] Toast notifications for successes and errors

### E2E Tests

- [ ] All tests pass on Chromium
- [ ] All tests pass on Firefox
- [ ] All tests pass on WebKit
- [ ] No tests are skipped
- [ ] Real-time propagation tested with dual browser
- [ ] Access control tested with role switching
- [ ] Rule violation tested with expected error codes
- [ ] Mobile viewport tested

### Developer Experience

- [ ] `forge dev` starts the app with zero configuration
- [ ] Seed data pre-populated with demo users and tickets
- [ ] Demo credentials shown on login page (dev mode only)
- [ ] Hot reload works -- edit a `.forge` file, see the change
- [ ] README exists and is accurate
- [ ] Total time from `git clone` to working app: under 2 minutes

### Code Quality

- [ ] No hardcoded tokens in committed code
- [ ] No `any` types in TypeScript (explicit interfaces for everything)
- [ ] No unused imports or dead code
- [ ] Consistent naming: snake_case for FORGE, camelCase for TypeScript
- [ ] Every component has explicit prop types
- [ ] No console.log in production code (only in dev utilities)

---

## Appendix A: File Inventory

### Modified

| File | Change |
|------|--------|
| `projects/helpdesk/app.forge` | `auth: oauth` to `auth: password` |
| `projects/helpdesk/rules.forge` | Add assignment, close, reopen rules |
| `projects/helpdesk/access.forge` | Internal comment filtering |
| `projects/helpdesk/actions.forge` | Add update_ticket, update_comment |
| `projects/helpdesk/messages.forge` | Add 5 new messages |
| `projects/helpdesk/views.forge` | Add MyTickets, AssignedToMe, fix CommentThread |
| `projects/helpdesk/tests.forge` | Add assignment, transition, access tests |
| `projects/helpdesk/web/src/App.tsx` | Auth flow, remove hardcoded token, add routes |
| `projects/helpdesk/web/src/pages/TicketList.tsx` | Add filters, stats bar, real-time |
| `projects/helpdesk/web/src/pages/TicketDetail.tsx` | Assignment UI, status transitions, real-time comments |
| `projects/helpdesk/web/src/pages/NewTicket.tsx` | Use typed client, toast on success |
| `e2e/tests/helpdesk.spec.ts` | Enable skipped tests, add new test suites |
| `e2e/fixtures/auth.ts` | Update for password auth flow |
| `e2e/fixtures/db.ts` | Add assignment helpers |

### Created

| File | Purpose |
|------|---------|
| `projects/helpdesk/web/src/lib/forge/client.ts` | Typed helpdesk client with auth, actions, views |
| `projects/helpdesk/web/src/lib/forge/react.tsx` | ForgeProvider, useAuth, typed hooks |
| `projects/helpdesk/web/src/pages/Login.tsx` | Login page |
| `projects/helpdesk/web/src/pages/Register.tsx` | Registration page |
| `projects/helpdesk/web/src/pages/Dashboard.tsx` | Agent/admin dashboard |
| `projects/helpdesk/web/src/components/AuthGuard.tsx` | Auth redirect wrapper |
| `projects/helpdesk/web/src/components/UserMenu.tsx` | Header user dropdown |
| `projects/helpdesk/web/src/components/ConnectionStatus.tsx` | WebSocket status indicator |
| `projects/helpdesk/web/src/components/AssigneeSelect.tsx` | Agent picker dropdown |
| `projects/helpdesk/web/src/components/StatusTransition.tsx` | Status action buttons |
| `projects/helpdesk/web/src/components/StatsBar.tsx` | Ticket count metrics |
| `projects/helpdesk/web/src/components/FilterBar.tsx` | List filter controls |
| `projects/helpdesk/web/src/components/Toast.tsx` | Toast notification system |
| `projects/helpdesk/web/src/components/ErrorBoundary.tsx` | React error boundary |
| `projects/helpdesk/README.md` | 2-minute quickstart |

---

## Appendix B: Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Runtime does not support `auth: password` endpoints yet | Blocks Phase 2 | Check runtime handlers. If missing, use the chat project mock auth pattern as interim. |
| WebSocket subscription does not push view diffs | Blocks real-time demos | Verify runtime WebSocket hub. If not working, poll with 2-second interval as fallback. |
| Comment access rule filtering (internal) not enforced by runtime | Blocks access control demo | Verify RLS policy. If not, filter client-side as interim (not secure, document limitation). |
| `forge test` command not implemented in CLI | Blocks Phase 1.10 | Use `forge check` as minimum validation. |
| View `filter:` syntax not yet supported by compiler | Blocks MyTickets, AssignedToMe | Filter client-side. Document as FORGE limitation. |
| Action transition logic not expressible in spec | Blocks close/reopen | Send `{status: "closed"}` as input from client. |

---

## Appendix C: Why This Matters

ForgeDesk is not just an example. It is proof.

Every developer who evaluates FORGE will:
1. Clone the repo
2. Run `forge dev`
3. Open the browser
4. Poke around for 5 minutes
5. Read the `.forge` files
6. Decide if FORGE is worth their time

If step 2 fails, they leave. If step 4 feels like a toy, they leave. If step 5 is confusing, they leave.

The bar is not "does it work." The bar is "does it feel inevitable." The developer should look at the `.forge` files and think: "Of course. Why would you build it any other way?"

That is the reference application. That is what sells FORGE.
