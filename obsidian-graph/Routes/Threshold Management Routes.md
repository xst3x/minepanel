---
title: Threshold Management Routes
type: route
source_file: src/routes/thresholdRoutes.ts
tags:
  - #route
  - #monitoring
---

# Threshold Management Routes

API endpoints for configuring automated performance threshold rules and alert thresholds per Minecraft server.

## Endpoints
- \`GET /api/servers/:id/thresholds\`: Retrieves active threshold limits for CPU, RAM, and player caps.
- \`POST /api/servers/:id/thresholds\`: Creates or updates auto-restart or alert triggers.
- \`DELETE /api/servers/:id/thresholds/:ruleId\`: Removes a threshold trigger rule.

## Related Architecture
- Subsystem: [[Subsystem - Resource Monitoring and Safety]]
- Evaluated by: [[Threshold Manager]]
- Data schema: [[Migration 004 - Add Threshold Rules]]
- Handled in UI: [[Frontend Page - Server Settings]]
