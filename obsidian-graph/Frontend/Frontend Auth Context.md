---
title: "Frontend Auth Context"
type: "context"
layer: "frontend"
source: "src/frontend/src/context/AuthContext.tsx"
tags:
  - minepanel
  - frontend
  - context
---

# Frontend Auth Context

**Source**: `src/frontend/src/context/AuthContext.tsx`

React Context storing current user authentication details, JWT token, role permissions, and helper methods (`login`, `logout`, `hasPerm`). Automatically synchronizes token state with `localStorage` and configures Axios headers.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Configures: [[Frontend API Client]]
