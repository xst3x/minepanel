---
title: "Process Manager Wrapper"
type: "wrapper"
layer: "worker"
source: "src/core/processManager.ts"
tags:
  - minepanel
  - worker
  - wrapper
---

# Process Manager Wrapper

**Source**: `src/core/processManager.ts`

`Process Manager Wrapper` is an environment-aware facade that conditionally exports the appropriate process manager implementation depending on the executing process:
- In the Worker process (`process.env.MINEPANEL_PROCESS === 'worker'`) or Test suite: Instantiates [[Real Process Manager]].
- In the Web API process: Instantiates [[Proxy Process Manager]].

This design ensures identical method signatures across both tiers while isolating child process spawning to the worker.

## Relationships
- Belongs to: [[Subsystem - Process Management and Workers]]
- Instantiates: [[Real Process Manager]] OR [[Proxy Process Manager]]
