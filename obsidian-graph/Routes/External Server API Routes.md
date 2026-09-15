---
title: "External Server API Routes"
type: "route"
layer: "backend"
source: "src/routes/serverApiRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# External Server API Routes

**Source**: `src/routes/serverApiRoutes.ts`

Full REST API for external applications authenticating via API keys:
- `GET /api/v1/servers`
- `GET /api/v1/servers/:id/status`
- `POST /api/v1/servers/:id/power`
- `POST /api/v1/servers/:id/command`
- `GET /api/v1/servers/:id/stats`

## Relationships
- Belongs to: [[Subsystem - External Server API]]
- Uses: [[API Key Authentication]], [[Process Manager Wrapper]], [[Execution Manager]], [[Audit Logger]]
