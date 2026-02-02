# Chat Application - Decision Log

> This document records all architectural and implementation decisions made during development.

---

## Decision 001: Project Structure

**Date:** 2026-02-02
**Context:** Setting up a Slack-like chat application with FORGE
**Decision:** Split .forge files by concern following helpdesk pattern

**Structure:**
```
projects/chat/
├── app.forge              # Application config
├── entities.forge         # Data models
├── relations.forge        # Entity relationships
├── access.forge           # RLS rules
├── rules.forge            # Business invariants
├── actions.forge          # Transactions
├── views.forge            # Frontend projections
├── hooks.forge            # Event bindings
├── jobs.forge             # Background tasks
├── messages.forge         # Error/success codes
├── tests.forge            # Invariant tests
├── presence.forge         # NEW: Ephemeral presence state
├── forge.runtime.toml     # Runtime configuration
├── decisions.md           # This file
└── web/                   # React frontend
```

**Rationale:** Consistent with existing patterns, easy to navigate, each file has single responsibility.

---

## Decision 002: Entity Model Design

**Date:** 2026-02-02
**Context:** Modeling Slack-like chat data
**Decision:** Use the following entity hierarchy:

```
Workspace
├── Channel (public/private)
│   ├── Message
│   │   ├── Thread (replies)
│   │   └── Reaction
│   └── Membership (user-channel link)
├── DirectMessage (conversation)
│   └── Message
└── User
    └── WorkspaceMembership
```

**Key entities:**
- `Workspace`: Top-level container (like Slack workspace)
- `Channel`: Communication channels within workspace
- `Message`: The actual messages (polymorphic - works in both channels and DMs)
- `Thread`: Reply chain to a parent message
- `Reaction`: Emoji reactions to messages
- `Membership`: Links users to channels with roles
- `DirectMessage`: 1:1 or small group conversation container

**Rationale:**
- Workspace-level isolation ensures multi-tenancy at the data level
- Message entity is reusable for both channels and DMs
- Thread as separate entity allows unlimited nesting without self-reference complexity
- Reaction as separate entity enables efficient querying and real-time updates

---

## Decision 003: Authentication Strategy

**Date:** 2026-02-02
**Context:** Need registration and login for chat users
**Decision:** JWT-based auth with registration action

**Implementation:**
- `register` action creates User with hashed password
- `login` action validates credentials, returns JWT
- JWT contains: user_id, workspace_ids, roles
- Token stored in localStorage, passed in Authorization header

**Rationale:**
- JWT allows stateless authentication
- Consistent with FORGE spec's auth.jwt config
- Simple to implement registration flow

---

## Decision 004: Real-time Messaging Architecture

**Date:** 2026-02-02
**Context:** Messages must appear instantly for all channel members
**Decision:** Use FORGE's built-in view subscriptions

**Flow:**
1. User sends message via `send_message` action
2. Action commits to database
3. Hook triggers view update notification
4. WebSocket broadcasts to subscribers of `MessageFeed` view
5. React hook auto-updates UI

**Rationale:**
- FORGE already handles real-time via view subscriptions
- No custom WebSocket code needed
- Access rules enforced on every subscription update

---

## Decision 005: Presence System

**Date:** 2026-02-02
**Context:** Users need to see who's online
**Decision:** Introduce `presence` construct for ephemeral state

**New Construct:**
```forge
presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline)
  last_seen: time
  ttl: 5m  # Auto-expire to offline
}
```

**Rationale:**
- Presence is fundamentally different from persistent entities
- It's ephemeral (doesn't need full transaction semantics)
- TTL prevents stale online indicators
- This is a new FORGE construct - documented as language extension

**Alternative Considered:**
- Using regular entity with timestamp polling
- Rejected: Too expensive, doesn't match mental model

---

## Decision 006: Typing Indicators

**Date:** 2026-02-02
**Context:** "User is typing..." indicators
**Decision:** Use ephemeral broadcasts, not stored state

**New Construct:**
```forge
ephemeral typing {
  channel: Channel
  user: User
  ttl: 3s
}
```

**Rationale:**
- Typing indicators are pure UI feedback
- Should never hit the database
- WebSocket broadcast only
- Auto-expires quickly

---

## Decision 007: Message Editing Time Limit

**Date:** 2026-02-02
**Context:** Slack allows editing messages for a limited time
**Decision:** Allow editing within 15 minutes of posting

**Implementation:**
```forge
rule Message.update {
  forbid if created_at < now() - 15m
    emit MESSAGE_EDIT_EXPIRED
}
```

**Rationale:**
- Prevents historical revisionism
- Consistent with Slack behavior
- 15 minutes is generous enough for typo fixes

---

## Decision 008: Channel Types

**Date:** 2026-02-02
**Context:** Slack has public and private channels
**Decision:** Use enum for channel visibility

```forge
entity Channel {
  visibility: enum(public, private) = public
  ...
}
```

**Access control:**
- Public channels: readable by all workspace members
- Private channels: readable only by channel members

**Rationale:**
- Simple enum, no separate entity types
- Access rules handle the distinction cleanly

---

## Decision 009: Frontend Framework Choices

**Date:** 2026-02-02
**Context:** Building Slack-like UI
**Decision:** React + Tailwind CSS + Radix UI (consistent with helpdesk)

**UI Components:**
- Sidebar: workspace switcher, channel list, DM list
- Main area: message feed with infinite scroll
- Composer: message input with markdown support
- Thread panel: side panel for replies
- Presence dots: green/yellow/red indicators

**Rationale:**
- Consistency with existing project
- Radix provides accessible primitives
- Tailwind enables rapid styling

---

## Decision 010: Message Content Format

**Date:** 2026-02-02
**Context:** Messages need rich formatting
**Decision:** Store as markdown, render on frontend

**Implementation:**
- `content: text` field stores raw markdown
- Frontend renders with sanitized markdown parser
- Mentions stored as `@[user_id]` tokens
- Links auto-detected

**Rationale:**
- Markdown is universal and LLM-friendly
- No complex rich text storage
- Frontend handles rendering variations

---

## Decision 011: Workspace Isolation

**Date:** 2026-02-02
**Context:** Users in different workspaces must never see each other's data
**Decision:** All entities relate to Workspace, access rules enforce isolation

**Implementation:**
- Every entity has `workspace` relation (direct or transitive)
- Access rules check `user in workspace.members`
- RLS policies compiled at database level

**Rationale:**
- This is FORGE's core value proposition
- Workspace isolation is mathematically guaranteed
- Cannot be bypassed by application bugs

---

## Decision 012: E2E Test Strategy

**Date:** 2026-02-02
**Context:** Need comprehensive testing
**Decision:** Follow helpdesk E2E patterns with chat-specific fixtures

**Test categories:**
1. Authentication: register, login, logout
2. Workspace: create, join, switch
3. Channels: create, join, leave, permissions
4. Messages: send, receive real-time, edit, delete
5. Threads: reply, view thread
6. Reactions: add, remove
7. DMs: start conversation, send messages
8. Presence: online/offline indicators
9. Access control: verify workspace isolation

**Rationale:**
- Cover all user flows
- Test real-time features explicitly
- Verify security guarantees

---

## Decision 013: New Language Constructs

**Date:** 2026-02-02
**Context:** Chat requires ephemeral state that doesn't fit the entity model
**Decision:** Introduce two new FORGE constructs: `presence` and `ephemeral`

### `presence` Construct

```forge
presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline) = offline
  ttl: 5m
  scope: workspace
}
```

**Characteristics:**
- Linked to a source entity (User)
- Has TTL-based auto-expiration
- Stored in memory/Redis, not PostgreSQL
- Scoped to a context (workspace, channel, etc.)
- Broadcast via WebSocket on change

**Why not use an entity:**
- Presence is fundamentally ephemeral
- High-frequency updates (heartbeats) would overwhelm the DB
- TTL expiration is automatic, not action-based
- Different consistency requirements (eventual is fine)

### `ephemeral` Construct

```forge
ephemeral Typing {
  user: User
  channel: Channel optional
  ttl: 3s
}
```

**Characteristics:**
- Pure broadcast state, never persisted
- Very short TTL (seconds)
- No transaction semantics
- WebSocket-only distribution

**Why not use presence:**
- Typing is even more transient than presence
- No need for queryable views
- Fire-and-forget semantics

### Impact on FORGE's Guarantees

These constructs maintain FORGE's security model:
- Access rules still apply to presence/ephemeral data
- Workspace isolation is preserved (scope parameter)
- No bypass of the sealed runtime
- Capabilities still enforced

**Trade-off:** We accept eventual consistency for these ephemeral features in exchange for performance and simplicity.

---

## Decision 014: Password Storage

**Date:** 2026-02-02
**Context:** Need to store user passwords securely
**Decision:** Use Argon2id with recommended parameters

**Implementation:**
- Algorithm: Argon2id (winner of Password Hashing Competition)
- Memory: 64MB
- Iterations: 3
- Parallelism: 4

**Rationale:**
- Argon2id is the current best practice
- Parameters chosen per OWASP guidelines
- Stored in `password_hash` field, never in plain text

---

## Decision 015: Message Content Length

**Date:** 2026-02-02
**Context:** Need to set reasonable limits on message length
**Decision:** 40,000 character limit for messages

**Rationale:**
- Slack uses 40,000 characters
- Large enough for code blocks, long explanations
- Small enough to prevent abuse
- Applied to both Message and Thread entities

---

## Decision 016: WebSocket Heartbeat

**Date:** 2026-02-02
**Context:** Need to detect disconnected clients for presence
**Decision:** 30-second heartbeat interval with 60-second timeout

**Implementation:**
- Client sends heartbeat every 30 seconds
- Server marks offline after 60 seconds without heartbeat
- Presence TTL is 5 minutes (handles brief network issues)

**Rationale:**
- 30s balances responsiveness with bandwidth
- 60s timeout allows for brief network hiccups
- 5m TTL handles page reloads, tab switches

---

## Decision 017: Rate Limiting

**Date:** 2026-02-02
**Context:** Prevent abuse and ensure fair usage
**Decision:** Per-user rate limits

**Limits:**
- Messages: 60/minute (1 per second average)
- API requests: 300/minute (5 per second average)

**Rationale:**
- Generous for normal use
- Prevents spam and abuse
- Per-user, not per-IP (handles shared IPs)
- Disabled in test environment

---

## Decision 018: Session Duration

**Date:** 2026-02-02
**Context:** Balance security with convenience
**Decision:** 7-day JWT expiry

**Rationale:**
- Slack uses 14 days
- 7 days balances security with convenience
- Users don't need to log in daily
- Sensitive operations could require re-auth (future)

---

## Decision 019: Frontend Component Architecture

**Date:** 2026-02-02
**Context:** Building Slack-like UI with React
**Decision:** Component hierarchy with clear responsibilities

**Components:**
- `App.tsx` - Provider setup, routing, layout switching
- `Sidebar.tsx` - Workspace nav, channel list, DM list, user section
- `Channel.tsx` / `DirectMessage.tsx` - Page components with data fetching
- `Message.tsx` - Individual message with reactions, threads, actions
- `MessageComposer.tsx` - Input area with formatting, emoji, mentions
- `UserAvatar.tsx` - Avatar with presence indicator
- `TypingIndicator.tsx` - "User is typing..." display
- `PresenceIndicator.tsx` - Online/away/dnd/offline dot

**Rationale:**
- Clear separation between UI components and page containers
- Page components handle data fetching (useList, useEntity, useAction)
- UI components are presentational and reusable
- Consistent with FORGE's SDK patterns

---

## Decision 020: Mock Data for Development

**Date:** 2026-02-02
**Context:** Need to develop UI before backend is fully ready
**Decision:** Include mock data in App.tsx for development

**Implementation:**
- Mock workspace, channels, DMs, and current user
- Allows frontend development without running the full stack
- Will be replaced by real API calls as backend matures

**Rationale:**
- Enables parallel development of frontend and backend
- Demonstrates intended data shapes
- Easy to remove once integration is complete

---

## Decision 021: E2E Test Organization

**Date:** 2026-02-02
**Context:** Need comprehensive E2E tests for the chat application
**Decision:** Create chat-specific fixtures and comprehensive test suites

**Test Structure:**
```
e2e/
├── fixtures/
│   ├── chat-auth.ts     # Chat-specific authentication helpers
│   └── chat-db.ts       # Chat data creation utilities
└── tests/
    └── chat.spec.ts     # Comprehensive chat tests
```

**Test Categories:**
1. Authentication (register, login)
2. Channel List (display, unread, create)
3. Channel Messages (display, send, date grouping)
4. Message Actions (edit, delete, ownership)
5. Reactions (add, toggle, counts)
6. Threads (reply, counts, panel)
7. Direct Messages (create, send, presence)
8. Access Control (private channels, workspace isolation)
9. Real-time Updates (WebSocket)
10. Error Handling (failures, offline)
11. Business Rules (edit timeout, deletion)

**Test Users:**
- owner: Workspace owner
- admin: Admin user
- member1: Regular member (Alice)
- member2: Regular member (Bob)
- outsider: User NOT in workspace

**Rationale:**
- Consistent with helpdesk E2E patterns
- Chat-specific fixtures for message/channel creation
- Access control tests verify security guarantees
- Skipped tests for features requiring WebSocket

---

## Future Decisions

Reserved for decisions made during implementation.
