---
title: "STAGE_6_STATISTICS_DASHBOARD (to do now)"
type: "plan"
tags:
  - #plan
  - #architecture
---

# STAGE_6_STATISTICS_DASHBOARD (to do now)

> Internal development plan for [[Project]].

# STAGE 6: STATISTICS DASHBOARD & RETENTION
**Duration:** 10-12 hours
**Status:** CRITICAL

## STAGE GOAL
Collect and store telemetry (RAM, CPU, TPS, Players).

## TASKS
1. Create `002_add_stats_table.js`.
2. Setup 30s collection daemon in `src/core/statsCollector.js`.
3. Implement pruning for 7-day retention.
4. Create `GET /api/servers/:serverId/stats`.


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Polling Worker: [[Stats Collector]]
- Time-series Table: [[Model - ServerStats]], [[Migration 002 - Add Stats Table]]
- Disk Telemetry: [[Disk Usage Calculator]], [[Migration 007 - Add Disk Bytes to Stats]]
- UI Charts: [[Frontend Overview View]], [[Frontend Page - Servers]]
