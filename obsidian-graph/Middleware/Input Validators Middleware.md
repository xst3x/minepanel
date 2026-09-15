---
title: Input Validators Middleware
type: middleware
source_file: src/middleware/validators.ts
tags:
  - #middleware
  - #security
---

# Input Validators Middleware

Express validation middleware built on `express-validator` ensuring strict schema enforcement before controller execution.

## Common Validators
- Server creation/update payload validation (ports, memory ranges, names).
- User authentication and password complexity validation.
- Path traversal prevention for file manager operations.

## Related Architecture
- Used across: [[Server Management Routes]], [[User Management Routes]], [[File Routes]]
- Uses: [[Application Errors Framework]]
