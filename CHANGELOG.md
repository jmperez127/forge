# Changelog

All notable changes to FORGE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Job execution pipeline (Phase 1 - synchronous in-process)
  - Hook evaluation after entity mutations (create/update/delete)
  - In-process job executor with configurable worker pool
  - Provider registry initialization from `forge.runtime.toml`
  - Fire-and-forget job execution through capability providers
  - Retry with quadratic backoff (max 3 attempts by default)
  - `/_dev/jobs` enhanced with executor status and provider info
- Work journal system for tracking implementation progress

## [0.2.0] - 2025-02-03

### Added
- Generic action handling based on `creates:`, `updates:`, `deletes:` keywords
- Auto-population of user ID fields (`owner_id`, `author_id`, etc.) for create actions
- `executeDeleteAction()` for delete operations
- External integrations system
  - Provider interfaces (`Provider`, `CapabilityProvider`, `WebhookProvider`)
  - Provider registry with compile-time registration
  - Built-in providers: generic HTTP, SMTP email
  - Webhook declaration syntax in .forge files
  - Webhook handler with signature validation
- Deployment documentation and tooling
  - Dockerfile for containerized deployment
  - docker-compose.yml for local development
  - Deployment scripts
  - Systemd service examples

### Changed
- Actions now require `creates:`, `updates:`, or `deletes:` to specify operation type
- Removed all project-specific code from runtime (helpdesk-specific handlers)
- Runtime is now fully generic and reusable

### Fixed
- UUID/SQLSTATE error when creating entities in new projects

## [0.1.0] - 2025-01-01

### Added
- Initial release
- Complete compiler implementation
  - Lexer with all FORGE tokens
  - Parser with Pratt expression parsing
  - Semantic analyzer with reference validation
  - Normalizer for defaults and implicit effects
  - Planner for action graphs and migrations
  - Emitter for artifacts, SQL, and TypeScript SDK
- Runtime server
  - HTTP API with chi router
  - WebSocket hub for real-time updates
  - Artifact loading
  - PostgreSQL with Row-Level Security
  - Embedded PostgreSQL for development
- TypeScript SDK
  - @forge/client with transport and cache
  - @forge/react with hooks
- CLI commands: init, check, build, migrate, run, dev
- Example projects: helpdesk, chat
- VS Code extension with syntax highlighting
