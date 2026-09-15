---
title: Rank Management Routes
type: route
source_file: src/routes/rankRoutes.ts
tags:
  - #route
  - #security
---

# Rank Management Routes

API endpoints for managing role-based access control (RBAC) rank definitions, permission matrices, and hierarchy sorting.

## Endpoints
- `GET /api/ranks`: List all ranks ordered by `sort_order`.
- `POST /api/ranks`: Create custom rank with specific granular permissions.
- `PUT /api/ranks/:id`: Update permissions array and rank priority.
- `DELETE /api/ranks/:id`: Remove rank.

## Related Architecture
- Model: [[Model - Rank]]
- Service: [[Permissions System]]
- Migration: [[Migration 019 - Add Sort Order to Ranks]]
