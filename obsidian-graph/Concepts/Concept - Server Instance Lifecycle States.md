---
title: "Concept - Server Instance Lifecycle States"
type: "concept"
layer: "domain"
source: "src/core/process-real-manager.ts"
tags:
  - minepanel
  - domain
  - concept
---

# Domain Concept: Server Instance Lifecycle States

The operational state machine governing Minecraft child processes.

```mermaid
stateDiagram-v2
    [*] --> offline
    offline --> starting : start() invoked
    starting --> online : "Done!" regex detected in stdout
    online --> stopping : stop() / gracefulStop()
    stopping --> offline : exit code 0
    online --> crashed : exit code != 0
    starting --> crashed : bind error / memory failure
    crashed --> starting : auto-restart timeout (5s)
    crashed --> offline : autostart_on_crash disabled
```

## State Definitions
- **`offline`**: Process is not running. Files can be safely edited, restored, or deleted.
- **`starting`**: Process spawned; waiting for initialization string in stdout.
- **`online`**: Server accepting player connections; console accepts commands.
- **`stopping`**: Shutdown signal dispatched; waiting for clean exit.
- **`crashed`**: Process exited unexpectedly.
