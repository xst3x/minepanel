---
title: Migration 003 - Add Throttle Config
type: migration
source_file: src/db/migrations/003_add_throttle_config.ts
tags:
  - #database
  - #migration
  - #monitoring
---

# Migration 003 - Add Throttle Config

Adds CPU and memory throttling limit columns to the `servers` table to control resource hogging.

## Schema Changes
- Added columns to `servers`:
  - `cpu_limit` (Integer percentage)
  - `throttle_enabled` (Boolean)

## Related Architecture
- Managed by: [[Throttle Manager]]
- Subsystem: [[Execution Manager]]
- Model: [[Model - Server]]
