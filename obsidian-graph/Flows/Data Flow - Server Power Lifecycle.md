---
title: "Data Flow - Server Power Lifecycle"
type: "flow"
layer: "architecture"
source: "src/routes/modules/serverLifecycleRoutes.ts"
tags:
  - minepanel
  - architecture
  - flow
---

# Data Flow: Server Power Lifecycle

Traces how a user action (Start, Graceful Stop, Restart, Kill) executes safely across API locks, IPC channels, and native operating system processes.

```mermaid
sequenceDiagram
    participant UI as Frontend Overview View / Control
    participant Route as Server Lifecycle Routes
    participant Proxy as Proxy Process Manager
    participant Worker as Worker Process
    participant Real as Real Process Manager
    participant Persist as Process Persistence
    participant OS as Operating System Process

    UI->>Route: POST /api/servers/:id/start
    Route->>Proxy: acquireLock(serverId, 60000)
    alt Server already locked
        Proxy-->>Route: false (Operation rejected: busy)
    else Lock acquired
        Route->>Proxy: start(serverId, serverDir, javaArgs, jarFile, ...)
        Proxy->>Worker: IPC message: 'start-server'
        Worker->>Real: start(...)
        Real->>OS: child_process.spawn(executable, args, env)
        Real->>Persist: Save PID to data/running_servers.json
        Real->>Worker: emit('status', 'online', pid)
        Worker->>Proxy: IPC message: 'status'
        Proxy->>Proxy: releaseLock(serverId)
        Proxy-->>Route: success: true
        Route-->>UI: HTTP 200 OK
    end
```

## Key Safeguards
- **Mutex Locks**: `acquireLock(serverId)` prevents concurrent start/stop race conditions.
- **PID Persistence**: Active PIDs are saved to `data/running_servers.json` so crashes in the web panel don't terminate running servers.
