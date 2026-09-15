---
title: Migration 003 - Add Webhooks Table
type: migration
source_file: src/db/migrations/003_add_webhooks_table.ts
tags:
  - #database
  - #migration
  - #monitoring
---

# Migration 003 - Add Webhooks Table

Creates the `webhooks` table allowing external webhooks (e.g. Discord, Slack, HTTP endpoints) to receive server lifecycle and threshold alert events.

## Schema Changes
- Created `webhooks` table:
  - `id`, `name`, `url`, `events`, `enabled`, `secret`

## Related Architecture
- Managed by: [[Webhook Manager]]
- Emits events from: [[Webhook Manager]], [[Threshold Manager]]
- Subsystem: [[Subsystem - Database and Persistence]]
