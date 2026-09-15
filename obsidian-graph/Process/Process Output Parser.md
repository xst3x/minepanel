---
title: "Process Output Parser"
type: "utility"
layer: "worker"
source: "src/core/process-output-parser.ts"
tags:
  - minepanel
  - worker
  - utility
---

# Process Output Parser

**Source**: `src/core/process-output-parser.ts`

`Process Output Parser` analyzes raw stdout and stderr output from Minecraft child processes to identify lifecycle transitions (e.g. `Done (X.XXs)! For help, type "help"` signaling that the server is ready, or bind errors signaling port collisions).

## Relationships
- Belongs to: [[Subsystem - Process Management and Workers]]
- Used by: [[Real Process Manager]]
