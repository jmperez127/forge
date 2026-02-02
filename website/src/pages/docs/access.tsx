import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function AccessDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Access Control</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Access rules compile to PostgreSQL Row Level Security policies. They're enforced at the
        database level—not middleware that can be bypassed.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
  delete: user.role == admin
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Operations</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Operation</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">read</td>
              <td className="py-3 px-4">Controls visibility in queries, lists, and subscriptions</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">write</td>
              <td className="py-3 px-4">Controls create and update operations</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">create</td>
              <td className="py-3 px-4">Controls creation only (overrides write for creates)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">update</td>
              <td className="py-3 px-4">Controls updates only (overrides write for updates)</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">delete</td>
              <td className="py-3 px-4">Controls deletion</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">The user Variable</h2>

      <p className="text-muted-foreground mb-4">
        In access rules, <code className="text-forge-400">user</code> refers to the authenticated user:
      </p>

      <CodeBlock
        code={`access Profile {
  # Only the owner can see their own profile
  read: user == this

  # Only the owner can edit
  write: user == this
}

access Task {
  # Check user properties
  read: user.is_active == true
  write: user.role in [admin, editor]
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Path Expressions</h2>

      <p className="text-muted-foreground mb-4">
        Traverse relations to check access:
      </p>

      <CodeBlock
        code={`access Ticket {
  # User must be a member of the ticket's organization
  read: user in org.members

  # User is author OR user is in the org AND has agent role
  write: user == author or (user in org.members and user.role == agent)
}

access Message {
  # Traverse multiple relations
  read: user in channel.workspace.members
  write: user == author
}

access Comment {
  # Access through parent entity
  read: user in ticket.org.members
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Operators</h2>

      <CodeBlock
        code={`access Document {
  # Equality
  read: user == owner

  # Membership
  read: user in team.members

  # Property check
  read: user.role == admin

  # Logical AND
  read: user in org.members and org.plan != free

  # Logical OR
  write: user == owner or user.role == admin

  # Negation
  read: user.is_banned != true

  # Combined
  write: (user == owner or user.role == admin) and org.is_active == true
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Public Access</h2>

      <p className="text-muted-foreground mb-4">
        For publicly readable entities:
      </p>

      <CodeBlock
        code={`access BlogPost {
  # Anyone can read published posts
  read: status == published

  # Only author can write
  write: user == author
}

access PublicProfile {
  # Always readable
  read: true

  # Only owner can write
  write: user == this
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Hierarchical Access</h2>

      <p className="text-muted-foreground mb-4">
        Common pattern for multi-tenant applications:
      </p>

      <CodeBlock
        code={`# Organization hierarchy
entity Organization {
  name: string
}

entity Workspace {
  name: string
}

relation Workspace.org -> Organization
relation Workspace.members -> User many

entity Channel {
  name: string
}

relation Channel.workspace -> Workspace

entity Message {
  content: string
}

relation Message.channel -> Channel
relation Message.author -> User

# Access follows the hierarchy
access Workspace {
  read: user in members
  write: user in org.admins
}

access Channel {
  read: user in workspace.members
  write: user in workspace.members
}

access Message {
  read: user in channel.workspace.members
  write: user == author
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">How It's Enforced</h2>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-forge-400 mb-3">Database-Level Security</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Access rules compile to PostgreSQL Row Level Security (RLS) policies:
        </p>
        <ol className="text-sm text-muted-foreground space-y-2">
          <li>1. The user's ID is set in a session variable on each request</li>
          <li>2. RLS policies use this variable to filter all queries</li>
          <li>3. Unauthorized rows are invisible—not filtered, <em>invisible</em></li>
          <li>4. This applies to all access: API, jobs, even direct SQL</li>
        </ol>
      </div>

      <h2 className="text-2xl font-bold mb-4">Generated SQL</h2>

      <p className="text-muted-foreground mb-4">
        This access rule:
      </p>

      <CodeBlock
        code={`access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Compiles to:
      </p>

      <CodeBlock
        filename="Generated PostgreSQL RLS"
        language="sql"
        code={`-- Enable RLS on table
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Read policy
CREATE POLICY ticket_read ON tickets
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.org_id = tickets.org_id
    AND org_members.user_id = current_setting('app.user_id')::uuid
  )
);

-- Write policy
CREATE POLICY ticket_write ON tickets
FOR ALL USING (
  tickets.author_id = current_setting('app.user_id')::uuid
  OR EXISTS (
    SELECT 1 FROM users
    WHERE users.id = current_setting('app.user_id')::uuid
    AND users.role = 'agent'
  )
);`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Testing Access Rules</h2>

      <CodeBlock
        code={`test Ticket.access {
  given user not in org.members
  when read Ticket
  expect deny
}

test Ticket.access {
  given user in org.members
  when read Ticket
  expect allow
}

test Ticket.access {
  given user == author
  when update Ticket
  expect allow
}

test Ticket.access {
  given user != author and user.role != agent
  when update Ticket
  expect deny
}`}
      />

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-emerald-400 mb-2">Security Guarantee</h4>
        <p className="text-sm text-muted-foreground">
          Because access rules compile to RLS policies, they're enforced by PostgreSQL itself.
          There's no API endpoint, job, or raw SQL query that can bypass them.
          Unauthorized data doesn't just get filtered—it's mathematically impossible to access.
        </p>
      </div>
    </DocsLayout>
  );
}
