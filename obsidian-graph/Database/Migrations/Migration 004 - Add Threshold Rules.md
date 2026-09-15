---
title: Migration 004 - Add Threshold Rules
type: migration
source_file: src/db/migrations/004_add_threshold_rules.ts
tags:
  - #database
  - #migration
  - #monitoring
---

# Migration 004 - Add Threshold Rules

Creates table for automated server health threshold rules (CPU, memory, crash detection, auto-restart triggers).

## Schema Changes
- Created `threshold_rules` table:
  - `server_id`, `metric`, `condition`, `threshold_value`, `duration_seconds`, `action`

## Related Architecture
- Evaluated by: [[Threshold Manager]]
- Polled by: [[Stats Collector]]
- Subsystem: [[Subsystem - Resource Monitoring and Safety]]
