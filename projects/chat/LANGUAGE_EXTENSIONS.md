# FORGE Language Extensions for Real-time Collaboration

This document describes two new FORGE constructs introduced to support real-time collaboration features in the chat application.

---

## Overview

Traditional entities are designed for persistent, transactional data. Real-time collaboration features like presence (who's online) and typing indicators require a different model:

| Feature | Persistence | Update Frequency | Consistency |
|---------|-------------|------------------|-------------|
| Entities | Permanent | Low | Strong |
| **Presence** | Ephemeral | Medium (heartbeats) | Eventual |
| **Ephemeral** | None | High (typing) | Best-effort |

---

## 1. The `presence` Construct

### Purpose

Track ephemeral user state that auto-expires without explicit cleanup.

### Syntax

```forge
presence <Name> {
  source: <Entity>
  <field>: <type> [= default]
  ...
  ttl: <duration>
  scope: <relation>
}
```

### Example

```forge
presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline) = offline
  custom_status: string length <= 100 optional
  last_seen: time
  ttl: 5m
  scope: workspace
}
```

### Semantics

1. **Source binding**: Each presence instance is linked to a source entity (e.g., User)
2. **TTL expiration**: Automatically transitions to default state after TTL without refresh
3. **Scope**: Presence is partitioned by scope (e.g., per-workspace)
4. **Storage**: Stored in Redis/memory, NOT PostgreSQL
5. **Access control**: Follows same access rules as source entity's context

### Runtime Behavior

```
┌─────────────────────────────────────────────────────────┐
│                    WebSocket Connection                  │
├─────────────────────────────────────────────────────────┤
│  1. Client connects → set_user_online job runs          │
│  2. Client sends heartbeat every 30s → refresh TTL      │
│  3. No heartbeat for 5m → auto-expire to offline        │
│  4. Client disconnects → set_user_offline job runs      │
└─────────────────────────────────────────────────────────┘
```

### Generated API

```typescript
// Client SDK
client.presence.update({ status: 'away' });
client.presence.subscribe('OnlineUsers', {
  workspace: workspaceId,
  onData: (users) => setOnlineUsers(users),
});
```

### Views over Presence

```forge
view OnlineUsers {
  source: UserPresence
  filter: workspace == param.workspace and status != offline
  fields: user.id, user.display_name, status
  realtime: true
}
```

---

## 2. The `ephemeral` Construct

### Purpose

Broadcast-only state that never persists. For features like typing indicators.

### Syntax

```forge
ephemeral <Name> {
  <field>: <type>
  ...
  ttl: <duration>
}
```

### Example

```forge
ephemeral Typing {
  user: User
  channel: Channel optional
  dm: DirectMessage optional
  ttl: 3s
}
```

### Semantics

1. **No persistence**: Never written to any storage
2. **Broadcast-only**: Published to WebSocket subscribers
3. **Auto-expire**: Client-side expiration (TTL is a hint)
4. **Fire-and-forget**: No delivery guarantees

### Runtime Behavior

```
┌─────────────────────────────────────────────────────────┐
│                    Typing Flow                           │
├─────────────────────────────────────────────────────────┤
│  1. User types in composer                               │
│  2. Client calls start_typing action                     │
│  3. Server broadcasts to channel subscribers             │
│  4. Client auto-expires after 3s without refresh         │
│  5. User stops typing → stop_typing action (optional)    │
└─────────────────────────────────────────────────────────┘
```

### Generated API

```typescript
// Client SDK
client.ephemeral.broadcast('Typing', {
  channel: channelId,
});

client.ephemeral.subscribe('ChannelTyping', {
  channel: channelId,
  onData: (typing) => setTypingUsers(typing),
});
```

### Views over Ephemeral

```forge
view ChannelTyping {
  source: Typing
  filter: channel == param.channel
  fields: user.id, user.display_name
  realtime: true
}
```

---

## 3. Comparison with Entities

| Aspect | Entity | Presence | Ephemeral |
|--------|--------|----------|-----------|
| Storage | PostgreSQL | Redis/Memory | None |
| Transactions | Yes | No | No |
| RLS enforcement | Yes | Yes (via scope) | Yes (via filter) |
| ACID guarantees | Yes | No | No |
| Audit trail | Yes | No | No |
| TTL expiration | No | Yes | Yes (client-side) |
| Actions | create/update/delete | update/refresh | broadcast |

---

## 4. Access Control

Both constructs maintain FORGE's security guarantees:

### Presence Access

```forge
# Presence inherits access from scope
presence UserPresence {
  scope: workspace  # Access follows workspace.members
}

# Explicit access rules
access UserPresence {
  read: user in workspace.members.user
  write: user == source  # Only own presence
}
```

### Ephemeral Access

```forge
# Ephemeral inherits from referenced entities
ephemeral Typing {
  channel: Channel  # Access follows channel access rules
}

# Broadcast filtering
view ChannelTyping {
  filter: channel == param.channel
  # Only subscribers who can read the channel receive broadcasts
}
```

---

## 5. Configuration

### Runtime Configuration

```toml
[presence]
backend = "redis"  # or "memory" for dev

[presence.redis]
url = "env:REDIS_URL"

default_ttl = "5m"

[websocket]
heartbeat_interval = "30s"
```

---

## 6. Implementation Notes

### Presence Storage

In production, presence should use Redis:
- Fast reads/writes
- Built-in TTL support
- Pub/sub for updates

In development, memory storage is sufficient.

### WebSocket Integration

Presence and ephemeral state flow through the existing WebSocket infrastructure:
- Subscribe to presence/ephemeral views
- Receive broadcasts on state changes
- Client-side TTL enforcement for ephemeral

### Migration Path

Existing FORGE applications don't need changes. These constructs are additive.

---

## 7. Rationale

### Why Not Use Entities?

Entities would work but have drawbacks:
- PostgreSQL isn't designed for high-frequency ephemeral writes
- Transaction overhead for simple status updates
- No built-in TTL expiration
- Audit trail pollution with heartbeats

### Why Two Constructs?

Presence and ephemeral have different needs:
- Presence needs queryable views (who's online?)
- Ephemeral is pure broadcast (someone is typing)
- Presence persists briefly (minutes)
- Ephemeral is instant (seconds)

### Consistency with FORGE Philosophy

These constructs maintain FORGE's core principles:
- **Declarative**: State shape and behavior declared, not coded
- **Sealed runtime**: Access rules still enforced
- **No bypass**: Can't circumvent access control
- **LLM-friendly**: Simple syntax, clear semantics

---

## 8. Future Considerations

### Potential Extensions

1. **Presence aggregations**: "23 members online"
2. **Custom presence states**: Team-defined status options
3. **Presence history**: Recent activity log (opt-in)
4. **Ephemeral acknowledgments**: Delivery confirmation

### Open Questions

1. Should presence support custom TTL per-status? (e.g., DND lasts longer)
2. Should ephemeral support priority/ordering?
3. Should presence integrate with external systems (Slack status)?

---

## 9. Proposed Spec Changes

Add to FORGE_SPEC.md:

### Section 12.1: Presence

```markdown
## 12.1 Presence

Presence tracks ephemeral user state with automatic expiration.

\`\`\`text
presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline) = offline
  ttl: 5m
  scope: workspace
}
\`\`\`

Presence:
- Auto-expires to default after TTL
- Stored in Redis/memory, not PostgreSQL
- Scoped to a relation (workspace, channel)
- Respects access rules via scope
```

### Section 12.2: Ephemeral

```markdown
## 12.2 Ephemeral

Ephemeral defines broadcast-only state that never persists.

\`\`\`text
ephemeral Typing {
  user: User
  channel: Channel optional
  ttl: 3s
}
\`\`\`

Ephemeral:
- Never written to storage
- Broadcast via WebSocket
- Client-side TTL expiration
- No delivery guarantees
```
