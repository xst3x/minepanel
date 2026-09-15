---
title: "Sequelize ORM Layer"
type: "database"
layer: "database"
source: "src/db/sequelize.ts"
tags:
  - minepanel
  - database
  - database
---

# Sequelize ORM Layer

**Source**: `src/db/sequelize.ts`

`Sequelize ORM Layer` configures the Sequelize instance that underpins MinePanel's relational entity models. It connects to SQLite in file or in-memory mode, disables noisy query logging, and configures foreign key enforcement.

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Used by: [[Database Access Layer]]
