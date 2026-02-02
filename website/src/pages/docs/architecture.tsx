import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function ArchitectureDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Architecture</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Understanding how FORGE works under the hood—from spec to running application.
      </p>

      <h2 className="text-2xl font-bold mb-4">The Big Picture</h2>

      <CodeBlock
        language="bash"
        code={`.forge files → COMPILER → Runtime Artifact → SEALED RUNTIME
                     ↓
               Frontend SDK (@forge/client, @forge/react)`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        You write <code className="text-forge-400">.forge</code> specs. The compiler produces an artifact.
        The runtime executes that artifact. There's no application code in between.
      </p>

      <h2 className="text-2xl font-bold mb-4">Compiler Pipeline</h2>

      <p className="text-muted-foreground mb-4">
        The compiler transforms your spec through five stages:
      </p>

      <CodeBlock
        language="bash"
        code={`.parse → .analyze → .normalize → .plan → .emit`}
      />

      <div className="space-y-4 mb-8">
        <div className="p-4 bg-muted/30 rounded-lg border border-border">
          <h4 className="font-semibold text-forge-400 mb-2">1. Parse</h4>
          <p className="text-sm text-muted-foreground">
            Tokenize and parse <code className="text-forge-300">.forge</code> files into an Abstract Syntax Tree (AST).
            Uses recursive descent with Pratt parsing for expressions. Reports syntax errors with
            line numbers and suggestions.
          </p>
        </div>

        <div className="p-4 bg-muted/30 rounded-lg border border-border">
          <h4 className="font-semibold text-forge-400 mb-2">2. Analyze</h4>
          <p className="text-sm text-muted-foreground">
            Semantic analysis: resolve entity references, validate relation paths, type-check
            expressions, detect undefined references. Builds a symbol table of all declarations.
          </p>
        </div>

        <div className="p-4 bg-muted/30 rounded-lg border border-border">
          <h4 className="font-semibold text-forge-400 mb-2">3. Normalize</h4>
          <p className="text-sm text-muted-foreground">
            Apply defaults, derive implicit effects, expand shorthand syntax. After normalization,
            the spec is complete—no implicit behavior remains.
          </p>
        </div>

        <div className="p-4 bg-muted/30 rounded-lg border border-border">
          <h4 className="font-semibold text-forge-400 mb-2">4. Plan</h4>
          <p className="text-sm text-muted-foreground">
            Build action graphs showing data dependencies. Generate migration plan by comparing
            to previous build. Compute view dependency graph for real-time updates.
          </p>
        </div>

        <div className="p-4 bg-muted/30 rounded-lg border border-border">
          <h4 className="font-semibold text-forge-400 mb-2">5. Emit</h4>
          <p className="text-sm text-muted-foreground">
            Generate runtime artifact (JSON), SQL schema, RLS policies, migration files,
            and TypeScript SDK. All outputs are derived from the same analyzed spec.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Runtime Artifact</h2>

      <p className="text-muted-foreground mb-4">
        The compiled artifact is a self-contained JSON file containing everything
        the runtime needs:
      </p>

      <CodeBlock
        filename=".forge/artifact.json (simplified)"
        language="json"
        code={`{
  "version": "1.0.0",
  "app": {
    "name": "MyApp",
    "auth": "oauth"
  },
  "entities": {
    "Ticket": {
      "table": "tickets",
      "fields": [...],
      "relations": [...]
    }
  },
  "rules": {
    "Ticket.update": [
      { "condition": "status == 'closed'", "effect": "forbid", "message": "TICKET_CLOSED" }
    ]
  },
  "access": {
    "Ticket": {
      "read": { "sql": "EXISTS (SELECT 1 FROM org_members WHERE ...)" },
      "write": { "sql": "author_id = current_user_id() OR ..." }
    }
  },
  "actions": [...],
  "views": [...],
  "hooks": [...],
  "messages": [...]
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Request Flow</h2>

      <p className="text-muted-foreground mb-4">
        When an API request arrives, the runtime executes this flow:
      </p>

      <CodeBlock
        language="bash"
        code={`HTTP Request
    ↓
Authentication (set app.user_id in PostgreSQL session)
    ↓
Load Action from Artifact
    ↓
Evaluate Access Rules (SQL predicates)
    ↓
Begin Transaction
    ↓
Execute Action (creates/updates/deletes)
    ↓
Evaluate Business Rules (compiled to SQL)
    ↓
Commit or Rollback (based on rule results)
    ↓
Trigger Hooks → Enqueue Jobs
    ↓
Emit Realtime Events (WebSocket)
    ↓
Return Response (JSON with messages)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Database Integration</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">Row Level Security</h3>

      <p className="text-muted-foreground mb-4">
        Access rules compile to PostgreSQL RLS policies:
      </p>

      <CodeBlock
        code={`access Ticket {
  read: user in org.members
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Becomes:
      </p>

      <CodeBlock
        language="sql"
        code={`-- Set user context on each request
SET app.user_id = 'uuid-of-authenticated-user';

-- RLS policy (always active)
CREATE POLICY ticket_read ON tickets
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = tickets.org_id
    AND user_id = current_setting('app.user_id')::uuid
  )
);`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Rule Enforcement</h3>

      <p className="text-muted-foreground mb-4">
        Business rules compile to triggers:
      </p>

      <CodeBlock
        code={`rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Becomes:
      </p>

      <CodeBlock
        language="sql"
        code={`CREATE FUNCTION enforce_ticket_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'TICKET_CLOSED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_update_rules
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION enforce_ticket_rules();`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Real-Time System</h2>

      <p className="text-muted-foreground mb-4">
        The runtime tracks view subscriptions and pushes updates:
      </p>

      <div className="space-y-3 mb-8">
        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">1</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Client Subscribes</h4>
            <p className="text-sm text-muted-foreground">
              <code className="text-forge-300">useList('TicketList', {'{org: orgId}'})</code> opens WebSocket subscription
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">2</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Action Executes</h4>
            <p className="text-sm text-muted-foreground">
              Another user creates a ticket in the same org
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">3</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Runtime Checks Access</h4>
            <p className="text-sm text-muted-foreground">
              For each subscriber, verify they have read access to the new ticket
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">4</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Push Update</h4>
            <p className="text-sm text-muted-foreground">
              Authorized subscribers receive the new ticket via WebSocket
            </p>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">SDK Generation</h2>

      <p className="text-muted-foreground mb-4">
        The compiler generates a fully typed TypeScript SDK:
      </p>

      <CodeBlock
        filename="Generated types"
        language="typescript"
        code={`// Entity types
export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: Date;
  author: User;
  org: Organization;
}

// Action input types
export interface CloseTicketInput {
  Ticket: string;
}

// View result types
export interface TicketListItem {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  author: { id: string; name: string };
}`}
      />

      <CodeBlock
        filename="Generated hooks"
        language="typescript"
        className="mt-4"
        code={`// Type-safe hooks
export function useList<V extends ViewName>(
  view: V,
  params: ViewParams[V]
): { data: ViewResult[V][]; loading: boolean; error?: Error };

export function useAction<A extends ActionName>(
  action: A
): (input: ActionInput[A]) => Promise<ActionResult>;`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Tech Stack</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Component</th>
              <th className="text-left py-3 px-4 font-semibold">Technology</th>
              <th className="text-left py-3 px-4 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Compiler</td>
              <td className="py-3 px-4">Go</td>
              <td className="py-3 px-4">Fast compilation, single binary distribution</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Runtime</td>
              <td className="py-3 px-4">Go + chi + pgx</td>
              <td className="py-3 px-4">High performance, PostgreSQL-native</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Database</td>
              <td className="py-3 px-4">PostgreSQL + RLS</td>
              <td className="py-3 px-4">Row-level security for access control</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Jobs</td>
              <td className="py-3 px-4">Asynq (Redis)</td>
              <td className="py-3 px-4">Reliable background job processing</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Real-time</td>
              <td className="py-3 px-4">gorilla/websocket</td>
              <td className="py-3 px-4">Battle-tested WebSocket implementation</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-semibold text-foreground">Frontend SDK</td>
              <td className="py-3 px-4">TypeScript + React</td>
              <td className="py-3 px-4">Type-safe client with hooks</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h4 className="font-semibold text-forge-400 mb-2">The Sealed Runtime</h4>
        <p className="text-sm text-muted-foreground">
          "Sealed" means the runtime only does what the artifact says. There's no plugin system,
          no middleware hooks, no way to inject custom code into the request path. This is
          intentional: it means your spec is the complete truth. If it's not in the spec,
          it doesn't happen. Rules can't be bypassed, access can't be circumvented, and
          behavior is deterministic.
        </p>
      </div>
    </DocsLayout>
  );
}
