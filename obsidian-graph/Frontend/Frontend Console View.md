---
title: "Frontend Console View"
type: "page"
layer: "frontend"
source: "src/frontend/src/pages/server/Console.tsx"
tags:
  - minepanel
  - frontend
  - page
---

# Frontend Console View

**Source**: `src/frontend/src/pages/server/Console.tsx`

Interactive browser terminal for real-time Minecraft server administration.
- Connects to [[WebSocket Console Server]] over `/ws`.
- Renders colored Minecraft console logs with ANSI / formatting code support.
- Command input field supporting command history (Up/Down arrow keys) and auto-completion.
- Direct Chat tab executing sanitized `/say` broadcasts.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Connects to: [[WebSocket Console Server]]
