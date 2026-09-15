---
title: Migration 021 - Custom Start Command
type: migration
source_file: src/db/migrations/021_custom_start_command.ts
tags:
  - #database
  - #migration
  - #process
---

# Migration 021 - Custom Start Command

Enables override of standard Java startup flags with user-specified custom startup scripts or arguments (e.g. Aikar flags).

## Schema Changes
- Added column to `servers`:
  - `custom_start_command` (Text)

## Related Architecture
- Read by: [[Execution Manager]], [[Real Process Manager]]
- Configured in: [[Properties Routes]], [[Model - Server]]
