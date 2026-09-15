---
title: Frontend Component - AppLayout
type: frontend
source_file: src/frontend/src/components/AppLayout.tsx
tags:
  - #frontend
---

# Frontend Component - AppLayout

Primary application layout component wrapping all authenticated views in MinePanel.

## Structure
- Left sidebar with navigation links (Servers, Users, Ranks, Discord, Docs, Settings).
- Top navbar with current user profile, avatar, and logout trigger.
- Toast container for toast notifications.

## Related Architecture
- Guard: [[Frontend Component - RequireAuth]]
- Context: [[Frontend Context - AuthContext]]
