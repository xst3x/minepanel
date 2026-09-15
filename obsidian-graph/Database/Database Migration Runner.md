---
title: "Database Migration Runner"
type: "service"
layer: "database"
source: "src/db/migrationRunner.ts"
tags:
  - minepanel
  - database
  - service
---

# Database Migration Runner

**Source**: `src/db/migrationRunner.ts`

`Database Migration Runner` manages schema evolution over time. It maintains a `migrations` metadata table in SQLite, scans the `src/db/migrations/` directory for pending migrations, and executes them in numerical sequence inside transactions.

## Relationships
- Belongs to: [[Subsystem - Database and Persistence]]
- Used by: [[Database Access Layer]]

## Executed Migrations
- [[Migration 001 - Initial Schema]]
- [[Migration 002 - Add Stats Table]]
- [[Migration 003 - Add Throttle Config]]
- [[Migration 003 - Add Webhooks Table]]
- [[Migration 004 - Add Threshold Rules]]
- [[Migration 005 - Add Statistics Config]]
- [[Migration 006 - Audit Log]]
- [[Migration 007 - Add Disk Bytes to Stats]]
- [[Migration 008 - Server Automation]]
- [[Migration 009 - Add 2FA and Token Revocation]]
- [[Migration 010 - Add TOTP Backup Codes]]
- [[Migration 011 - Add Avatar]]
- [[Migration 012 - Add TOTP Verified]]
- [[Migration 013 - Docker Execution Mode]]
- [[Migration 014 - Add Extra Ports]]
- [[Migration 015 - Auto Update Settings]]
- [[Migration 016 - Automation Rules]]
- [[Migration 017 - Visual Automation Fields]]
- [[Migration 018 - Python Automations]]
- [[Migration 019 - Add Sort Order to Ranks]]
- [[Migration 020 - Modpack Metadata]]
- [[Migration 021 - Custom Start Command]]
- [[Migration 022 - Server API Keys]]
- [[Migration 023 - Server API Keys IP Allowlist]]
- Management CLI: [[Database CLI Tool]]
