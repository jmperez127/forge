# FORGE Development Info Page

A built-in development dashboard that provides visibility into your FORGE application's compiled schema, routes, rules, and runtime status. Available only in development mode.

> **Status:** Implemented in `runtime/internal/server/devinfo.go`

---

## Overview

When running in development mode (`FORGE_ENV=development` or unset), FORGE exposes a set of `/_dev` routes that provide comprehensive information about your application:

- **App Metadata** - Name, version, auth method, database type
- **Routes** - All API endpoints with access rules (searchable)
- **Schema** - Entities, fields, relations, constraints
- **Business Rules** - Forbid/require conditions with SQL predicates
- **Access Control** - Read/write SQL policies
- **Views** - Projections with source entities and dependencies
- **Jobs & Hooks** - Background processing configuration
- **Messages** - Error/success codes with default text
- **Runtime Status** - Database connections, WebSocket stats

This feature is inspired by Rails' `/rails/info` pages but tailored for FORGE's compiled artifact architecture.

---

## Quick Start

```bash
# Start the runtime in development mode (default)
forge run

# Open the dev dashboard in browser
open http://localhost:8080/_dev
```

The dashboard provides a dark-themed web UI with navigation to all info pages. You can also access JSON endpoints directly:

```bash
# Get info as JSON
curl http://localhost:8080/_dev/info

# Get routes as JSON
curl http://localhost:8080/_dev/routes

# Pretty print with jq
curl http://localhost:8080/_dev/schema | jq .
```

---

## Security

**Dev info pages are ONLY available in development mode.**

- Routes return 404 in production (not 403, to avoid information leakage)
- No configuration option to enable in production
- Secrets are always masked (see [Config Page](#config-page))

The security boundary is the `FORGE_ENV` environment variable:

```bash
# Development mode (default) - dev pages available
FORGE_ENV=development forge run

# Production mode - dev pages return 404
FORGE_ENV=production forge run
```

---

## Available Routes

| Route | Description |
|-------|-------------|
| `/_dev` | Dashboard with stats and quick links |
| `/_dev/info` | App metadata and runtime environment |
| `/_dev/routes` | All API routes with access rules |
| `/_dev/schema` | Entities, fields, relations |
| `/_dev/actions` | Actions with input entities and rules |
| `/_dev/rules` | Business rules with SQL predicates |
| `/_dev/access` | Access control policies |
| `/_dev/views` | View definitions and dependencies |
| `/_dev/jobs` | Background jobs and hooks |
| `/_dev/messages` | Message codes and defaults |
| `/_dev/database` | Database status and migration info |
| `/_dev/websocket` | WebSocket connection stats |
| `/_dev/config` | Runtime configuration (secrets masked) |

---

## Response Format

All endpoints support content negotiation:

- **JSON** (default): Returns formatted JSON
- **HTML**: `Accept: text/html` - Dark-themed web page with navigation

```bash
# JSON response (default)
curl http://localhost:8080/_dev/routes

# HTML response
curl -H "Accept: text/html" http://localhost:8080/_dev/routes

# Or just open in browser
open http://localhost:8080/_dev/routes
```

---

## Page Reference

### Dashboard (`/_dev`)

The main entry point with links to all info pages and a quick summary:

- App name and version
- Environment (development/test/production)
- Database adapter and status
- WebSocket connections count
- Quick links to all sections

---

### Info Page (`/_dev/info`)

Application metadata and runtime environment:

```json
{
  "app": {
    "name": "Helpdesk",
    "version": "1.0.0",
    "auth": "oauth",
    "database": "postgres"
  },
  "runtime": {
    "forge_version": "0.1.0",
    "go_version": "go1.24.5",
    "environment": "development",
    "started_at": "2026-02-02T12:48:20-04:00",
    "uptime_seconds": 17
  },
  "build": {
    "artifact_path": ".forge-runtime/artifact.json"
  },
  "stats": {
    "entities": 5,
    "actions": 6,
    "rules": 4,
    "views": 7,
    "jobs": 3,
    "hooks": 3,
    "messages": 7
  }
}
```

---

### Routes Page (`/_dev/routes`)

All API routes in a searchable table (similar to Rails):

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/health",
      "handler": "health",
      "access": "public"
    },
    {
      "method": "POST",
      "path": "/api/actions/create_ticket",
      "handler": "action:create_ticket",
      "access": "user in org.members"
    },
    {
      "method": "GET",
      "path": "/api/views/TicketList",
      "handler": "view:TicketList",
      "access": "user in org.members"
    },
    {
      "method": "GET",
      "path": "/api/entities/Ticket",
      "handler": "entity:Ticket:list",
      "access": "read: user in org.members"
    },
    {
      "method": "GET",
      "path": "/api/entities/Ticket/:id",
      "handler": "entity:Ticket:get",
      "access": "read: user in org.members"
    },
    {
      "method": "POST",
      "path": "/api/entities/Ticket",
      "handler": "entity:Ticket:create",
      "access": "write: user == author or user.role == agent"
    },
    {
      "method": "PUT",
      "path": "/api/entities/Ticket/:id",
      "handler": "entity:Ticket:update",
      "access": "write: user == author or user.role == agent"
    },
    {
      "method": "DELETE",
      "path": "/api/entities/Ticket/:id",
      "handler": "entity:Ticket:delete",
      "access": "write: user == author or user.role == agent"
    },
    {
      "method": "WS",
      "path": "/ws",
      "handler": "websocket",
      "access": "authenticated"
    }
  ]
}
```

The HTML version includes:
- Search box to filter routes
- Sortable columns
- Syntax highlighting for access rules

---

### Schema Page (`/_dev/schema`)

Complete entity definitions with fields and relations:

```json
{
  "entities": {
    "Ticket": {
      "name": "Ticket",
      "table": "tickets",
      "fields": {
        "id": {
          "type": "uuid",
          "sql_type": "UUID",
          "nullable": false,
          "primary_key": true,
          "default": "gen_random_uuid()"
        },
        "subject": {
          "type": "string",
          "sql_type": "VARCHAR(120)",
          "nullable": false,
          "max_length": 120
        },
        "status": {
          "type": "enum",
          "sql_type": "ticket_status",
          "nullable": false,
          "default": "open",
          "enum_values": ["open", "pending", "closed"]
        },
        "priority": {
          "type": "enum",
          "sql_type": "ticket_priority",
          "nullable": false,
          "default": "normal",
          "enum_values": ["low", "normal", "high", "urgent"]
        },
        "created_at": {
          "type": "time",
          "sql_type": "TIMESTAMPTZ",
          "nullable": false,
          "default": "now()"
        }
      },
      "relations": {
        "author": {
          "target": "User",
          "foreign_key": "author_id",
          "is_many": false,
          "on_delete": "restrict"
        },
        "org": {
          "target": "Organization",
          "foreign_key": "org_id",
          "is_many": false,
          "on_delete": "cascade"
        },
        "assignee": {
          "target": "User",
          "foreign_key": "assignee_id",
          "is_many": false,
          "nullable": true
        },
        "comments": {
          "target": "Comment",
          "is_many": true,
          "inverse": "ticket"
        }
      }
    }
  }
}
```

---

### Actions Page (`/_dev/actions`)

Available actions with their input entities, rules, and hooks:

```json
{
  "actions": {
    "create_ticket": {
      "name": "create_ticket",
      "input_entity": "Ticket",
      "rules": ["Ticket_create"],
      "hooks": ["Ticket_after_create"],
      "access": "write: user in org.members"
    },
    "close_ticket": {
      "name": "close_ticket",
      "input_entity": "Ticket",
      "rules": ["Ticket_update", "Ticket_close"],
      "hooks": ["Ticket_after_update"],
      "access": "write: user == author or user.role == agent"
    }
  }
}
```

---

### Rules Page (`/_dev/rules`)

Business rules with both CEL expressions and compiled SQL predicates:

```json
{
  "rules": [
    {
      "id": "rule_1",
      "entity": "Ticket",
      "operation": "update",
      "type": "forbid",
      "condition": "status == closed",
      "sql_predicate": "status = 'closed'",
      "emit_code": "TICKET_CLOSED",
      "message": "This ticket is already closed and cannot be modified."
    },
    {
      "id": "rule_2",
      "entity": "Comment",
      "operation": "create",
      "type": "require",
      "condition": "content.length > 0",
      "sql_predicate": "LENGTH(content) > 0",
      "emit_code": "COMMENT_EMPTY",
      "message": "Comment content cannot be empty."
    }
  ]
}
```

The HTML version shows rules grouped by entity with syntax highlighting for SQL/CEL.

---

### Access Page (`/_dev/access`)

Access control policies for each entity:

```json
{
  "access": {
    "Ticket": {
      "entity": "Ticket",
      "table": "tickets",
      "read": {
        "cel": "user in org.members",
        "sql": "org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting('app.user_id')::uuid)"
      },
      "write": {
        "cel": "user == author or user.role == agent",
        "sql": "author_id = current_setting('app.user_id')::uuid OR EXISTS (SELECT 1 FROM users WHERE id = current_setting('app.user_id')::uuid AND role = 'agent')"
      }
    }
  }
}
```

---

### Views Page (`/_dev/views`)

View definitions with source entities, fields, and generated SQL:

```json
{
  "views": {
    "TicketList": {
      "name": "TicketList",
      "source": "Ticket",
      "fields": ["id", "subject", "status", "priority", "author.name", "assignee.name", "created_at"],
      "query": "SELECT t.id, t.subject, t.status, t.priority, u.name as author_name, a.name as assignee_name, t.created_at FROM tickets t JOIN users u ON t.author_id = u.id LEFT JOIN users a ON t.assignee_id = a.id WHERE ...",
      "dependencies": ["Ticket", "User"]
    },
    "TicketDetail": {
      "name": "TicketDetail",
      "source": "Ticket",
      "fields": ["*", "comments.*", "author.*", "assignee.*"],
      "dependencies": ["Ticket", "Comment", "User"]
    }
  }
}
```

---

### Jobs Page (`/_dev/jobs`)

Background jobs, hooks, executor status, and provider info:

```json
{
  "jobs": {
    "notify_agents": {
      "name": "notify_agents",
      "input_entity": "Ticket",
      "needs": "Ticket.org.members where role == agent",
      "capabilities": ["email.send"],
      "triggered_by": ["Ticket_after_create"]
    }
  },
  "hooks": [
    {
      "entity": "Ticket",
      "timing": "after",
      "operation": "create",
      "jobs": ["notify_agents"]
    },
    {
      "entity": "Ticket",
      "timing": "after",
      "operation": "update",
      "jobs": ["notify_author", "notify_assignee"]
    }
  ],
  "executor": {
    "status": "running",
    "workers": 10,
    "queue_capacity": 1000,
    "queue_length": 0
  },
  "providers": {
    "registered": ["email", "generic"],
    "capabilities": ["email.send", "http.call", "http.delete", "http.get", "http.post", "http.put"]
  }
}
```

---

### Messages Page (`/_dev/messages`)

All message codes with their levels and default text:

```json
{
  "messages": {
    "TICKET_CLOSED": {
      "code": "TICKET_CLOSED",
      "level": "error",
      "default": "This ticket is already closed and cannot be modified."
    },
    "TICKET_CREATED": {
      "code": "TICKET_CREATED",
      "level": "info",
      "default": "Ticket created successfully."
    },
    "COMMENT_EMPTY": {
      "code": "COMMENT_EMPTY",
      "level": "error",
      "default": "Comment content cannot be empty."
    }
  }
}
```

---

### Database Page (`/_dev/database`)

Database connection status and schema information:

```json
{
  "adapter": "embedded",
  "status": "connected",
  "embedded": true,
  "data_dir": ".forge-runtime/data",
  "migration_version": "001",
  "tables": [
    "comments",
    "organizations",
    "tags",
    "tickets",
    "users"
  ]
}
```

For external PostgreSQL:
```json
{
  "adapter": "postgres",
  "status": "connected",
  "embedded": false,
  "migration_version": "001",
  "tables": ["users", "organizations", "tickets", "comments", "tags"]
}
```

---

### WebSocket Page (`/_dev/websocket`)

Real-time connection statistics:

```json
{
  "status": "active",
  "connections": 3,
  "subscriptions": {
    "TicketList": 2,
    "TicketDetail": 1
  }
}
```

---

### Config Page (`/_dev/config`)

Runtime configuration with secrets masked:

```json
{
  "database": {
    "adapter": "embedded",
    "data_dir": ".forge-runtime/data",
    "port": 5432,
    "ephemeral": false
  },
  "auth": {
    "provider": "oauth"
  },
  "environment": "development"
}
```

For external PostgreSQL with secrets masked:
```json
{
  "database": {
    "adapter": "postgres",
    "url": "postgres://user:***@localhost:5432/helpdesk",
    "pool_size": 20,
    "ssl_mode": "prefer"
  },
  "environment": "development"
}
```

**Masking rules:**
- Database URLs mask password portion: `postgres://user:***@host:5432/db`

---

## Use Cases

### Debugging Access Control

When a user can't access a resource, check the access rules:

1. Go to `/_dev/access`
2. Find the entity in question
3. Review the SQL predicate
4. Test the predicate directly in psql:
   ```sql
   SET app.user_id = 'user-uuid';
   SELECT * FROM tickets WHERE <paste-sql-predicate>;
   ```

### Understanding Business Rules

When an action is rejected:

1. Go to `/_dev/rules`
2. Find rules for the entity and operation
3. Check the CEL condition and SQL predicate
4. Review the associated message code
5. Go to `/_dev/messages` to see the user-facing error

### Verifying Schema Changes

After editing `.forge` files:

1. Run `forge build`
2. Go to `/_dev/schema` to see the new schema
3. Check `/_dev/database` for migration version

### Monitoring Real-time Connections

To see WebSocket activity:

1. Go to `/_dev/websocket`
2. View connection counts
3. See which views have active subscriptions
4. Monitor message throughput

---

## Best Practices

1. **Bookmark `/_dev`** - Quick access during development
2. **Use JSON for scripting** - Pipe to `jq` for filtering
3. **Check routes first** - When debugging 404s or access issues
4. **Check schema after build** - Verify entities and fields look correct
5. **Monitor WebSocket in dev** - Catch subscription leaks early

---

## Security Considerations

- **Never enable in production** - No configuration option exists intentionally
- **Secrets are masked** - But still avoid screenshots of config pages
- **SQL predicates exposed** - These compile from your `.forge` files, not secrets
- **Request bodies in errors** - May contain user data; cleared on restart
