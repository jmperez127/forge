import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function RelationsDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Relations</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Relations connect entities together, creating foreign keys in the database
        and enabling path-based access control.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`# One-to-one / Many-to-one
relation Ticket.author -> User
relation Ticket.assignee -> User
relation Ticket.org -> Organization

# One-to-many
relation Organization.tickets -> Ticket many
relation User.messages -> Message many`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">How Relations Work</h2>

      <p className="text-muted-foreground mb-4">
        When you write <code className="text-forge-400">relation Ticket.author -&gt; User</code>, FORGE:
      </p>

      <ul className="space-y-2 text-muted-foreground mb-8">
        <li>• Creates an <code className="text-forge-400">author_id UUID</code> column on the tickets table</li>
        <li>• Adds a foreign key constraint to the users table</li>
        <li>• Generates type-safe accessors in the SDK</li>
        <li>• Enables path traversal in rules and access control</li>
      </ul>

      <CodeBlock
        filename="Generated SQL"
        language="sql"
        code={`ALTER TABLE tickets
ADD COLUMN author_id UUID NOT NULL
REFERENCES users(id);

CREATE INDEX idx_tickets_author_id ON tickets(author_id);`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Relation Cardinality</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">Many-to-One (Default)</h3>

      <p className="text-muted-foreground mb-4">
        The default relation type. Many tickets can have one author:
      </p>

      <CodeBlock
        code={`relation Ticket.author -> User
# Many tickets → One user
# Creates author_id on tickets table`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">One-to-Many</h3>

      <p className="text-muted-foreground mb-4">
        Use <code className="text-forge-400">many</code> keyword for the reverse direction:
      </p>

      <CodeBlock
        code={`relation Organization.members -> User many
# One org → Many users
# Creates org_id on users table (inverse side)`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Many-to-Many</h3>

      <p className="text-muted-foreground mb-4">
        For many-to-many, create a junction entity:
      </p>

      <CodeBlock
        code={`# Instead of direct many-to-many:
entity Membership {
  role: enum(member, admin, owner) = member
  joined_at: time
}

relation Membership.user -> User
relation Membership.org -> Organization

# Now you can traverse:
# User -> memberships -> org
# Organization -> memberships -> user`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Path Traversal</h2>

      <p className="text-muted-foreground mb-4">
        Relations enable path expressions in access rules, rules, and views:
      </p>

      <CodeBlock
        code={`# Define the relations
relation Ticket.org -> Organization
relation Organization.members -> User many

# Use paths in access rules
access Ticket {
  read: user in org.members    # Traverse: Ticket → org → members
  write: user == author
}

# Use paths in views
view TicketList {
  source: Ticket
  fields: {
    subject
    status
    author.name            # Include related user's name
    org.name               # Include related org's name
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Optional Relations</h2>

      <p className="text-muted-foreground mb-4">
        Some relations are optional (nullable foreign key):
      </p>

      <CodeBlock
        code={`entity Ticket {
  subject: string
  status: enum(open, pending, closed) = open
}

relation Ticket.author -> User              # Required
relation Ticket.assignee -> User optional   # Optional (can be null)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Self-Referential Relations</h2>

      <p className="text-muted-foreground mb-4">
        Entities can relate to themselves:
      </p>

      <CodeBlock
        code={`entity Comment {
  content: string
  created_at: time
}

relation Comment.author -> User
relation Comment.parent -> Comment optional   # Replies to other comments
relation Comment.replies -> Comment many      # Get all replies`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Cascade Behavior</h2>

      <p className="text-muted-foreground mb-4">
        Control what happens when related entities are deleted:
      </p>

      <CodeBlock
        code={`relation Message.channel -> Channel cascade    # Delete messages when channel deleted
relation Ticket.org -> Organization restrict   # Prevent org deletion if tickets exist
relation User.avatar -> File nullify           # Set to null when file deleted`}
      />

      <div className="overflow-x-auto mt-6 mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Option</th>
              <th className="text-left py-3 px-4 font-semibold">Behavior</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">restrict</td>
              <td className="py-3 px-4">Prevent deletion if related records exist (default)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">cascade</td>
              <td className="py-3 px-4">Delete related records automatically</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">nullify</td>
              <td className="py-3 px-4">Set the foreign key to null (requires optional relation)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Generated TypeScript</h2>

      <CodeBlock
        filename="Generated SDK"
        language="typescript"
        code={`interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';

  // Relations become typed properties
  author: User;
  author_id: string;

  assignee?: User;       // Optional relation
  assignee_id?: string;

  org: Organization;
  org_id: string;
}

// Path traversal in queries
const tickets = await client.list('TicketList', {
  include: ['author', 'org']  // Eager load relations
});

// Type-safe access
tickets[0].author.name;    // string
tickets[0].org.name;       // string`}
      />

      <div className="bg-card border border-border rounded-xl p-6 mt-8">
        <h3 className="font-semibold text-forge-400 mb-2">Why Relations Matter</h3>
        <p className="text-sm text-muted-foreground">
          Relations aren't just foreign keys—they're the foundation of your access control.
          When you write <code className="text-forge-300">user in org.members</code>, FORGE compiles that
          path traversal into an efficient SQL join that runs inside the database.
          There's no middleware, no N+1 queries, just a single optimized query.
        </p>
      </div>
    </DocsLayout>
  );
}
