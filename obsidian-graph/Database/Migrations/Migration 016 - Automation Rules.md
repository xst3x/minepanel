---
title: Migration 016 - Automation Rules
type: migration
source_file: src/db/migrations/016_automation_rules.ts
tags:
  - #database
  - #migration
  - #automation
---

# Migration 016 - Automation Rules

Upgrades simple automations to a flexible rules engine with conditions, triggers, and chained actions.

## Schema Changes
- Created `automation_rules` table:
  - `id`, `server_id`, `name`, `trigger_type`, `trigger_config`, `conditions`, `actions`, `enabled`

## Related Architecture
- Executed by: [[Automation Engine]]
- Route: [[Automation Routes]]
