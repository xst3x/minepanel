---
title: Server API WebSocket Subsystem
type: subsystem
source_file: src/core/serverApiWebSocket.ts
tags:
  - #subsystem
  - #backend
  - #observability
---

# Server API WebSocket Subsystem

Provides real-time event streaming and console I/O over WebSockets for external integrations authenticated via scoped Server API keys.

## Architectural Responsibilities
- File: \`src/core/serverApiWebSocket.ts\`
- Mounts a dedicated WebSocket server on \`/api/servers/:serverId/ws\`.
- Validates the \`X-Server-API-Key\` token using [[API Key Auth Middleware]].
- Streams live stdout/stderr from [[Process Output Parser]] to connected WebSocket clients.
- Forwards incoming WebSocket text messages directly to the server process stdin via [[Execution Manager]].

## Security & Protocol
- Enforces IP allowlist checks: [[Migration 023 - Server API Keys IP Allowlist]].
- Requires \`console.read\` or \`console.write\` permissions granted on the [[Model - ServerApiKey]].

## Related Architecture
- Subsystem: [[Subsystem - External Server API]]
- Companion HTTP API: [[External Server API Routes]]
- Internal WebSocket: [[WebSocket Console Server]]
