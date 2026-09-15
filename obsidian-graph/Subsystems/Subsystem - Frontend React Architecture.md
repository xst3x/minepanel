---
title: "Subsystem - Frontend React Architecture"
type: "subsystem"
layer: "frontend"
source: "src/frontend/src/App.tsx"
tags:
  - minepanel
  - frontend
  - subsystem
---

# Subsystem: Frontend React Architecture

The **Frontend React Architecture** subsystem is a single-page application (SPA) built with React 18 and Vite 5. It communicates with the backend via HTTP REST endpoints and real-time WebSockets, delivering an app-like dashboard experience.

## Key Responsibilities
1. **Responsive Application Shell**: Houses sidebar navigation, theme accent selection, global modal dialogs, and user profile management.
2. **Context-Driven State**: Distributes authentication state, user roles, and server modals globally via React Context.
3. **Real-time Terminal Emulation**: Renders ANSI color codes, handles keyboard shortcuts, and buffers console output smoothly.
4. **Specialized Views**: Implements focused tab views for server overview, files, plugins, backups, properties, automations, and player management.

## Connected Architectural Nodes
- [[Frontend App Shell]]: Root React router, layout skeleton, and global navigation.
- [[Frontend Auth Context]]: Centralized user authentication state and permission helpers.
- [[Frontend API Client]]: Configured Axios instance injecting JWT tokens and intercepting errors.
- [[Frontend Server Layout]]: Tabbed navigation wrapper for individual Minecraft server management.
- [[Frontend Console View]]: Real-time WebSocket terminal for command input and log monitoring.
- [[Frontend File Manager View]]: File browser, upload dropzone, and in-browser code editor.
- [[Frontend Automation View]]: Interactive Python automation editor, tester, and log viewer.
- [[Frontend Overview View]]: High-level dashboard displaying CPU/RAM charts, uptime, and quick controls.

## Extended Frontend Pages & Components
- [[Frontend Page - Servers]]
- [[Frontend Page - Docs]]
- [[Frontend Page - PocketMine Plugins]]
- [[Frontend Component - AppLayout]]
- [[Frontend Component - ServerLayout]]
- [[Frontend Component - RequireAuth]]
- [[Frontend Component - ModpackBrowser]]
- [[Frontend Component - CodeEditor]]
- [[Frontend Context - ServerModalsContext]]
- [[Frontend Context - AuthContext]]
