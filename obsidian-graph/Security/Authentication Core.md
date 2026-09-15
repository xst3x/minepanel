---
title: "Authentication Core"
type: "security"
layer: "security"
source: "src/core/auth.ts"
tags:
  - minepanel
  - security
  - security
---

# Authentication Core

**Source**: `src/core/auth.ts`

`Authentication Core` implements authentication security routines:
- `authenticateToken`: Express middleware validating JWT tokens from `Authorization: Bearer <token>` or cookies.
- Password verification supporting both legacy bcrypt hashes and high-security Argon2 hashes.
- TOTP token verification and emergency backup code validation for Two-Factor Authentication.

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Verifies: [[Model - User]]
- Feeds into: [[Permissions System]]
