---
title: "Threshold Manager"
type: "manager"
layer: "monitoring"
source: "src/core/thresholdManager.ts"
tags:
  - minepanel
  - monitoring
  - manager
---

# Threshold Manager

**Source**: `src/core/thresholdManager.ts`

`Threshold Manager` implements a multi-threshold escalation ladder protecting servers from thermal throttling and out-of-memory crashes.

## Supported Escalation Ladder
Each server can configure ordered thresholds for `cpu_temperature` and `ram_percent`:
1. `log`: Writes a notice to server logs.
2. `notify`: Broadcasts alert to connected panel users.
3. `alert`: Sends priority alert (e.g. Discord notification).
4. `throttle`: Engages [[Throttle Manager]] to restrict CPU scheduling.
5. `restart`: Initiates a graceful restart.
6. `stop`: Gracefully shuts down the server to protect hardware.

## Relationships
- Belongs to: [[Subsystem - Resource Monitoring and Safety]]
- Uses: [[Throttle Manager]], [[Process Manager Wrapper]], [[Database Access Layer]]
