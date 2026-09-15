---
title: "Frontend Server Layout"
type: "layout"
layer: "frontend"
source: "src/frontend/src/components/ServerLayout.tsx"
tags:
  - minepanel
  - frontend
  - layout
---

# Frontend Server Layout

**Source**: `src/frontend/src/components/ServerLayout.tsx`

The server management layout hosting navigation tabs for an active Minecraft server:
- **Overview**: [[Frontend Overview View]]
- **Console**: [[Frontend Console View]]
- **Files**: [[Frontend File Manager View]]
- **Automations**: [[Frontend Automation View]]
- **Players**, **Plugins**, **Backups**, **Properties**, **Logs**, **Settings**

Displays the persistent server header with live status pill, server icon, quick start/stop/restart buttons, and connection address.

## Relationships
- Belongs to: [[Subsystem - Frontend React Architecture]]
- Navigates: [[Frontend Console View]], [[Frontend File Manager View]], [[Frontend Overview View]], [[Frontend Automation View]]
