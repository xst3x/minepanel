---
title: Migration 007 - Add Disk Bytes to Stats
type: migration
source_file: src/db/migrations/007_add_disk_bytes_to_stats.ts
tags:
  - #database
  - #migration
  - #monitoring
---

# Migration 007 - Add Disk Bytes to Stats

Enhances `server_stats` table to record actual filesystem disk consumption per server instance.

## Schema Changes
- Added column to `server_stats`:
  - `disk_bytes` (BigInt)

## Related Architecture
- Measured by: [[Stats Collector]]
- Worker: [[Stats Collector]]
- Model: [[Model - ServerStats]]
