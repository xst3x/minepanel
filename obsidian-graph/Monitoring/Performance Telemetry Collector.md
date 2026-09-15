---
title: Performance Telemetry Collector
type: monitoring
source_file: src/core/performance.ts
tags:
  - #monitoring
  - #core
  - #observability
---

# Performance Telemetry Collector

High-precision telemetry engine measuring host system resource utilization and Node.js process runtime health.

## Metrics Sampled
- **Event Loop Lag**: Measures latency in the Node.js libuv event loop to detect blocking synchronous operations.
- **V8 Heap Statistics**: Total heap size, used heap size, heap size limit, and garbage collection pauses.
- **Host CPU & Memory**: Load averages, per-core CPU utilization percentage, and free system memory.
- **Server Instance Rollups**: Aggregated metrics across all running Minecraft child processes managed by [[Process Manager Wrapper]].

## Architectural Integration
- Sampled periodically by [[Stats Collector]].
- Exported via [[Observability - Prometheus Metrics Export]].
- Trigger checks evaluated in [[Threshold Manager]].

## Related Architecture
- Subsystem: [[Subsystem - Resource Monitoring and Safety]]
- Routes: [[Stats Routes]]
- Model: [[Model - ServerStats]]
