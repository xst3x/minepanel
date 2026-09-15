---
title: "Subsystem - Resource Monitoring and Safety"
type: "subsystem"
layer: "monitoring"
source: "src/core/thresholdManager.ts"
tags:
  - minepanel
  - monitoring
  - subsystem
---

# Subsystem: Resource Monitoring and Safety

The **Resource Monitoring and Safety** subsystem continuously tracks the physical health of the host machine and individual Minecraft servers, executing proactive safeguards to prevent overheating, CPU exhaustion, and memory leaks.

## Key Responsibilities
1. **Metrics Ingestion**: Gathers live CPU, RAM, and process statistics via `pidusage` on 500ms intervals.
2. **Escalation Ladders**: Evaluates server metrics against configured multi-threshold ladders, executing progressive actions: `log` → `notify` → `alert` → `throttle` → `restart` → `stop`.
3. **Progressive CPU Throttling**: Reduces thread scheduling and platform process priority as temperatures climb.
4. **Console Stats Parsing**: Inspects server console output to extract live TPS, memory ticks, and online player counts.

## Connected Architectural Nodes
- [[Stats Collector]]: Periodic sampler writing time-series stats to database storage.
- [[Threshold Manager]]: Escalation state machine evaluating temperature and RAM thresholds.
- [[Throttle Manager]]: Process priority adjustor mitigating high CPU loads.
- [[Console Stats Parser]]: RegEx parser extracting TPS and player counts from stdout.
- [[Stats Routes]]: HTTP endpoints providing metric histories and chart data to the UI.
- [[Model - ServerStats]]: SQLite table storing historical metric samples.
