---
title: "Frontend Log Parser"
type: "utility"
layer: "frontend"
source: "src/frontend/src/lib/minecraftLog.ts"
tags:
  - minepanel
  - frontend
  - utility
---

# Frontend Log Parser

**Source**: `src/frontend/src/lib/minecraftLog.ts`

Transforms raw Minecraft console stdout strings into styled React elements. Converts Minecraft `§` color codes and standard ANSI terminal escapes into theme-friendly CSS colors.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Used by: [[Frontend Console View]]
