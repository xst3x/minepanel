---
title: Documentation Routes
type: route
source_file: src/routes/docsRoutes.ts
tags:
  - #route
  - #backend
---

# Documentation Routes

Serves built-in markdown documentation files (`src/docs/**`) to the frontend documentation viewer.

## Endpoints
- `GET /api/docs`: Returns directory structure of available doc guides.
- `GET /api/docs/:section/:slug`: Serves parsed markdown guide content.

## Related Architecture
- Frontend consumer: [[Frontend Page - Docs]]
