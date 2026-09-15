---
title: "ADR - Dual SQLite Access Pattern (Raw Promises vs Sequelize)"
type: "decision"
layer: "architecture"
source: "src/db/database.ts"
tags:
  - minepanel
  - architecture
  - decision
---

# Architectural Decision: Dual SQLite Access Pattern

## Context
MinePanel requires relational entity modeling with migrations, but also executes high-frequency queries (e.g. permission checks on every WebSocket command, server status lookups, audit logs) where Sequelize ORM model instantiation overhead is unnecessary and slow.

## Decision
Implement a hybrid database architecture in [[Database Access Layer]]:
1. **Sequelize ORM** (`src/db/sequelize.ts`): Used on boot for schema synchronization, defining complex relational associations (e.g. `User.hasMany(Server)`, `Server.belongsToMany(DiscordBot)`), and running migration tables.
2. **Raw Parameterized SQLite Promises** (`dbRun`, `dbGet`, `dbAll`): Used for runtime performance across all route controllers, background jobs, and auth middleware.

## Consequences
- **Benefits**: Zero-overhead queries for permission checks (`hasPermission()`) and status checks without ORM instantiation penalties, while retaining structured schema migrations.
- **Trade-offs**: Developers must keep raw SQL queries in sync with Sequelize model definitions.

## Relationships
- Governs: [[Database Access Layer]], [[Sequelize ORM Layer]]
- Part of: [[Subsystem - Database and Persistence]]
