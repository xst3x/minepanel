---
title: Server API Key Management Routes
type: route
source_file: src/routes/serverApiKeyManagementRoutes.ts
tags:
  - #route
  - #security
---

# Server API Key Management Routes

Panel endpoints allowing authorized users to generate, view, and revoke headless server API keys.

## Endpoints
- `GET /api/servers/:id/api-keys`: List keys (hashed secrets masked).
- `POST /api/servers/:id/api-keys`: Generate new key, returning plaintext secret once.
- `DELETE /api/servers/:id/api-keys/:keyId`: Revoke key immediately.

## Related Architecture
- Model: [[Model - ServerApiKey]]
- Middleware: [[API Key Auth Middleware]]
- Migrations: [[Migration 022 - Server API Keys]], [[Migration 023 - Server API Keys IP Allowlist]]
