---
title: System Diagnostics Routes
type: route
source_file: src/routes/systemRoutes.ts
tags:
  - #route
  - #monitoring
---

# System Diagnostics Routes

Host-level diagnostic endpoints providing hardware telemetry, OS information, and Java runtime installations.

## Endpoints
- \`GET /api/system/info\`: Host OS version, total/free RAM, CPU cores, load average.
- \`GET /api/system/java\`: Detects installed Java runtime versions (Java 8, 11, 17, 21) via [[Java Manager]].
- \`GET /api/system/metrics\`: Prometheus-compatible exposition format.

## Related Architecture
- Subsystem: [[Subsystem - Core Backend and Web Server]]
- Metrics: [[Performance Telemetry Collector]]
- UI View: [[Frontend Page - Server Settings]]
