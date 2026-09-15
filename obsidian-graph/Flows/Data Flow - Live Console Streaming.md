---
title: "Data Flow - Live Console Streaming"
type: "flow"
layer: "architecture"
source: "src/minepanel.ts"
tags:
  - minepanel
  - architecture
  - flow
---

# Data Flow: Live Console Streaming

Traces how server console stdout/stderr lines travel in real time from the Minecraft operating system process to browser terminals and Discord channels.

```mermaid
sequenceDiagram
    participant Game as Minecraft Child Process
    participant Real as Real Process Manager (Worker)
    participant Worker as Worker Process IPC
    participant Proxy as Proxy Process Manager (API)
    participant WSS as WebSocket Console Server
    participant UI as Frontend Console View
    participant Discord as Discord Event Bridge

    Game->>Real: stdout / stderr chunk
    Real->>Real: Parse ANSI, update in-memory circular history (1,000 lines)
    Real->>Worker: emit('console', serverId, line)
    Worker->>Proxy: process.send({ type: 'log', serverId, data })
    Proxy->>WSS: emit('console', serverId, data)
    Proxy->>Discord: emit('console', serverId, data)
    WSS->>UI: ws.send({ type: 'console', data: line })
    Discord->>Discord: Batch lines into 2000-char message chunk & send to Discord channel
```

## Key Architectural Highlights
- **Process Isolation**: The API server never directly handles stdout streams or process pipes; all IPC is non-blocking.
- **Backlog Replay**: When a browser connects to `/ws`, the proxy serves the latest 1,000 lines instantly from memory.
- **Zero-Spam Batching**: Discord forwarding batches logs to avoid hitting Discord REST rate limits.
