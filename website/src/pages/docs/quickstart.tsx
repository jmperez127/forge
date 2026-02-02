import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function QuickStart() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Quick Start</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Get a complete application running in under 5 minutes. No boilerplate, no configuration hell.
      </p>

      <h2 className="text-2xl font-bold mb-4">Prerequisites</h2>

      <ul className="space-y-2 text-muted-foreground mb-8">
        <li>• PostgreSQL 14+ running locally or a connection string</li>
        <li>• Node.js 18+ (for the frontend SDK)</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4">1. Install FORGE</h2>

      <CodeBlock
        code="curl -fsSL https://forge-lang.dev/install.sh | sh"
        language="bash"
      />

      <p className="text-muted-foreground mt-4 mb-8">
        This installs the <code className="text-forge-400">forge</code> CLI to your system.
        Verify with <code className="text-forge-400">forge --version</code>.
      </p>

      <h2 className="text-2xl font-bold mb-4">2. Create a New Project</h2>

      <CodeBlock
        code={`forge init myapp
cd myapp`}
        language="bash"
      />

      <p className="text-muted-foreground mt-4 mb-4">
        This scaffolds a new FORGE project with the following structure:
      </p>

      <CodeBlock
        code={`myapp/
├── spec/
│   └── app.forge      # Your application spec
├── web/               # Frontend (optional)
│   ├── src/
│   └── package.json
└── forge.toml         # Runtime configuration`}
        language="bash"
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">3. Define Your Application</h2>

      <p className="text-muted-foreground mb-4">
        Open <code className="text-forge-400">spec/app.forge</code> and define your app:
      </p>

      <CodeBlock
        filename="spec/app.forge"
        code={`app MyApp {
  database: postgres
  auth: oauth
}

# Define your data model
entity Task {
  title: string length <= 200
  description: string?
  done: bool = false
  created_at: time
}

# Connect to users
relation Task.owner -> User

# Business rules
rule Task.update {
  forbid if done == true
    emit TASK_COMPLETED
}

# Who can access what
access Task {
  read: user == owner
  write: user == owner
}

# Error messages
message TASK_COMPLETED {
  level: error
  default: "Cannot modify a completed task."
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">4. Configure the Database</h2>

      <p className="text-muted-foreground mb-4">
        Edit <code className="text-forge-400">forge.toml</code> with your database connection:
      </p>

      <CodeBlock
        filename="forge.toml"
        code={`[database]
url = "postgres://localhost:5432/myapp"

[server]
port = 8080`}
        language="bash"
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">5. Build and Run</h2>

      <CodeBlock
        code={`# Compile the spec and generate everything
forge build

# Apply database migrations
forge migrate

# Start the runtime
forge run`}
        language="bash"
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Your API is now live at <code className="text-forge-400">http://localhost:8080</code>.
      </p>

      <h2 className="text-2xl font-bold mb-4">6. Use the Generated SDK</h2>

      <p className="text-muted-foreground mb-4">
        The compiler generates a TypeScript SDK. Install it in your frontend:
      </p>

      <CodeBlock
        code={`cd web
npm install ../sdk`}
        language="bash"
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Then use it with React:
      </p>

      <CodeBlock
        filename="src/App.tsx"
        language="typescript"
        code={`import { ForgeProvider, useList, useAction } from '@myapp/sdk/react';

function App() {
  return (
    <ForgeProvider url="http://localhost:8080">
      <TaskList />
    </ForgeProvider>
  );
}

function TaskList() {
  // Real-time subscription - updates automatically
  const { data: tasks, loading } = useList('TaskList');

  // Type-safe action
  const createTask = useAction('create_task');

  const handleCreate = async () => {
    await createTask({ title: 'New task' });
    // No need to refetch - the list updates automatically
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={handleCreate}>Add Task</button>
      {tasks.map(task => (
        <div key={task.id}>{task.title}</div>
      ))}
    </div>
  );
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">7. Development Mode</h2>

      <p className="text-muted-foreground mb-4">
        For active development, use <code className="text-forge-400">forge dev</code> for hot reload:
      </p>

      <CodeBlock
        code={`forge dev

# Output:
# Starting FORGE development server...
# Build successful!
# Server running at http://localhost:8080
# Watching for changes...
#
# [edit app.forge]
# File changed: app.forge
# Rebuild successful!`}
        language="bash"
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Edit any <code className="text-forge-400">.forge</code> file and changes apply immediately—no restart needed.
      </p>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold text-forge-400 mb-2">What just happened?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          In about 30 lines of spec, you now have:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• A PostgreSQL database with proper schema</li>
          <li>• Row-level security enforcing your access rules</li>
          <li>• A complete REST API with validation</li>
          <li>• Real-time WebSocket subscriptions</li>
          <li>• A fully typed TypeScript client</li>
          <li>• Business rules that cannot be bypassed</li>
        </ul>
      </div>
    </DocsLayout>
  );
}
