---
title: "Update Scheduler"
type: "service"
layer: "core"
source: "src/core/update/UpdateScheduler.ts"
tags:
  - minepanel
  - core
  - service
---

# Update Scheduler

**Source**: `src/core/update/UpdateScheduler.ts`

`Update Scheduler` runs recurring background checks for server software updates. Servers configured with auto-update policies are checked at scheduled intervals, triggering notifications or automatic update execution.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Update Manager]]
- Managed by: [[MinePanel Entrypoint]]
