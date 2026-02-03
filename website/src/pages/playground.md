# FORGE Playground

An interactive IDE-like environment for exploring the FORGE language and understanding what gets generated.

## Features

### Live Compilation
Write FORGE code in the editor and see the generated output in real-time:
- **artifact.json** - The compiled runtime configuration
- **schema.sql** - PostgreSQL schema with Row-Level Security policies
- **sdk/client.ts** - Type-safe TypeScript API client
- **sdk/react.tsx** - React hooks for data fetching and subscriptions

### Example Apps
Pre-built examples to explore:
- **Minimal** - The simplest FORGE app (todo list)
- **Helpdesk** - Ticket management with rules and hooks
- **Blog** - Multi-author publishing platform
- **Chat** - Real-time messaging with channels

### IDE Experience
- Syntax-aware editor with line numbers
- File tree navigation for generated outputs
- Copy-to-clipboard functionality
- Responsive design

## How It Works

The playground runs entirely in the browser:

1. **Editor** - Monaco-style textarea with line numbers
2. **Parser** - Client-side regex-based parser extracts entities, rules, actions, etc.
3. **Generator** - Produces mock output matching what the real compiler generates
4. **Preview** - Syntax-highlighted code viewer with file tree

## URL

The playground is available at `/playground` on the FORGE website.

## Technical Details

- Built with React + TypeScript
- Styled with Tailwind CSS
- Uses Framer Motion for animations
- Lucide React for icons
- No external compilation service needed

## Future Enhancements

- Real compilation via WebAssembly
- Share/save functionality
- Multiple file editing
- Error highlighting
- Autocomplete
