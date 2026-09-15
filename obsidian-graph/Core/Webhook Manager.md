---
title: "Webhook Manager"
type: "manager"
layer: "backend"
source: "src/core/webhookManager.ts"
tags:
  - minepanel
  - backend
  - manager
---

# Webhook Manager

**Source**: `src/core/webhookManager.ts`

The `Webhook Manager` triggers external HTTP POST webhooks when critical server events occur:
- `server_start`
- `server_stop`
- `crash`
- `backup_completed`

It handles exponential backoff retries (up to 3 attempts) and persists webhook configurations in the SQLite `webhooks` table.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Uses: [[Database Access Layer]], [[Model - Webhook]]
