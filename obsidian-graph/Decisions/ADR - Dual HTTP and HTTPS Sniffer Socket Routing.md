---
title: "ADR - Dual HTTP and HTTPS Sniffer Socket Routing"
type: "decision"
layer: "architecture"
source: "src/minepanel.ts"
tags:
  - minepanel
  - architecture
  - decision
---

# Architectural Decision: Dual HTTP and HTTPS Sniffer Socket Routing

## Context
Self-hosted users frequently run MinePanel directly without a reverse proxy. When HTTPS is enabled, users often accidentally type `http://host:port` instead of `https://host:port`, receiving confusing connection reset errors in their browsers.

## Decision
When `CONFIG.HTTPS_ENABLED` is true, [[MinePanel Entrypoint]] binds a raw Node.js `net.createServer` TCP socket.
- On each new incoming socket, it inspects the first byte of data:
  - If byte `=== 22` (TLS ClientHello handshake), the socket is passed to `secureServer.emit('connection', socket)`.
  - Otherwise, the socket is passed to `redirectServer.emit('connection', socket)`, which issues an HTTP 301 Permanent Redirect to `https://<host><url>`.

## Consequences
- Single port supports both HTTPS traffic and graceful HTTP-to-HTTPS redirects without requiring a second open port or external Nginx proxy.

## Relationships
- Implemented in: [[MinePanel Entrypoint]]
- Configured by: [[Config Module]]
