---
title: "Console Stats Parser"
type: "utility"
layer: "monitoring"
source: "src/core/utils/consoleStatsParser.ts"
tags:
  - minepanel
  - monitoring
  - utility
---

# Console Stats Parser

**Source**: `src/core/utils/consoleStatsParser.ts`

`Console Stats Parser` scans Minecraft console lines to extract runtime game performance indicators, including TPS (Ticks Per Second), memory tick timings from Paper/Purpur, and player counts from list commands.

## Relationships
- Belongs to: [[Subsystem - Resource Monitoring and Safety]]
- Used by: [[Stats Collector]]
