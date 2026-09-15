---
title: Server API Documentation Routes
type: route
source_file: src/routes/serverApiDocsRoutes.ts
tags:
  - #route
  - #backend
---

# Server API Documentation Routes

Generates and serves the OpenAPI 3.0 / Swagger specification describing the headless Server API.

## Endpoints
- `GET /api/server-api-docs/openapi.json`: Machine-readable schema specification.
- `GET /api/server-api-docs`: Swagger UI interactive exploration interface.

## Related Architecture
- Documents: [[External Server API Routes]]
- Security: [[API Key Auth Middleware]]
