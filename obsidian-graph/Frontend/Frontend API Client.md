---
title: "Frontend API Client"
type: "client"
layer: "frontend"
source: "src/frontend/src/lib/api.ts"
tags:
  - minepanel
  - frontend
  - client
---

# Frontend API Client

**Source**: `src/frontend/src/lib/api.ts`

Configured Axios instance handling HTTP communication with the MinePanel backend. Intercepts outgoing requests to attach `Authorization: Bearer <token>` and catches 401 Unauthorized responses to trigger automatic logout transitions.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Calls: [[Auth Routes]]
