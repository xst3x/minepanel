---
title: Frontend Component - RequireAuth
type: frontend
source_file: src/frontend/src/components/RequireAuth.tsx
tags:
  - #frontend
  - #security
---

# Frontend Component - RequireAuth

React Router guard component enforcing authentication and 2FA challenge completion before rendering child views.

## Logic Flow
1. Inspects `isAuthenticated` and `is2FaPending` from [[Frontend Context - AuthContext]].
2. Redirects unauthenticated visitors to `/login`.
3. Redirects users with pending TOTP challenge to 2FA prompt.

## Related Architecture
- Subsystem: [[Subsystem - Authentication and Permissions]]
