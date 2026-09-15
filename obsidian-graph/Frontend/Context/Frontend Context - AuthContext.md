---
title: Frontend Context - AuthContext
type: frontend
source_file: src/frontend/src/context/AuthContext.tsx
tags:
  - #frontend
  - #security
---

# Frontend Context - AuthContext

Global React Context managing user authentication state, active JWT tokens, and user permissions.

## State Provided
- `user`: Logged-in user profile and role.
- `token`: Bearer JWT token stored in localStorage/session.
- `login(credentials)`: Authenticates user.
- `verify2Fa(code)`: Submits TOTP code.
- `logout()`: Clears local session and notifies API.

## Related Architecture
- Guard: [[Frontend Component - RequireAuth]]
- API: [[Auth Routes]]
