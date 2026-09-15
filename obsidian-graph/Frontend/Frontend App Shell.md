---
title: "Frontend App Shell"
type: "frontend"
layer: "frontend"
source: "src/frontend/src/App.tsx"
tags:
  - minepanel
  - frontend
  - frontend
---

# Frontend App Shell

**Source**: `src/frontend/src/App.tsx` & `src/frontend/src/components/AppLayout.tsx`

The root React application layout. It defines React Router routes, wraps the UI in `AuthProvider`, renders the global sidebar navigation, applies color theme accents, and embeds modal dialogs.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Provides: [[Frontend Auth Context]]
- Embeds: [[Frontend Server Layout]]
