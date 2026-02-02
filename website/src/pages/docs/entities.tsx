import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function EntitiesDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Entities</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Entities define the shape of your data. They compile to database tables,
        TypeScript types, and validation rules—all from a single declaration.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`entity Ticket {
  subject: string length <= 120
  status: enum(open, pending, closed) = open
  priority: enum(low, medium, high) = medium
  description: string?
  created_at: time
  updated_at: time?
}`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Entities contain <strong className="text-foreground">only data</strong>. They have no behavior—that's
        what rules, actions, and hooks are for.
      </p>

      <h2 className="text-2xl font-bold mb-4">Field Types</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Type</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
              <th className="text-left py-3 px-4 font-semibold">PostgreSQL</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">string</td>
              <td className="py-3 px-4">Text data of any length</td>
              <td className="py-3 px-4 font-mono">TEXT</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">string length &lt;= N</td>
              <td className="py-3 px-4">Text with max length constraint</td>
              <td className="py-3 px-4 font-mono">VARCHAR(N)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">int</td>
              <td className="py-3 px-4">Integer numbers</td>
              <td className="py-3 px-4 font-mono">INTEGER</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">float</td>
              <td className="py-3 px-4">Decimal numbers</td>
              <td className="py-3 px-4 font-mono">DOUBLE PRECISION</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">bool</td>
              <td className="py-3 px-4">True/false</td>
              <td className="py-3 px-4 font-mono">BOOLEAN</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">time</td>
              <td className="py-3 px-4">Timestamp with timezone</td>
              <td className="py-3 px-4 font-mono">TIMESTAMPTZ</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">uuid</td>
              <td className="py-3 px-4">Unique identifier</td>
              <td className="py-3 px-4 font-mono">UUID</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">enum(...)</td>
              <td className="py-3 px-4">One of a set of values</td>
              <td className="py-3 px-4 font-mono">Custom ENUM type</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">file</td>
              <td className="py-3 px-4">File upload reference</td>
              <td className="py-3 px-4 font-mono">TEXT (stores URL/path)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Optional Fields</h2>

      <p className="text-muted-foreground mb-4">
        Add <code className="text-forge-400">?</code> after the type to make a field nullable:
      </p>

      <CodeBlock
        code={`entity User {
  name: string                # Required
  bio: string?                # Optional (can be null)
  avatar_url: string?         # Optional
  phone: string?              # Optional
}`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Optional fields are <code className="text-forge-400">NULL</code> in the database and
        <code className="text-forge-400"> | undefined</code> in TypeScript.
      </p>

      <h2 className="text-2xl font-bold mb-4">Default Values</h2>

      <p className="text-muted-foreground mb-4">
        Set defaults with <code className="text-forge-400">=</code>:
      </p>

      <CodeBlock
        code={`entity Ticket {
  status: enum(open, pending, closed) = open    # Enum default
  priority: enum(low, medium, high) = medium
  is_archived: bool = false                     # Boolean default
  view_count: int = 0                           # Integer default
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Unique Constraints</h2>

      <p className="text-muted-foreground mb-4">
        Mark fields that must be unique across all records:
      </p>

      <CodeBlock
        code={`entity User {
  email: string unique           # Must be unique
  username: string unique        # Must be unique
  name: string                   # Not unique
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Timestamps</h2>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">time</code> type is for timestamps. FORGE automatically
        handles <code className="text-forge-400">created_at</code> fields:
      </p>

      <CodeBlock
        code={`entity Message {
  content: string
  created_at: time        # Automatically set on create
  edited_at: time?        # Optional, set manually
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Enums</h2>

      <p className="text-muted-foreground mb-4">
        Enums define a fixed set of possible values:
      </p>

      <CodeBlock
        code={`entity Order {
  status: enum(
    pending,
    confirmed,
    shipped,
    delivered,
    cancelled
  ) = pending

  payment_method: enum(card, bank_transfer, crypto)
}`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Enums compile to PostgreSQL ENUM types and TypeScript union types like
        <code className="text-forge-400">'pending' | 'confirmed' | ...</code>
      </p>

      <h2 className="text-2xl font-bold mb-4">What Entities Cannot Do</h2>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
        <p className="text-sm text-muted-foreground mb-4">
          Entities are deliberately limited. They cannot:
        </p>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>• <strong className="text-foreground">Contain methods</strong> — use actions instead</li>
          <li>• <strong className="text-foreground">Have computed fields</strong> — use views instead</li>
          <li>• <strong className="text-foreground">Define validation logic</strong> — use rules instead</li>
          <li>• <strong className="text-foreground">Specify access control</strong> — use access rules instead</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          This separation keeps your spec clean and each concern in its proper place.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Generated Output</h2>

      <p className="text-muted-foreground mb-4">
        From a simple entity definition, FORGE generates:
      </p>

      <CodeBlock
        filename="Generated PostgreSQL"
        language="sql"
        code={`CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high');

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject VARCHAR(120) NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);`}
      />

      <CodeBlock
        filename="Generated TypeScript"
        language="typescript"
        className="mt-4"
        code={`export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  description?: string;
  created_at: Date;
  updated_at?: Date;
}`}
      />
    </DocsLayout>
  );
}
