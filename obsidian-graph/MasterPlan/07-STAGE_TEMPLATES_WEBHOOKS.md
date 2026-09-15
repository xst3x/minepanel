---
title: "07-STAGE_TEMPLATES_WEBHOOKS"
type: "masterplan"
tags:
  - #masterplan
  - #roadmap
---

# 07-STAGE_TEMPLATES_WEBHOOKS

> Part of the [[Project]] roadmap and [[MASTER_ROADMAP]].

# STAGE 7 — TEMPLATES + WEBHOOKS

Templates:
- Vanilla
- Paper
- Purpur
- Fabric
- Forge

Webhooks:
- Server start
- Server stop
- Crash
- Backup completed

Requirements:
Timeouts
Retries
Failure handling

## Related Architecture
- Project Map: [[Project]]
- Subsystems: [[Subsystem - Core Backend and Web Server]], [[Subsystem - Database and Persistence]], [[Subsystem - Authentication and Permissions]]


## Architecture Connections
- Webhook Subsystem: [[Webhook Manager]]
- Database Table: [[Migration 003 - Add Webhooks Table]], [[Model - Webhook]]
- Server Presets: [[Server Helper]], [[Server Lifecycle Helpers]]
