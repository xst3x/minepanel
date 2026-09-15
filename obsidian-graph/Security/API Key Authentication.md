---
title: "API Key Authentication"
type: "middleware"
layer: "security"
source: "src/middleware/apiKeyAuth.ts"
tags:
  - minepanel
  - security
  - middleware
---

# API Key Authentication

**Source**: `src/middleware/apiKeyAuth.ts`

Express middleware that protects external developer API routes. It inspects `X-API-Key` headers, matches them against Argon2 key hashes in [[Model - ServerApiKey]], validates expiration dates, verifies IP allowlists, and enforces required operation scopes.

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Validates: [[Model - ServerApiKey]]
- Logs to: [[Audit Logger]]
