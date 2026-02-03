# FORGE Playground

An interactive IDE-like environment for exploring the FORGE language and understanding what gets generated.

## Features

### Multi-File Projects
Each example demonstrates how FORGE projects are organized into multiple `.forge` files:
- **app.forge** - App configuration
- **entities.forge** - Data models and relations
- **rules.forge** - Business rules
- **access.forge** - Access control policies
- **actions.forge** - User actions
- **hooks.forge** - Lifecycle hooks and jobs
- **views.forge** - Data views
- **messages.forge** - User-facing messages

### Live Compilation
Edit FORGE code and see the generated output in real-time:
- **artifact.json** - The compiled runtime configuration
- **schema.sql** - PostgreSQL schema with Row-Level Security policies
- **sdk/client.ts** - Type-safe TypeScript API client
- **sdk/react.tsx** - React hooks for data fetching and subscriptions

### Syntax Highlighting
Full syntax highlighting for FORGE code based on the VS Code extension's TextMate grammar. Also highlights SQL, TypeScript, and JSON in the output panel.

### Example Apps
Pre-built examples showcasing different FORGE capabilities:
- **Minimal** - Simple todo list (entities, access, views)
- **Helpdesk** - Ticket system (rules, hooks, jobs, messages)
- **Blog** - Publishing platform (complex rules, workflows)
- **Chat** - Real-time messaging (realtime hooks, reactions)

### IDE Experience
- File tree navigation for both source and generated files
- Syntax-highlighted editor with line numbers
- Copy-to-clipboard functionality
- Responsive design

## How It Works

The playground runs entirely in the browser:

1. **Source Panel** - Navigate and edit multiple `.forge` files
2. **Parser** - Client-side parser extracts entities, rules, actions, etc.
3. **Generator** - Produces mock output matching what the real compiler generates
4. **Output Panel** - Syntax-highlighted code viewer with file tree

## URL

The playground is available at `/playground` on the FORGE website.

## Technical Details

- Built with React + TypeScript
- Syntax highlighting from `src/lib/syntax-highlight.ts` (based on VS Code TextMate grammar)
- Styled with Tailwind CSS
- Uses Framer Motion for animations
- Lucide React for icons
- No external compilation service needed

## Future Enhancements

- Real compilation via WebAssembly
- Share/save functionality
- Error highlighting with diagnostics
- Autocomplete
