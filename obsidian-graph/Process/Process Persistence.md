---
title: "Process Persistence"
type: "utility"
layer: "worker"
source: "src/core/process-persistence.ts"
tags:
  - minepanel
  - worker
  - utility
---

# Process Persistence

**Source**: `src/core/process-persistence.ts`

`Process Persistence` records the process IDs (PIDs) of running Minecraft servers to disk in `data/running_servers.json`. If the MinePanel backend or worker restarts unexpectedly, this module allows the system to detect that Minecraft processes are still alive and re-attach management without killing active game sessions.

## Relationships
- Belongs to: [[Subsystem - Process Management and Workers]]
- Used by: [[Real Process Manager]]
