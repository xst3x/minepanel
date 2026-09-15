---
title: "Observability - Prometheus Metrics Export"
type: "observability"
layer: "backend"
source: "src/minepanel.ts"
tags:
  - minepanel
  - backend
  - observability
---

# Observability: Prometheus Metrics Export

**Source**: `src/minepanel.ts` (`GET /metrics`)

Exposes host and panel operational metrics formatted for Prometheus scrapers and Grafana dashboards:
- `minepanel_uptime_seconds`: Total panel uptime gauge.
- `minepanel_memory_heap_used_bytes`: Node.js V8 heap memory.
- `minepanel_memory_rss_bytes`: Resident set memory size.

## Security
Guarded by JWT verification unless `METRICS_AUTH=false` is configured for trusted monitoring subnets.

## Relationships
- Implemented in: [[MinePanel Entrypoint]]
