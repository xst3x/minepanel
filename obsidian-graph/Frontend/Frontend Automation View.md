---
title: "Frontend Automation View"
type: "page"
layer: "frontend"
source: "src/frontend/src/pages/server/Automation.tsx"
tags:
  - minepanel
  - frontend
  - page
---

# Frontend Automation View

**Source**: `src/frontend/src/pages/server/Automation.tsx`

User interface for crafting event-driven Python automations:
- Interactive rule builder selecting event triggers (`player_join`, `player_chat`, `server_stop`).
- Python code editor with syntax linting and AST error reporting.
- "Test Script" button executing the code safely in the sandbox with live output display.
- Execution history and automation log streams.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Calls: [[Automation Routes]] via [[Frontend API Client]]
