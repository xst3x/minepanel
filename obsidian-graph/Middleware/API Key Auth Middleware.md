---
title: API Key Auth Middleware
type: middleware
source_file: src/middleware/apiKeyAuth.ts
tags:
  - #middleware
  - #security
---

# API Key Auth Middleware

Express middleware for authenticating headless API requests against server-scoped API keys.

## Pipeline Flow
1. Extracts `X-Server-API-Key` header or Bearer token.
2. Hashes token and queries `server_api_keys` table.
3. Checks expiration and updates `last_used_at`.
4. Enforces IP CIDR allowlist: [[Migration 023 - Server API Keys IP Allowlist]].
5. Attaches authenticated `serverApiKey` and server scope to Express request.

## Related Architecture
- Model: [[Model - ServerApiKey]]
- Protects: [[External Server API Routes]]
- Codes: [[Application Error Codes]]
