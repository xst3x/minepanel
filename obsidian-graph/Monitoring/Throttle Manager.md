---
title: "Throttle Manager"
type: "service"
layer: "monitoring"
source: "src/core/throttleManager.ts"
tags:
  - minepanel
  - monitoring
  - service
---

# Throttle Manager

**Source**: `src/core/throttleManager.ts`

`Throttle Manager` applies progressive CPU throttling to runaway Minecraft server processes. On Windows, it adjusts process priority classes and thread affinities; on Linux, it leverages `renice` and CPU cgroup controls to reduce host load.

## Relationships
- Belongs to: [[Subsystem - Resource Monitoring and Safety]]
- Controlled by: [[Threshold Manager]]
