# Standalone FORGE Project Structure

When a FORGE project lives in its own repository (separate from forge itself), here's the structure:

```
myapp/
├── app.forge                  # App declaration
├── entities.forge             # Data models
├── relations.forge            # Entity relationships
├── actions.forge              # CRUD operations
├── rules.forge                # Business rules
├── access.forge               # Access control
├── views.forge                # Read queries
├── hooks.forge                # Event handlers
├── jobs.forge                 # Background jobs
├── messages.forge             # User-facing messages
├── tests.forge                # Test specifications
│
├── forge.runtime.toml         # Runtime configuration
├── .forge-runtime/            # Built artifacts (gitignored)
│   ├── artifact.json
│   ├── schema.sql
│   └── sdk/
│       ├── client.ts
│       └── react.tsx
│
├── web/                       # Frontend (React)
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── ...
│   └── dist/                  # Built frontend (gitignored)
│
├── .gitignore
├── README.md
└── Dockerfile                 # Optional: for containerized deployment
```

## Prerequisites

Install FORGE CLI globally:

```bash
curl -fsSL https://raw.githubusercontent.com/forge-lang/forge/main/install.sh | bash
```

## Development Workflow

```bash
# 1. Start development server (hot reload)
forge dev

# 2. In another terminal, start frontend
cd web && npm run dev

# Frontend proxies API calls to forge server via vite.config.ts
```

## Building for Production

```bash
# Build FORGE artifacts
forge build

# Build frontend
cd web && npm run build

# Apply migrations to production database
DATABASE_URL="postgres://..." forge migrate -apply

# Run server
FORGE_ENV=production \
DATABASE_URL="postgres://..." \
JWT_SECRET="..." \
forge run -port 8080
```

## .gitignore

```gitignore
# FORGE build artifacts
.forge-runtime/

# Frontend build
web/dist/
web/node_modules/

# Environment files with secrets
.env
.env.local
.env.production

# IDE
.idea/
.vscode/
*.swp
```

## forge.runtime.toml

```toml
# Database configuration
[database]
adapter = "embedded"  # Use embedded PostgreSQL for development

[database.postgres]
url = "env:DATABASE_URL"
pool_size = 20

# Authentication
[auth]
provider = "password"

[auth.password]
algorithm = "bcrypt"
bcrypt_cost = 12
min_length = 8

[auth.jwt]
secret = "env:JWT_SECRET"
expiry_hours = 24
refresh_expiry_hours = 168

# Production overrides
[environments.production]
[environments.production.database]
adapter = "postgres"
[environments.production.database.postgres]
pool_size = 50
ssl_mode = "require"
```

## Dockerfile

```dockerfile
FROM golang:1.22-alpine AS builder
# ... (use the Dockerfile from forge repo as template)
```

## Creating a New Project

```bash
# Create new project
forge init myapp
cd myapp

# Start developing
forge dev
```

This creates the minimal structure with `app.forge` ready to go.
