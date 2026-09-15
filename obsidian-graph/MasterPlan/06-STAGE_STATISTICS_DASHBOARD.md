---
title: "06-STAGE_STATISTICS_DASHBOARD"
type: "masterplan"
tags:
  - #masterplan
  - #roadmap
---

# 06-STAGE_STATISTICS_DASHBOARD

> Part of the [[Project]] roadmap and [[MASTER_ROADMAP]].

# STAGE 6 — STATISTICS DASHBOARD

Collect:
- CPU
- RAM
- TPS
- Players
- Storage

Intervals:
30 seconds

Retention:
7 days minimum

Dashboard:
- Charts
- Aggregations
- Filtering
- Export support

Success:
Historical server analytics available.

## Related Architecture
- Project Map: [[Project]]
- Subsystems: [[Subsystem - Core Backend and Web Server]], [[Subsystem - Database and Persistence]], [[Subsystem - Authentication and Permissions]]


## Architecture Connections
- Collector Worker: [[Stats Collector]]
- Data Table: [[Model - ServerStats]], [[Migration 002 - Add Stats Table]]
- Disk Telemetry: [[Disk Usage Calculator]]
- Frontend Visuals: [[Frontend Page - Servers]], [[Frontend Overview View]]
