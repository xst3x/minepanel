---
title: Migration 008 - Server Automation
type: migration
source_file: src/db/migrations/008_server_automation.ts
tags:
  - #database
  - #migration
  - #automation
---

# Migration 008 - Server Automation

Adds initial scheduled automation cron tasks table `server_automations`.

## Schema Changes
- Created `server_automations` table:
  - `id`, `server_id`, `name`, `cron_expression`, `action`, `payload`, `enabled`

## Related Architecture
- Executed by: [[Automation Engine]]
- Route: [[Automation Routes]]
- Subsystem: [[Subsystem - Server Automations Engine]]
