import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function DevModeDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Development Mode</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Development mode provides hot reload, introspection tools, and debugging capabilities
        that make building FORGE apps fast and transparent.
      </p>

      <h2 className="text-2xl font-bold mb-4">Starting Dev Mode</h2>

      <CodeBlock
        language="bash"
        code={`# Start development server with hot reload
forge dev

# Output:
Starting FORGE development server...
Build successful!
Server running at http://localhost:8080
Dev tools at http://localhost:8080/_dev
Watching for changes...`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Edit any <code className="text-forge-400">.forge</code> file and changes apply immediately:
      </p>

      <CodeBlock
        language="bash"
        code={`# Edit spec/app.forge
File changed: spec/app.forge
Rebuilding...
Rebuild successful!
Schema updated (1 migration applied)
SDK regenerated`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Dev Info Dashboard</h2>

      <p className="text-muted-foreground mb-4">
        When <code className="text-forge-400">FORGE_ENV=development</code> (the default),
        the runtime exposes introspection endpoints at <code className="text-forge-400">/_dev</code>:
      </p>

      <CodeBlock
        language="bash"
        code={`# Open dashboard in browser
open http://localhost:8080/_dev`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        The dashboard provides a visual overview of your application—entities, routes, views,
        database status, and active WebSocket connections.
      </p>

      <h2 className="text-2xl font-bold mb-4">API Endpoints</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/info</h3>

      <p className="text-muted-foreground mb-4">
        Application metadata and build info:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/info

{
  "app_name": "MyApp",
  "version": "1.0.0",
  "forge_version": "0.1.0",
  "build_time": "2024-01-15T10:30:00Z",
  "environment": "development",
  "entities": 5,
  "actions": 12,
  "views": 8
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/routes</h3>

      <p className="text-muted-foreground mb-4">
        All generated API routes with their access rules:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/routes

{
  "routes": [
    {
      "method": "GET",
      "path": "/api/views/TicketList",
      "access": "user in org.members",
      "params": ["org"]
    },
    {
      "method": "POST",
      "path": "/api/actions/close_ticket",
      "access": "user == author or user.role == agent",
      "input": ["Ticket"]
    }
  ]
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/schema</h3>

      <p className="text-muted-foreground mb-4">
        Database schema with all entities, fields, and relations:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/schema

{
  "entities": [
    {
      "name": "Ticket",
      "table": "tickets",
      "fields": [
        { "name": "id", "type": "uuid", "primary": true },
        { "name": "subject", "type": "string", "max_length": 120 },
        { "name": "status", "type": "enum", "values": ["open", "pending", "closed"] }
      ],
      "relations": [
        { "name": "author", "target": "User", "type": "many_to_one" },
        { "name": "org", "target": "Organization", "type": "many_to_one" }
      ]
    }
  ]
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/actions</h3>

      <p className="text-muted-foreground mb-4">
        All defined actions with their inputs and effects:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/actions

{
  "actions": [
    {
      "name": "close_ticket",
      "input": [{ "name": "Ticket", "type": "entity" }],
      "operations": ["update Ticket"],
      "triggers_hooks": ["Ticket.after_update"]
    },
    {
      "name": "send_message",
      "input": [
        { "name": "Channel", "type": "entity" },
        { "name": "content", "type": "string" }
      ],
      "operations": ["create Message"],
      "triggers_hooks": ["Message.after_create"]
    }
  ]
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/rules</h3>

      <p className="text-muted-foreground mb-4">
        Business rules and their conditions:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/rules

{
  "rules": [
    {
      "entity": "Ticket",
      "operation": "update",
      "condition": "status == closed",
      "effect": "forbid",
      "message": "TICKET_CLOSED"
    }
  ]
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/access</h3>

      <p className="text-muted-foreground mb-4">
        Access control rules for all entities:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/access

{
  "policies": [
    {
      "entity": "Ticket",
      "read": "user in org.members",
      "write": "user == author or user.role == agent",
      "delete": "user.role == admin"
    }
  ]
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/database</h3>

      <p className="text-muted-foreground mb-4">
        Database connection status and statistics:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/database

{
  "status": "connected",
  "host": "localhost:5432",
  "database": "myapp_dev",
  "pool": {
    "size": 10,
    "in_use": 2,
    "idle": 8
  },
  "migrations": {
    "applied": 5,
    "pending": 0,
    "last_applied": "005_add_priority"
  }
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">/_dev/websocket</h3>

      <p className="text-muted-foreground mb-4">
        Active WebSocket connections and subscriptions:
      </p>

      <CodeBlock
        language="bash"
        code={`$ curl http://localhost:8080/_dev/websocket

{
  "connections": 3,
  "subscriptions": [
    {
      "view": "TicketList",
      "params": { "org": "uuid-1" },
      "subscribers": 2
    },
    {
      "view": "MessageFeed",
      "params": { "channel": "uuid-2" },
      "subscribers": 1
    }
  ]
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Production Mode</h2>

      <p className="text-muted-foreground mb-4">
        In production, dev endpoints are disabled:
      </p>

      <CodeBlock
        language="bash"
        code={`# Production mode - /_dev returns 404
FORGE_ENV=production forge run

$ curl http://localhost:8080/_dev
404 Not Found`}
      />

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-amber-400 mb-2">Security Note</h4>
        <p className="text-sm text-muted-foreground">
          Dev endpoints expose your application's internal structure. They are automatically
          disabled in production (<code className="text-amber-300">FORGE_ENV=production</code>).
          Never expose dev endpoints in a production environment.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Hot Reload Behavior</h2>

      <p className="text-muted-foreground mb-4">
        When you modify a <code className="text-forge-400">.forge</code> file in dev mode:
      </p>

      <div className="space-y-3 mb-8">
        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">1</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Recompile</h4>
            <p className="text-sm text-muted-foreground">Spec is re-parsed, analyzed, and compiled</p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">2</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Migrate</h4>
            <p className="text-sm text-muted-foreground">Database schema changes applied automatically</p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">3</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Regenerate SDK</h4>
            <p className="text-sm text-muted-foreground">TypeScript types and client updated</p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">4</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Reload Runtime</h4>
            <p className="text-sm text-muted-foreground">New artifact loaded, existing connections preserved</p>
          </div>
        </div>
      </div>

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
        <h4 className="font-semibold text-emerald-400 mb-2">Instant Feedback</h4>
        <p className="text-sm text-muted-foreground">
          The entire reload cycle typically completes in under 500ms. Save your file,
          and your app is already running the new code. No server restart, no container rebuild,
          no deployment pipeline—just immediate feedback.
        </p>
      </div>
    </DocsLayout>
  );
}
