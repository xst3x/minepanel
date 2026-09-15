---
title: "Automation Worker Manager"
type: "manager"
layer: "automation"
source: "src/core/automation/workerManager.ts"
tags:
  - minepanel
  - automation
  - manager
---

# Automation Worker Manager

**Source**: `src/core/automation/workerManager.ts`

`Automation Worker Manager` maintains the execution pool for user Python scripts. It spawns the Python runtime, manages execution timeouts (5-second default limit), and forcefully issues `SIGKILL` if an automation script fails to terminate cleanly.

## Relationships
- Belongs to: [[Subsystem - Server Automations Engine]]
- Used by: [[Automation Engine]]
- Spawns: [[Python Sandbox Runner]]
