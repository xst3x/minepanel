---
title: "Auth Routes"
type: "route"
layer: "backend"
source: "src/routes/authRoutes.ts"
tags:
  - minepanel
  - backend
  - route
---

# Auth Routes

**Source**: `src/routes/authRoutes.ts`

Handles account registration, login authentication, and 2FA:
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/verify`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Uses: [[Authentication Core]], [[Model - User]], [[Audit Logger]]
