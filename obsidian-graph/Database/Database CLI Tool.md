---
title: Database CLI Tool
type: database
source_file: src/db/db-cli.ts
tags:
  - #database
  - #backend
---

# Database CLI Tool

Headless command-line utility for database operations, migrations, and disaster recovery.

## CLI Commands
- `npx ts-node src/db/db-cli.ts migrate`: Runs all pending schema migrations.
- `npx ts-node src/db/db-cli.ts rollback`: Reverts the most recent migration batch.
- `npx ts-node src/db/db-cli.ts reset-admin`: Creates or resets root administrator credentials.
- `npx ts-node src/db/db-cli.ts status`: Prints current schema version and migration history.

## Related Architecture
- Executes: [[Database Migration Runner]]
- Subsystem: [[Subsystem - Database and Persistence]]
- Database instance: [[Database Access Layer]]
