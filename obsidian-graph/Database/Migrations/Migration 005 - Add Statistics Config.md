---
title: Migration 005 - Add Statistics Config
type: migration
source_file: src/db/migrations/005_add_statistics_config.ts
tags:
  - #database
  - #migration
  - #monitoring
---

# Migration 005 - Add Statistics Config

Adds server-level configuration for statistics collection frequency and retention window.

## Schema Changes
- Added columns to `servers`:
  - `stats_interval` (Collection sampling interval in ms)
  - `stats_retention_days` (Automatic cleanup threshold)

## Related Architecture
- Managed by: [[Stats Collector]], [[Subsystem - Resource Monitoring and Safety]]
