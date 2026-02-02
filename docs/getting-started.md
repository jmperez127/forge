# Getting Started with FORGE

This guide will walk you through installing FORGE and building your first application.

## Prerequisites

- Go 1.22 or later
- PostgreSQL 14 or later
- Node.js 18+ (for frontend development)

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/forge-lang/forge.git
cd forge

# Build the compiler
cd compiler
go build -o ../bin/forge ./cmd/forge

# Build the runtime
cd ../runtime
go build -o ../bin/forge-runtime ./cmd/forge-runtime

# Add to PATH (optional)
export PATH="$PATH:$(pwd)/../bin"
```

### Verify Installation

```bash
forge version
# Output: forge version 0.1.0
```

## Your First FORGE App

### 1. Initialize a New Project

```bash
forge init todo
cd todo
```

This creates the following structure:
```
todo/
├── app.forge
├── entities.forge
└── .gitignore
```

### 2. Define Your Entities

Edit `entities.forge`:

```text
entity Task {
  title: string length <= 200
  completed: bool = false
  due_date: time
}

entity User {
  email: string unique
  name: string
}
```

### 3. Add Relations

Create `relations.forge`:

```text
relation Task.owner -> User
```

### 4. Define Access Rules

Create `access.forge`:

```text
access Task {
  read: user == owner
  write: user == owner
}
```

### 5. Create Actions

Create `actions.forge`:

```text
action create_task {
  input: Task
}

action complete_task {
  input: Task
}

action delete_task {
  input: Task
}
```

### 6. Add Views

Create `views.forge`:

```text
view TaskList {
  source: Task
  fields: title, completed, due_date
}
```

### 7. Set Up the Database

```bash
# Create database
createdb todo_dev
```

### 8. Start Development Mode

```bash
DATABASE_URL="postgres://localhost:5432/todo_dev?sslmode=disable" forge dev
```

This single command:
- Builds your `.forge` files
- Applies the schema to the database
- Starts the runtime server at `http://localhost:8080`
- Watches for file changes and auto-rebuilds

Now edit any `.forge` file and see changes apply automatically!

> **Tip:** Keep `forge dev` running while you develop. Build errors appear in the terminal without stopping the server.

**Generated Files (in `.forge-runtime/`):**
- `artifact.json` - Runtime artifact
- `schema.sql` - PostgreSQL schema
- `sdk/client.ts` - TypeScript client
- `sdk/react.tsx` - React hooks

### 9. Explore the Dev Dashboard

In development mode, FORGE provides a built-in dashboard at `http://localhost:8080/_dev` showing:
- All API routes
- Entity schema with fields and relations
- Business rules and access policies
- Runtime configuration

```bash
# Open in browser
open http://localhost:8080/_dev

# Or use the CLI
forge dev routes    # Show routes
forge dev schema    # Show entity schema
```

See [Dev Info Page](./dev-info.md) for full documentation.

### 10. Test the API

```bash
# Health check
curl http://localhost:8080/health

# Create a task (requires auth in production)
curl -X POST http://localhost:8080/api/actions/create_task \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn FORGE", "due_date": "2024-12-31T00:00:00Z"}'

# List tasks
curl http://localhost:8080/api/views/TaskList

# Check available routes via dev endpoint
curl http://localhost:8080/_dev/routes
```

## Building the Frontend

### 1. Create a React App

```bash
cd todo
npx create-vite@latest web --template react-ts
cd web
```

### 2. Install FORGE SDK

```bash
npm install @forge/client @forge/react
```

Or copy the generated SDK:

```bash
cp ../.forge-runtime/sdk/client.ts src/forge-client.ts
cp ../.forge-runtime/sdk/react.tsx src/forge-react.tsx
```

### 3. Set Up the Provider

```tsx
// src/App.tsx
import { ForgeProvider } from './forge-react';

const config = {
  url: 'http://localhost:8080',
};

function App() {
  return (
    <ForgeProvider config={config}>
      <TaskList />
    </ForgeProvider>
  );
}
```

### 4. Use the Hooks

```tsx
// src/TaskList.tsx
import { useList, useAction } from './forge-react';

function TaskList() {
  const { data: tasks, loading } = useList('TaskList');
  const completeTask = useAction('complete_task');

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {tasks?.map(task => (
        <li key={task.id}>
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => completeTask.execute({ task: task.id })}
          />
          {task.title}
        </li>
      ))}
    </ul>
  );
}
```

## Project Structure

A typical FORGE project looks like:

```
myapp/
├── app.forge          # App configuration
├── entities.forge     # Data model
├── relations.forge    # Entity connections
├── rules.forge        # Business rules
├── access.forge       # Access control
├── actions.forge      # Named transactions
├── messages.forge     # Error/success messages
├── hooks.forge        # Action triggers
├── jobs.forge         # Background jobs
├── views.forge        # Frontend projections
├── tests.forge        # Invariant tests
├── .forge-runtime/    # Generated files (gitignored)
└── web/               # Frontend app (optional)
```

## Next Steps

- Read the [Language Reference](./language-reference.md) to learn all syntax
- Use the [Dev Info Page](./dev-info.md) to explore your app's schema and routes
- Explore the [Helpdesk Example](../projects/helpdesk/) for a complete app
- Set up [E2E Tests](../e2e/) for your app
