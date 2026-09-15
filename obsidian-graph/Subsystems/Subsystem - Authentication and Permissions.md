---
title: "Subsystem - Authentication and Permissions"
type: "subsystem"
layer: "security"
source: "src/core/auth.ts"
tags:
  - minepanel
  - security
  - subsystem
---

# Subsystem: Authentication and Permissions

The **Authentication and Permissions** subsystem secures MinePanel interfaces and operations. It provides role-based access control (RBAC), multi-factor authentication, and granular per-user per-server permission enforcement.

## Key Responsibilities
1. **Authentication**: Signs and verifies JWT tokens; supports Argon2 and bcrypt password hashes.
2. **Two-Factor Authentication (2FA)**: Generates TOTP secrets, QR codes via `otplib`/`qrcode`, and one-time emergency backup recovery codes.
3. **Granular Permissions**: Enforces 28+ discrete permission keys (e.g. `server.console.read`, `server.files.write`, `server.backups.create`).
4. **Rank Inheritance**: Allows admins to bundle permissions into customizable ranks with instant propagation to assigned users.

## Connected Architectural Nodes
- [[Authentication Core]]: JWT verification middleware, password hashing, and TOTP generation.
- [[Permissions System]]: Core evaluator checking global admin rights and per-server permission grants.
- [[API Key Authentication]]: Middleware validating external developer API keys against requested scopes.
- [[Auth Routes]]: Endpoints for login, 2FA validation, token refresh, and password recovery.
- [[Model - User]]: Storage of hashed passwords, 2FA secrets, and user ranks.
- [[Model - Rank]]: Reusable permission sets assignable to users globally or per-server.
