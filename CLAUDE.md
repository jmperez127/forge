# FORGE - AI Development Guide

> **FORGE compiles application intent (data + rules + access + views) into a sealed runtime that cannot violate your business logic.**

## Project Vision

FORGE is NOT a framework. It is a **compiler + sealed runtime** for applications. Born from the insight that most software is "the same boring garbage rewritten forever," FORGE eliminates:
- Controllers
- Serializers
- Hand-written migrations
- Manual permissions
- Glue code

You describe **data + rules**, FORGE generates the rest.

### Core Philosophy (from HOW_FORGE_WAS_CONCIEVED.html)

Groundbreaking projects:
- **Delete work** - not add abstractions
- **Remove decisions** - not add flexibility
- **Make the right thing the default** - not add options
- **Let people stop being experts** - not require more knowledge

FORGE is what Rails would look like if invented AFTER we understood distributed systems, async, and AI.

---

## Critical Files

| File | Purpose |
|------|---------|
| `FORGE_SPEC.md` | **Authoritative specification** - READ THIS FIRST |
| `HOW_FORGE_WAS_CONCIEVED.html` | Origin story and design philosophy |
| `CLAUDE.md` | This file - AI development context |

---

## Architecture Overview

```
.forge files → COMPILER → Runtime Artifact → SEALED RUNTIME
                  ↓
            Frontend SDK (@forge/client, @forge/react)
```

### Compiler Pipeline
```
.parse → .analyze → .normalize → .plan → .emit
```

### Monorepo Structure
```
forge/
├── packages/
│   ├── compiler/     # Core compiler (lexer, parser, analyzer, emitter)
│   ├── runtime/      # Sealed runtime (action executor, rules, access)
│   ├── client/       # @forge/client (transport + cache)
│   ├── react/        # @forge/react (hooks)
│   └── cli/          # forge CLI tool
├── e2e/              # End-to-end tests
├── fixtures/         # Test fixtures (.forge apps)
└── benchmarks/       # Performance benchmarks
```

---

## Development Principles

### 1. The Spec is Law
- `FORGE_SPEC.md` is the authoritative source
- If implementation differs from spec, fix the implementation
- Compiler failures are fatal - runtime never guesses

### 2. No Bypassable Guarantees
- Rules compile to SQL predicates (cannot be skipped)
- Access control enforced at query level
- All mutations go through actions
- Jobs have capability sandboxes

### 3. Testing is First-Class
- **Unit tests** for every module
- **Property-based tests** for invariants (fast-check)
- **Integration tests** with real Postgres (testcontainers)
- **Snapshot tests** for AST/artifact stability
- **Alaways cover real life scenarios** Cover as much as you can, create real apps using the runtime inside a projects folder, and always create a frontend with react by using the SDK
- Coverage targets: 80%+ statements, 75%+ branches

### 4. LLM-Friendly Design
- Declarative specs are easy for LLMs to edit
- No hidden state, no implicit behavior
- Structured errors (never throw strings)
  
### 5. Documentation
- Keep the forge documentation up to date with changes
- Needs to use simple but techincal langauge
- Update after every considerable change, keep versioning if we increase version

---

## Decision Log

> Update this section after every significant architectural decision.

| Date | Decision | Rationale |
|------|----------|-----------|

---

## Changelog

> Update after every significant implementation milestone.

### [Unreleased]
- Initial project setup
- CLAUDE.md created
- Planning phase complete

---

## RALPH Loops (Reflect-Act-Learn-Plan-Hypothesize)

> Use this pattern when facing complex decisions.

### Current Loop: Project Bootstrap

**Reflect**: We have a comprehensive spec but no implementation.

**Act**:
1. Set up monorepo structure
2. Implement parser first (foundation)
3. Build compiler passes incrementally
4. Add tests alongside each component

**Learn**:
- The spec is well-defined - follow it closely
- Testing strategy must be comprehensive from day one
- Parser errors need to be excellent (LSP-ready)

**Plan**:
1. Phase 1: Parser + AST (weeks 1-4)
2. Phase 2: Compiler passes (weeks 5-10)
3. Phase 3: Runtime core (weeks 11-16)
4. Phase 4: Frontend SDK (weeks 17-20)
5. Phase 5: CLI + Polish (weeks 21-24)

**Hypothesize**: Starting with parser allows testing compilation pipeline early, which will surface spec ambiguities before runtime work begins.

---

## Key Patterns


---

## Common Commands

---

## What NOT To Do

1. **Don't add "flexibility"** - FORGE is opinionated by design
2. **Don't bypass the compiler** - No raw SQL, no runtime schema changes
3. **Don't skip tests** - Every feature needs tests
4. **Don't guess on ambiguity** - Ask or check the spec
5. **Don't add layers** - Delete code, don't add abstractions

---

## Quick Reference: .forge Syntax

```text
# Entity
entity Ticket {
  subject: string length <= 120
  status: enum(open, pending, closed) = open
}

# Relation
relation Ticket.author -> User

# Rule
rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

# Access
access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}

# Action
action close_ticket {
  input: Ticket
}

# Message
message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}

# View
view TicketList {
  source: Ticket
  fields: subject, status
}
```

---

## Memory: Key Insights

1. **"Delete 50% of CRUD"** - The founding insight
2. **Compiler + Sealed Runtime** - Not a framework
3. **Intent → Rule → Transition → Effect → Message** - The FORGE flow
4. **Tests as specifications** - If a test fails, either code or spec is wrong
5. **Constraints create better software faster** - Opinionated is a feature

---

## Sources

- [FORGE_SPEC.md](./FORGE_SPEC.md) - Authoritative specification
- [HOW_FORGE_WAS_CONCIEVED.html](./HOW_FORGE_WAS_CONCIEVED.html) - Origin and philosophy
- [Anthropic Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [fast-check](https://github.com/dubzzz/fast-check) - Property-based testing
- [Vitest](https://vitest.dev/) - Testing framework
- [Turborepo](https://turbo.build/) - Monorepo management
