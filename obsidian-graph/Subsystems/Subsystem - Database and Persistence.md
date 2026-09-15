---
title: "Subsystem - Database and Persistence"
type: "subsystem"
layer: "database"
source: "src/db/database.ts"
tags:
  - minepanel
  - database
  - subsystem
---

# Subsystem: Database and Persistence

The **Database and Persistence** subsystem manages all relational data in MinePanel using SQLite3. It employs a hybrid data architecture combining lightweight, direct parameterized promise queries (`dbRun`, `dbGet`, `dbAll`) for speed with Sequelize ORM models for structured entity associations and migrations.

## Key Responsibilities
1. **Schema Management & Migrations**: Automatically applies versioned incremental SQL/JS migrations on startup via [[Database Migration Runner]].
2. **Zero-Lock Backups**: Executes atomic, verified SQLite snapshots using `VACUUM INTO` without taking the server offline.
3. **Integrity Checking**: Runs `PRAGMA integrity_check` on startup to detect corruption before transactions occur.
4. **Entity Modeling**: Maintains relations between users, ranks, permissions, servers, metrics, API keys, and Discord bots.

## Connected Architectural Nodes
- [[Database Access Layer]]: Direct SQLite3 connection, promise helpers, backup engine, and seed data.
- [[Sequelize ORM Layer]]: Sequelize instance and relational mapping configuration.
- [[Database Migration Runner]]: Ordered migration executor tracking applied schemas.
- [[Model - User]]: Registered user accounts, password hashes, and 2FA credentials.
- [[Model - Server]]: Minecraft server entities, network ports, RAM allocations, and engine settings.
- [[Model - ServerStats]]: Historical time-series CPU, RAM, and player count samples.
- [[Model - Rank]]: RBAC role definitions and permission bundles.
- [[Model - DiscordBot]]: Linked Discord bot configurations and guild associations.
- [[Model - ServerApiKey]]: External developer API credentials and scopes.
- [[Model - AuditLog]]: Historical administrative action logs.
