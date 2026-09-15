---
title: "Stats Collector"
type: "service"
layer: "monitoring"
source: "src/core/statsCollector.ts"
tags:
  - minepanel
  - monitoring
  - service
---

# Stats Collector

**Source**: `src/core/statsCollector.ts`

`Stats Collector` is a background service that samples CPU, RAM, and server metrics at regular intervals. It periodically writes samples to [[Model - ServerStats]] in SQLite and prunes historical records according to configured data retention policies.

## Relationships
- Belongs to: [[Subsystem - Resource Monitoring and Safety]]
- Uses: [[Database Access Layer]], [[Process Manager Wrapper]], [[Model - ServerStats]]
