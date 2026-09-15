---
title: "Modpack Routes"
type: "route"
layer: "backend"
source: "src/routes/modpackRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Modpack Routes

**Source**: `src/routes/modpackRoutes.ts`

Endpoints for searching and managing Modrinth modpacks:
- `GET /api/modpacks/search`: Queries Modrinth API for modpacks.
- `GET /api/modpacks/:id`: Returns modpack versions and dependencies.
- `POST /api/servers/:serverId/modpack/install`: Dispatches installation to [[Modpack Service]].

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Modpack Service]], [[Permissions System]]
