---
title: Migration 001 - Initial Schema
type: migration
source_file: src/db/migrations/001_initial_schema.ts
tags:
  - #database
  - #migration
---

# Migration 001 - Initial Schema

Initial database migration for MinePanel creating the foundation tables in PostgreSQL or SQLite.

## Created Tables
- `users` (id, username, password_hash, role, created_at, updated_at)
- `servers` (id, name, game_type, server_version, port, memory_min, memory_max, path, java_path)
- `ranks` (id, name, permissions, priority)
- `audit_logs` (id, user_id, action, details, timestamp)
- `backups` (id, server_id, filename, size, created_at)

## Related Architecture
- Managed by: [[Database Migration Runner]]
- Model entities: [[Model - Server]], [[Model - User]], [[Model - AuditLog]], [[Backup Routes]], [[Subsystem - File and Backup Management]]
- Subsystem: [[Subsystem - Database and Persistence]]
