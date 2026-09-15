---
title: "Automation Routes"
type: "route"
layer: "backend"
source: "src/routes/automationRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Automation Routes

**Source**: `src/routes/automationRoutes.ts`

API endpoints for managing Python automation rules:
- `GET /api/servers/:serverId/automation`
- `POST /api/servers/:serverId/automation/rules`
- `PUT /api/servers/:serverId/automation/rules/:id`
- `DELETE /api/servers/:serverId/automation/rules/:id`
- `POST /api/servers/:serverId/automation/test` (runs script in sandbox)

## Relationships
- Belongs to: [[Subsystem - Server Automations Engine]]
- Uses: [[Automation Engine]], [[Python AST Validator]], [[Database Access Layer]], [[Permissions System]]
