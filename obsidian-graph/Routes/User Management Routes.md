---
title: User Management Routes
type: route
source_file: src/routes/userRoutes.ts
tags:
  - #route
  - #security
---

# User Management Routes

API endpoints for managing panel user accounts, profile settings, passwords, and avatars.

## Endpoints
- `GET /api/users`: List users (admin only).
- `POST /api/users`: Create new user.
- `GET /api/users/:id`: Fetch user profile details.
- `PUT /api/users/:id`: Update account info, rank, or avatar.
- `DELETE /api/users/:id`: Remove account and revoke active JWTs.

## Related Architecture
- Model: [[Model - User]]
- Subsystem: [[Subsystem - Authentication and Permissions]]
- Ranks: [[Rank Management Routes]]
