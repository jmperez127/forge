import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function ViewsDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Views</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Views are real-time queries with built-in filtering, sorting, and cursor-based
        pagination. Define them once, subscribe from anywhere. Changes propagate
        automatically via WebSocket—no manual cache invalidation.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`view TicketList {
  source: Ticket
  filter: org == param.org_id and status != closed
  sort: -priority, created_at

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
              <td className="py-3 px-4">
                Server-side conditions for which records to include.
                Supports <code className="text-forge-400">param.*</code> references
                for parameterized views.
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">sort</td>
              <td className="py-3 px-4">
                Default sort order. Prefix field with <code className="text-forge-400">-</code> for
                descending. Comma-separated for multiple fields.
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">limit</td>
              <td className="py-3 px-4">Default page size (overridable per request)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">group</td>
              <td className="py-3 px-4">Group results by a field (for aggregation views)</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">fields</td>
              <td className="py-3 px-4">Which fields to include in the response</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Server-Side Filters</h2>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">filter:</code> clause defines conditions
        that are compiled into the database query. Use{" "}
        <code className="text-forge-400">param.*</code> references for values
        that come from the client at query time:
      </p>

      <CodeBlock
        code={`view OpenTickets {
  source: Ticket
  filter: status == "open"              # Static filter
  sort: -created_at
}

view OrgTickets {
  source: Ticket
  filter: org == param.org_id            # Parameterized filter
  sort: -priority, created_at
}

view UserTickets {
  source: Ticket
  filter: author == param.user_id and status in param.statuses
  sort: created_at
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Any <code className="text-forge-400">param.*</code> reference becomes
        a required query parameter. Requests that omit required parameters
        receive a 400 error.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">Sort Order</h2>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">sort:</code> clause sets the default
        ordering. Prefix a field name with <code className="text-forge-400">-</code>{" "}
        for descending order. Multiple fields are comma-separated:
      </p>

      <CodeBlock
        code={`view TicketList {
  source: Ticket
  sort: -priority, created_at        # Priority DESC, then created_at ASC
}

view RecentMessages {
  source: Message
  filter: channel == param.channel_id
  sort: -created_at                   # Newest first
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Nested Fields</h2>

      <p className="text-muted-foreground mb-4">
        Include related entity fields in the response:
      </p>

      <CodeBlock
        code={`view TicketDetail {
  source: Ticket
  filter: id == param.id

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

      {/* ------------------------------------------------------------------ */}
      {/* VIEW QUERY ENGINE                                                   */}
      {/* ------------------------------------------------------------------ */}

      <h2 className="text-2xl font-bold mt-12 mb-4">View Query Engine</h2>

      <p className="text-muted-foreground mb-4">
        Views return a structured response with items and pagination metadata.
        The client can apply additional filters, override sorting, and paginate
        through results using query parameters.
      </p>

      <h3 className="text-xl font-semibold mt-8 mb-3">Response Format</h3>

      <p className="text-muted-foreground mb-4">
        Every view endpoint returns an object with{" "}
        <code className="text-forge-400">items</code> and{" "}
        <code className="text-forge-400">pagination</code> instead of a flat array:
      </p>

      <CodeBlock
        filename="Response shape"
        language="json"
        code={`{
  "data": {
    "items": [
      { "id": "t1", "subject": "Login broken", "status": "open" },
      { "id": "t2", "subject": "CSS glitch", "status": "open" }
    ],
    "pagination": {
      "limit": 25,
      "has_next": true,
      "has_prev": false,
      "next_cursor": "eyJpZCI6InQyNSJ9",
      "prev_cursor": null,
      "total": null
    }
  }
}`}
      />

      <div className="bg-card border border-border rounded-xl p-6 my-8">
        <h4 className="font-semibold text-forge-400 mb-2">Cursor-Based Pagination</h4>
        <p className="text-sm text-muted-foreground">
          FORGE uses cursor-based (keyset) pagination rather than offset-based pagination.
          This provides stable results even when data is inserted or deleted between pages,
          and performs well on large datasets. The cursor is an opaque, base64-encoded token
          that the client passes back to fetch the next or previous page.
        </p>
      </div>

      <h3 className="text-xl font-semibold mt-8 mb-3">Client-Side Filtering</h3>

      <p className="text-muted-foreground mb-4">
        In addition to the server-side <code className="text-forge-400">filter:</code>{" "}
        clause in your .forge file, clients can apply filters at query time using
        the <code className="text-forge-400">filter</code> query parameter:
      </p>

      <CodeBlock
        filename="HTTP API"
        language="bash"
        code={`# Exact match
GET /api/views/TicketList?filter[status]=open

# Operator syntax: filter[field][op]=value
GET /api/views/TicketList?filter[priority][gte]=high
GET /api/views/TicketList?filter[created_at][gt]=2025-01-01T00:00:00Z

# Multiple filters (combined with AND)
GET /api/views/TicketList?filter[status]=open&filter[priority]=high

# Null check
GET /api/views/TicketList?filter[assignee][is_null]=true

# Pattern matching
GET /api/views/TicketList?filter[subject][like]=%25login%25

# IN operator (comma-separated values)
GET /api/views/TicketList?filter[status][in]=open,pending`}
      />

      <h4 className="text-lg font-semibold mt-6 mb-3">Filter Operators</h4>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Operator</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
              <th className="text-left py-3 px-4 font-semibold">Example</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">eq</td>
              <td className="py-3 px-4">Equal (default when no operator given)</td>
              <td className="py-3 px-4 font-mono text-xs">filter[status][eq]=open</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">neq</td>
              <td className="py-3 px-4">Not equal</td>
              <td className="py-3 px-4 font-mono text-xs">filter[status][neq]=closed</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">gt</td>
              <td className="py-3 px-4">Greater than</td>
              <td className="py-3 px-4 font-mono text-xs">filter[priority][gt]=medium</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">gte</td>
              <td className="py-3 px-4">Greater than or equal</td>
              <td className="py-3 px-4 font-mono text-xs">filter[created_at][gte]=2025-01-01</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">lt</td>
              <td className="py-3 px-4">Less than</td>
              <td className="py-3 px-4 font-mono text-xs">filter[priority][lt]=high</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">lte</td>
              <td className="py-3 px-4">Less than or equal</td>
              <td className="py-3 px-4 font-mono text-xs">filter[due_date][lte]=2025-12-31</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">like</td>
              <td className="py-3 px-4">SQL LIKE pattern match</td>
              <td className="py-3 px-4 font-mono text-xs">filter[subject][like]=%login%</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">in</td>
              <td className="py-3 px-4">Value in comma-separated list</td>
              <td className="py-3 px-4 font-mono text-xs">filter[status][in]=open,pending</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">is_null</td>
              <td className="py-3 px-4">Check for null (true/false)</td>
              <td className="py-3 px-4 font-mono text-xs">filter[assignee][is_null]=true</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-xl font-semibold mt-8 mb-3">Client-Side Sorting</h3>

      <p className="text-muted-foreground mb-4">
        Clients can override or extend the default sort order using the{" "}
        <code className="text-forge-400">sort</code> query parameter. Prefix a field
        with <code className="text-forge-400">-</code> for descending order.
        Multiple fields are comma-separated:
      </p>

      <CodeBlock
        filename="HTTP API"
        language="bash"
        code={`# Sort by created_at descending
GET /api/views/TicketList?sort=-created_at

# Sort by priority descending, then by created_at ascending
GET /api/views/TicketList?sort=-priority,created_at

# Combine with filters
GET /api/views/TicketList?filter[status]=open&sort=-priority`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">Pagination</h3>

      <p className="text-muted-foreground mb-4">
        Control page size with <code className="text-forge-400">limit</code> and
        navigate pages with <code className="text-forge-400">cursor</code>. To
        include the total count of matching records, pass{" "}
        <code className="text-forge-400">include=count</code>:
      </p>

      <CodeBlock
        filename="HTTP API"
        language="bash"
        code={`# First page with 10 items
GET /api/views/TicketList?limit=10

# First page with total count
GET /api/views/TicketList?limit=10&include=count

# Next page using cursor from previous response
GET /api/views/TicketList?limit=10&cursor=eyJpZCI6InQxMCJ9

# Previous page
GET /api/views/TicketList?limit=10&cursor=eyJpZCI6InQxIiwiZCI6InByZXYifQ==`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">View Parameters</h3>

      <p className="text-muted-foreground mb-4">
        Parameterized views require <code className="text-forge-400">param.*</code> query
        parameters. These map to the <code className="text-forge-400">param.*</code>{" "}
        references in the .forge filter clause:
      </p>

      <CodeBlock
        filename="HTTP API"
        language="bash"
        code={`# View definition uses param.org_id
# filter: org == param.org_id
GET /api/views/OrgTickets?param.org_id=uuid-here

# Combine parameters with client-side filters and sorting
GET /api/views/OrgTickets?param.org_id=uuid-here&filter[status]=open&sort=-priority&limit=25`}
      />

      {/* ------------------------------------------------------------------ */}
      {/* REACT SDK                                                          */}
      {/* ------------------------------------------------------------------ */}

      <h2 className="text-2xl font-bold mt-12 mb-4">React SDK</h2>

      <p className="text-muted-foreground mb-4">
        The React SDK provides two hooks for querying views:{" "}
        <code className="text-forge-400">useView</code> for full pagination
        support, and <code className="text-forge-400">useList</code> for simple
        cases where you just need the items.
      </p>

      <h3 className="text-xl font-semibold mt-8 mb-3">
        useView — Full Query Engine
      </h3>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">useView</code> hook returns items,
        pagination metadata, and navigation functions. It subscribes to real-time
        updates automatically.
      </p>

      <CodeBlock
        filename="React component"
        language="typescript"
        code={`import { useView } from '@forge/react';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
}

function TicketList({ orgId }: { orgId: string }) {
  const {
    items: tickets,
    pagination,
    loading,
    error,
    refetch,
    fetchNext,
    fetchPrev,
  } = useView<Ticket>('OrgTickets', {
    'param.org_id': orgId,
    filter: 'status=open',
    sort: '-priority,created_at',
    limit: '25',
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <ul>
        {tickets.map(ticket => (
          <TicketRow key={ticket.id} ticket={ticket} />
        ))}
      </ul>

      <div className="pagination">
        <button
          onClick={fetchPrev}
          disabled={!pagination?.has_prev}
        >
          Previous
        </button>
        <button
          onClick={fetchNext}
          disabled={!pagination?.has_next}
        >
          Next
        </button>
      </div>
    </div>
  );
}`}
      />

      <h4 className="text-lg font-semibold mt-6 mb-3">useView Return Type</h4>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Field</th>
              <th className="text-left py-3 px-4 font-semibold">Type</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">items</td>
              <td className="py-3 px-4 font-mono text-xs">T[]</td>
              <td className="py-3 px-4">The current page of results</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">pagination</td>
              <td className="py-3 px-4 font-mono text-xs">Pagination | undefined</td>
              <td className="py-3 px-4">Page metadata (limit, has_next, has_prev, cursors, total)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">loading</td>
              <td className="py-3 px-4 font-mono text-xs">boolean</td>
              <td className="py-3 px-4">True while the request is in flight</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">error</td>
              <td className="py-3 px-4 font-mono text-xs">ForgeError | undefined</td>
              <td className="py-3 px-4">Error object if the request failed</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">refetch</td>
              <td className="py-3 px-4 font-mono text-xs">() =&gt; Promise&lt;void&gt;</td>
              <td className="py-3 px-4">Re-fetch the current page from scratch</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">fetchNext</td>
              <td className="py-3 px-4 font-mono text-xs">() =&gt; Promise&lt;void&gt;</td>
              <td className="py-3 px-4">Navigate to the next page (no-op if has_next is false)</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">fetchPrev</td>
              <td className="py-3 px-4 font-mono text-xs">() =&gt; Promise&lt;void&gt;</td>
              <td className="py-3 px-4">Navigate to the previous page (no-op if has_prev is false)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4 className="text-lg font-semibold mt-6 mb-3">Pagination Object</h4>

      <CodeBlock
        filename="Type definition"
        language="typescript"
        code={`interface Pagination {
  limit: number;          // Page size
  has_next: boolean;      // True if there is a next page
  has_prev: boolean;      // True if there is a previous page
  next_cursor: string | null;  // Cursor for the next page
  prev_cursor: string | null;  // Cursor for the previous page
  total: number | null;   // Total count (only if include=count)
}`}
      />

      <h4 className="text-lg font-semibold mt-6 mb-3">ViewQueryParams</h4>

      <p className="text-muted-foreground mb-4">
        The params object passed to <code className="text-forge-400">useView</code>{" "}
        accepts the following keys:
      </p>

      <CodeBlock
        filename="Type definition"
        language="typescript"
        code={`interface ViewQueryParams {
  filter?: string;       // Client-side filter expression
  sort?: string;         // Sort fields (prefix - for DESC)
  limit?: string;        // Page size
  cursor?: string;       // Pagination cursor
  [key: \`param.\${string}\`]: string;  // View parameters
  [key: string]: string | undefined;
}`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">
        useList — Backward Compatible
      </h3>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">useList</code> hook is the original
        hook for querying views. It still works and extracts the items array
        automatically, so you do not need to change existing code:
      </p>

      <CodeBlock
        filename="React component"
        language="typescript"
        code={`import { useList } from '@forge/react';

function TicketList({ orgId }: { orgId: string }) {
  // useList returns { data, loading, error, refetch }
  // data is the items array directly (no pagination metadata)
  const { data: tickets, loading, error } = useList<Ticket>('TicketList', {
    'param.org_id': orgId,
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <ul>
      {tickets?.map(ticket => (
        <TicketRow key={ticket.id} ticket={ticket} />
      ))}
    </ul>
  );
}`}
      />

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 my-8">
        <h4 className="font-semibold text-amber-400 mb-2">Migrating from useList to useView</h4>
        <p className="text-sm text-muted-foreground">
          If you need pagination, switch from{" "}
          <code className="text-forge-400">useList</code> to{" "}
          <code className="text-forge-400">useView</code>. The main differences:{" "}
          <code className="text-forge-400">useList</code> returns{" "}
          <code className="text-forge-400">{"{ data: T[] }"}</code> while{" "}
          <code className="text-forge-400">useView</code> returns{" "}
          <code className="text-forge-400">{"{ items: T[], pagination }"}</code>{" "}
          plus <code className="text-forge-400">fetchNext</code> and{" "}
          <code className="text-forge-400">fetchPrev</code> functions.
          Both hooks subscribe to real-time updates.
        </p>
      </div>

      <h3 className="text-xl font-semibold mt-8 mb-3">
        Client SDK (Without React)
      </h3>

      <p className="text-muted-foreground mb-4">
        The base <code className="text-forge-400">@forge/client</code> SDK exposes
        the same query engine through <code className="text-forge-400">client.view()</code>:
      </p>

      <CodeBlock
        filename="Client SDK"
        language="typescript"
        code={`import { createClient } from '@forge/client';

const client = createClient({ url: 'http://localhost:8080' });

// Query with filters, sorting, and pagination
const result = await client.view<Ticket>('OrgTickets', {
  'param.org_id': orgId,
  filter: 'status=open',
  sort: '-priority,created_at',
  limit: '25',
});

console.log(result.items);       // Ticket[]
console.log(result.pagination);  // { limit, has_next, has_prev, ... }

// Fetch next page
if (result.pagination.has_next) {
  const page2 = await client.view<Ticket>('OrgTickets', {
    'param.org_id': orgId,
    filter: 'status=open',
    sort: '-priority,created_at',
    limit: '25',
    cursor: result.pagination.next_cursor!,
  });
}`}
      />

      {/* ------------------------------------------------------------------ */}
      {/* EXISTING SECTIONS (updated)                                        */}
      {/* ------------------------------------------------------------------ */}

      <h2 className="text-2xl font-bold mt-12 mb-4">Access Control</h2>

      <p className="text-muted-foreground mb-4">
        Views automatically respect access rules. If a user cannot read an entity,
        it will not appear in the view:
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
  filter: org == param.org_id

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
  filter: org == param.org_id
  group: status

  fields: {
    status
    count: count(*)
    avg_resolution_time: avg(closed_at - created_at)
  }
}

view DailyMessageCount {
  source: Message
  filter: channel == param.channel_id and created_at > param.since
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
        code={`# Query a view with parameters, filters, sorting, and pagination
GET /api/views/OrgTickets?param.org_id=uuid-here&filter[status]=open&sort=-priority&limit=25

# Response
{
  "data": {
    "items": [
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
    ],
    "pagination": {
      "limit": 25,
      "has_next": true,
      "has_prev": false,
      "next_cursor": "eyJpZCI6InQyNSJ9",
      "prev_cursor": null,
      "total": null
    }
  }
}

# Include total count
GET /api/views/OrgTickets?param.org_id=uuid-here&include=count

# Next page
GET /api/views/OrgTickets?param.org_id=uuid-here&limit=25&cursor=eyJpZCI6InQyNSJ9

# Subscribe via WebSocket
WS /ws
> { "type": "subscribe", "view": "OrgTickets" }

# Receive updates
< { "type": "data", "view": "OrgTickets", "items": [ ... ] }`}
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
