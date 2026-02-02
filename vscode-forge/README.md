# FORGE Language Extension for VS Code

Full language support for the FORGE application specification language, including syntax highlighting, IntelliSense, and navigation.

## Features

### Syntax Highlighting
- All FORGE constructs: `app`, `entity`, `relation`, `rule`, `access`, `action`, `message`, `job`, `hook`, `view`, `test`, `imperative`, `migrate`
- Types, operators, keywords, constraints, and comments

### Go to Definition (F12)
- Jump to entity, action, job, message, view definitions
- Navigate to field definitions within entities
- Follow references across multiple `.forge` files

### Find All References (Shift+F12)
- Find all usages of entities, actions, jobs, messages
- Works across the entire workspace

### Hover Information
- View entity structure with all fields
- See type information and constraints
- Documentation for built-in types and keywords

### Auto-Completion
- Declaration snippets with tab stops
- Context-aware completions (types in entity, messages in emit, etc.)
- All workspace symbols (entities, actions, jobs, messages, views)

### Document Outline (Cmd+Shift+O)
- Navigate symbols in current file
- Entities show their fields as children

### Workspace Symbols (Cmd+T)
- Search all symbols across workspace

### Diagnostics
- Warnings for undefined references (entities, messages, jobs, actions)

### Quick Fixes
- Create missing entities, messages, or jobs

### Rename Symbol (F2)
- Rename entities, actions, jobs, messages across all files

## Installation

### Quick Install (Development)

```bash
cd vscode-forge
npm install
npm run compile
```

Then symlink to VS Code extensions:

```bash
# macOS / Linux
ln -s "$(pwd)" ~/.vscode/extensions/forge-lang

# Windows (PowerShell as Admin)
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.vscode\extensions\forge-lang" -Target "$(Get-Location)"
```

Restart VS Code.

### Package and Install

```bash
# Install vsce
npm install -g @vscode/vsce

# Package
cd vscode-forge
npm install
npm run compile
vsce package

# Install
code --install-extension forge-lang-0.1.0.vsix
```

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Lint
npm run lint
```

### Debugging

1. Open the `vscode-forge` folder in VS Code
2. Press F5 to launch Extension Development Host
3. Open a folder with `.forge` files
4. Test language features

### Architecture

```
vscode-forge/
├── src/
│   ├── extension.ts          # VS Code client extension
│   └── server/
│       ├── server.ts         # Language Server Protocol server
│       ├── parser.ts         # FORGE file parser
│       ├── symbols.ts        # Symbol table management
│       └── completion.ts     # Auto-completion provider
├── syntaxes/
│   └── forge.tmLanguage.json # TextMate grammar
├── language-configuration.json
├── package.json
└── tsconfig.json
```

## Supported FORGE Syntax

```forge
# Entity with fields and constraints
entity User {
  email: string unique
  name: string
  role: enum(admin, agent, customer) = customer
}

# Relations
relation Ticket.author -> User
relation Organization.members -> User many

# Business rules
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

# Access control
access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}

# Actions
action close_ticket {
  input: Ticket
}

# Messages
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}

# Jobs
job notify_agent {
  input: Ticket
  needs: Ticket.org.members where role == agent
  effect: email.send
}

# Hooks
hook Ticket.after_create {
  enqueue notify_agent
}

# Views
view TicketList {
  source: Ticket
  fields: subject, status, author.name
}

# Tests
test Ticket.update {
  given status = closed
  when update Ticket
  expect reject TICKET_CLOSED
}
```

## License

MIT
