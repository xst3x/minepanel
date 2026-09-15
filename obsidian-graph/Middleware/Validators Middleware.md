---
title: "Validators Middleware"
type: "middleware"
layer: "backend"
source: "src/middleware/validators.ts"
tags:
  - minepanel
  - backend
  - middleware
---

# Validators Middleware

**Source**: `src/middleware/validators.ts`

Provides Joi-based and custom request validation schemas:
- Server creation (name, port range, memory limits).
- User registration and password strength.
- File upload constraints and path sanitization.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Used by: [[Server Management Routes]], [[Auth Routes]]
