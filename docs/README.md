# FORGE Documentation

FORGE is a **compiler + sealed runtime** that compiles declarative application specifications into production-ready backends with auto-generated frontend SDKs.

## Table of Contents

1. [Getting Started](./getting-started.md) - Install FORGE and build your first app
2. [Language Reference](./language-reference.md) - Complete .forge syntax reference
3. [CLI Reference](./cli-reference.md) - All CLI commands
4. [Runtime Reference](./runtime-reference.md) - How the runtime works
5. [SDK Reference](./sdk-reference.md) - Using @forge/client and @forge/react
6. [Examples](./examples.md) - Real-world examples

## Quick Start

```bash
# Install FORGE
go install github.com/forge-lang/forge/compiler/cmd/forge@latest

# Create a new app
forge init myapp
cd myapp

# Build the app
forge build

# Run the server
forge run
```

## What Makes FORGE Different

Traditional stacks:
```
Request → Controller → Service → Model → Response
```

FORGE:
```
Intent → Rule → Transition → Effect → Message
```

FORGE eliminates:
- Controllers (actions replace them)
- Serializers (views replace them)
- Hand-written migrations (schema is derived)
- Manual permissions (access rules are declarative)
- Glue code (the compiler generates it)

## Philosophy

- **Delete work** - not add abstractions
- **Remove decisions** - not add flexibility
- **Make the right thing the default** - not add options
- **Let people stop being experts** - not require more knowledge

## License

MIT
