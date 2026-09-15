---
title: Migration 002 - Add Stats Table
type: migration
source_file: src/db/migrations/002_add_stats_table.ts
tags:
  - #database
  - #migration
  - #monitoring
---

# Migration 002 - Add Stats Table

Introduces the time-series performance metrics table `server_stats` for historical telemetry tracking.

## Schema Changes
- Created `server_stats` table:
  - `id` (UUID / Serial)
  - `server_id` (Foreign key to servers)
  - `cpu_usage` (Float percentage)
  - `memory_usage` (BigInt bytes)
  - `player_count` (Integer)
  - `created_at` (Timestamp with index)

## Related Architecture
- Populated by: [[Stats Collector]]
- Consumed by: [[Stats Routes]], [[Stats Routes]]
- Model: [[Model - ServerStats]]
- Runner: [[Database Migration Runner]]
