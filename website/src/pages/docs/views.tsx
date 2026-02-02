import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function ViewsDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Views</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Views are real-time queries. Define them once, subscribe from anywhere.
        Changes propagate automatically via WebSocket—no manual cache invalidation.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`view TicketList {
  source: Ticket
  filter: org == $org and status != closed
  order: created_at desc
  limit: 50

  fields: {
    id
    subject
    status
    priority
    created_at
    author {
      id
      name
      avatar_url
    }
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">View Properties</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Property</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">source</td>
              <td className="py-3 px-4">The entity this view queries</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">filter</td>
              <td className="py-3 px-4">Conditions for which records to include</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">order</td>
              <td className="py-3 px-4">Sort order (field + asc/desc)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">limit</td>
              <td className="py-3 px-4">Maximum number of records</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">fields</td>
              <td className="py-3 px-4">Which fields to include in the response</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Parameters</h2>

      <p className="text-muted-foreground mb-4">
        Views can accept parameters using <code className="text-forge-400">$param</code> syntax:
      </p>

      <CodeBlock
        code={`view ChannelMessages {
  source: Message
  filter: channel == $channel    # Required parameter
  order: created_at asc
  limit: 100

  fields: {
    id
    content
    created_at
    author { id, name, avatar_url }
  }
}

view UserTickets {
  source: Ticket
  filter: author == $user and status in $statuses
  order: created_at desc

  fields: { id, subject, status, created_at }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Nested Fields</h2>

      <p className="text-muted-foreground mb-4">
        Include related entity fields in the response:
      </p>

      <CodeBlock
        code={`view TicketDetail {
  source: Ticket
  filter: id == $id

  fields: {
    id
    subject
    description
    status
    priority
    created_at
    updated_at

    # Include author details
    author {
      id
      name
      email
      avatar_url
    }

    # Include assignee if present
    assignee {
      id
      name
    }

    # Include organization
    org {
      id
      name
      logo_url
    }

    # Include recent comments
    comments {
      id
      content
      created_at
      author { id, name }
    }
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Subscribing to Views</h2>

      <p className="text-muted-foreground mb-4">
        Views are real-time by default. Use the React hooks:
      </p>

      <CodeBlock
        filename="React component"
        language="typescript"
        code={`import { useList, useGet } from '@forge/react';

function TicketList({ orgId }: { orgId: string }) {
  // Subscribe to a list view
  const { data: tickets, loading, error } = useList('TicketList', {
    org: orgId    // Pass parameters
  });

  // Updates arrive automatically when:
  // - A new ticket is created in this org
  // - An existing ticket is updated
  // - A ticket is deleted

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {tickets.map(ticket => (
        <TicketRow key={ticket.id} ticket={ticket} />
      ))}
    </ul>
  );
}

function TicketDetail({ ticketId }: { ticketId: string }) {
  // Subscribe to a single item
  const { data: ticket, loading } = useGet('TicketDetail', {
    id: ticketId
  });

  // Updates when this specific ticket changes

  if (loading) return <Spinner />;
  return <TicketCard ticket={ticket} />;
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Access Control</h2>

      <p className="text-muted-foreground mb-4">
        Views automatically respect access rules. If a user can't read an entity,
        it won't appear in the view:
      </p>

      <CodeBlock
        code={`access Ticket {
  read: user in org.members
}

view TicketList {
  source: Ticket
  # No need to repeat access logic here—
  # tickets from other orgs are automatically excluded
}`}
      />

      <div className="bg-card border border-border rounded-xl p-6 my-8">
        <h4 className="font-semibold text-forge-400 mb-2">Real-Time + Access Control</h4>
        <p className="text-sm text-muted-foreground">
          When a ticket is created, FORGE checks which subscribed users have read access.
          Only those users receive the real-time update. This happens at the database level,
          not in application code.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Computed Fields</h2>

      <p className="text-muted-foreground mb-4">
        Views can include computed values:
      </p>

      <CodeBlock
        code={`view TicketList {
  source: Ticket
  filter: org == $org

  fields: {
    id
    subject
    status

    # Count related entities
    comment_count: count(comments)

    # Check conditions
    is_overdue: due_date < now() and status != closed

    # Aggregate
    time_open: now() - created_at
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Aggregation Views</h2>

      <p className="text-muted-foreground mb-4">
        Create summary views with aggregations:
      </p>

      <CodeBlock
        code={`view TicketStats {
  source: Ticket
  filter: org == $org
  group: status

  fields: {
    status
    count: count(*)
    avg_resolution_time: avg(closed_at - created_at)
  }
}

view DailyMessageCount {
  source: Message
  filter: channel == $channel and created_at > $since
  group: date(created_at)

  fields: {
    date: date(created_at)
    message_count: count(*)
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Generated API</h2>

      <CodeBlock
        filename="HTTP API"
        language="bash"
        code={`# Query a view
GET /api/views/TicketList?org=uuid-here

# Response
{
  "data": [
    {
      "id": "ticket-uuid",
      "subject": "Login not working",
      "status": "open",
      "priority": "high",
      "author": {
        "id": "user-uuid",
        "name": "Jane Doe"
      }
    }
  ]
}

# Subscribe via WebSocket
WS /api/subscribe
> { "view": "TicketList", "params": { "org": "uuid" } }

# Receive updates
< { "type": "insert", "data": { ... } }
< { "type": "update", "data": { ... } }
< { "type": "delete", "id": "ticket-uuid" }`}
      />

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-emerald-400 mb-2">No Manual Cache Invalidation</h4>
        <p className="text-sm text-muted-foreground">
          Traditional apps require you to manually invalidate caches when data changes.
          With FORGE views, the runtime tracks dependencies and pushes diffs automatically.
          Your UI stays in sync without any extra code.
        </p>
      </div>
    </DocsLayout>
  );
}
