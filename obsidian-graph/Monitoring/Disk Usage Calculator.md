---
title: Disk Usage Calculator
type: monitoring
source_file: src/core/diskUsage.ts
tags:
  - #monitoring
  - #core
---

# Disk Usage Calculator

Asynchronous storage metric calculator computing byte-level directory sizes for Minecraft server folders.

## Operation & Optimization
- Traverses server directory tree (\`servers/:id/\`) recursively.
- Ignores ephemeral locks and temporary sockets to prevent I/O blocking.
- Implements caching with TTL to avoid continuous disk churn on large worlds.
- Feeds total size into [[Migration 007 - Add Disk Bytes to Stats]].

## Related Architecture
- Subsystem: [[Subsystem - Resource Monitoring and Safety]]
- Worker: [[Stats Collector]]
- Model: [[Model - ServerStats]]
- UI View: [[Frontend Overview View]]
