import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function CLIDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">CLI Reference</h1>

      <p className="text-xl text-muted-foreground mb-8">
        The FORGE CLI is your interface to the compiler and runtime. All operations—building,
        running, testing, migrating—go through these commands.
      </p>

      <h2 className="text-2xl font-bold mb-4">Installation</h2>

      <CodeBlock
        language="bash"
        code={`# Install via curl
curl -fsSL https://forge-lang.dev/install.sh | sh

# Verify installation
forge --version`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Commands</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">forge init</h3>

      <p className="text-muted-foreground mb-4">
        Create a new FORGE project:
      </p>

      <CodeBlock
        language="bash"
        code={`# Create new project
forge init myapp

# Create in current directory
forge init .

# With specific template
forge init myapp --template chat`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Creates this structure:
      </p>

      <CodeBlock
        language="bash"
        code={`myapp/
├── spec/
│   └── app.forge        # Your application spec
├── web/                 # Frontend scaffold
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── forge.toml           # Runtime configuration
└── .gitignore`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge check</h3>

      <p className="text-muted-foreground mb-4">
        Validate your spec without building:
      </p>

      <CodeBlock
        language="bash"
        code={`# Check current directory
forge check

# Check specific directory
forge check ./spec

# Output
$ forge check
Checking spec/app.forge...
✓ Parsed 5 entities
✓ Resolved 12 relations
✓ Validated 8 rules
✓ Analyzed 4 views
All checks passed.`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Errors are reported with line numbers and fix hints:
      </p>

      <CodeBlock
        language="bash"
        code={`$ forge check
Error [E0301]: Undefined entity 'Ticket'
  --> spec/app.forge:15:12
   |
15 | relation Ticket.author -> User
   |          ^^^^^^
   |
Hint: Did you mean 'Task'?`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge build</h3>

      <p className="text-muted-foreground mb-4">
        Compile the spec into a runtime artifact:
      </p>

      <CodeBlock
        language="bash"
        code={`# Build
forge build

# Build with verbose output
forge build -v

# Build to specific output
forge build --out ./dist`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        The build produces:
      </p>

      <CodeBlock
        language="bash"
        code={`.forge/
├── artifact.json        # Runtime artifact
├── schema.sql           # Database schema
├── migrations/          # Migration files
│   └── 001_initial.sql
└── sdk/                 # Generated TypeScript SDK
    ├── client.ts
    ├── types.ts
    └── react.tsx`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge migrate</h3>

      <p className="text-muted-foreground mb-4">
        Apply database migrations:
      </p>

      <CodeBlock
        language="bash"
        code={`# Apply pending migrations
forge migrate

# Show migration status
forge migrate --status

# Dry run (show SQL without applying)
forge migrate --dry-run

# Rollback last migration
forge migrate --rollback`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge run</h3>

      <p className="text-muted-foreground mb-4">
        Start the runtime server:
      </p>

      <CodeBlock
        language="bash"
        code={`# Start server
forge run

# With custom port
forge run --port 3000

# Production mode
FORGE_ENV=production forge run

# Output
$ forge run
Loading artifact from .forge/artifact.json
Connecting to database...
Server running at http://localhost:8080
WebSocket listening on ws://localhost:8080/ws`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge dev</h3>

      <p className="text-muted-foreground mb-4">
        Development mode with hot reload:
      </p>

      <CodeBlock
        language="bash"
        code={`# Start dev server
forge dev

# With custom port
forge dev --port 3000

# Output
$ forge dev
Starting FORGE development server...
Build successful!
Server running at http://localhost:8080
Dev tools at http://localhost:8080/_dev
Watching for changes...

# Edit a .forge file
File changed: spec/app.forge
Rebuilding...
Rebuild successful!`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge test</h3>

      <p className="text-muted-foreground mb-4">
        Run your declarative tests:
      </p>

      <CodeBlock
        language="bash"
        code={`# Run all tests
forge test

# Run specific tests
forge test --entity Ticket
forge test --file spec/tests.forge

# Watch mode
forge test --watch

# Verbose output
forge test -v`}
      />

      <h3 className="text-xl font-semibold mt-8 mb-3">forge lsp</h3>

      <p className="text-muted-foreground mb-4">
        Start the Language Server Protocol server for IDE integration:
      </p>

      <CodeBlock
        language="bash"
        code={`# Start LSP (usually called by your editor)
forge lsp

# With stdio transport (default)
forge lsp --stdio

# With TCP transport
forge lsp --tcp --port 5007`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Configuration</h2>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">forge.toml</code> file configures your project:
      </p>

      <CodeBlock
        filename="forge.toml"
        language="bash"
        code={`[app]
name = "myapp"
version = "1.0.0"

[database]
url = "postgres://localhost:5432/myapp"
# Or use environment variable
# url = "env:DATABASE_URL"

[server]
port = 8080
host = "0.0.0.0"

[auth]
provider = "oauth"
# oauth_client_id = "env:OAUTH_CLIENT_ID"
# oauth_client_secret = "env:OAUTH_CLIENT_SECRET"

[email]
provider = "smtp"
# smtp_host = "smtp.example.com"
# smtp_port = 587

[storage]
provider = "s3"
# bucket = "myapp-uploads"`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Environment Variables</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Variable</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">FORGE_ENV</td>
              <td className="py-3 px-4">Environment: development (default) or production</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">DATABASE_URL</td>
              <td className="py-3 px-4">PostgreSQL connection string</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">PORT</td>
              <td className="py-3 px-4">Server port (default: 8080)</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">REDIS_URL</td>
              <td className="py-3 px-4">Redis connection for jobs and presence</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h4 className="font-semibold text-forge-400 mb-2">Secrets Management</h4>
        <p className="text-sm text-muted-foreground">
          Never put secrets directly in <code className="text-forge-300">forge.toml</code>.
          Use <code className="text-forge-300">env:VARIABLE_NAME</code> syntax to reference
          environment variables. The compiler will verify all required variables are set
          before starting.
        </p>
      </div>
    </DocsLayout>
  );
}
