---
title: "Scheduler - Token Expiration Cleanup Job"
type: "scheduler"
layer: "backend"
source: "src/minepanel.ts"
tags:
  - minepanel
  - backend
  - scheduler
---

# Scheduler: Token Expiration Cleanup Job

**Source**: `src/minepanel.ts` (Line 393)

Hourly recurring interval timer running:
`DELETE FROM account_creation_tokens WHERE expires_at < ?`
Prunes expired one-time invitation links and registration tokens from SQLite.

## Relationships
- Managed by: [[MinePanel Entrypoint]]
- Cleans: [[Model - AccountCreationToken]]
