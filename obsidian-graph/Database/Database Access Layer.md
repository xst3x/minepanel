---
title: "Database Access Layer"
type: "database"
layer: "database"
source: "src/db/database.ts"
tags:
  - minepanel
  - database
  - database
---

# Database Access Layer

**Source**: `src/db/database.ts`

`Database Access Layer` is the primary data storage interface for MinePanel. It establishes the SQLite connection, provides promise-based query wrappers (`dbRun`, `dbGet`, `dbAll`), manages database backups via `VACUUM INTO`, checks file integrity on boot, and seeds initial administrator accounts and default rank bundles.

## Key Functions
- `initDb()`: Initializes database, runs integrity check, synchronizes Sequelize schema, executes migrations, and seeds ranks.
- `checkIntegrity()`: Executes `PRAGMA integrity_check` to detect file corruption.
- `backupDatabase()`: Creates atomic online snapshots in `data/backups/`.
- `ensureAdminAccount()`: Idempotently generates randomized default admin credentials on fresh installs.

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Uses: [[Sequelize ORM Layer]], [[Database Migration Runner]]
- Exports Models: [[Model - User]], [[Model - Server]], [[Model - ServerStats]], [[Model - Rank]], [[Model - DiscordBot]], [[Model - ServerApiKey]], [[Model - AuditLog]]
