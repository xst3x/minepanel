---
title: Request Logger Middleware
type: middleware
source_file: src/middleware/requestLogger.ts
tags:
  - #middleware
  - #observability
---

# Request Logger Middleware

Structured HTTP request/response logging middleware for performance and security audit trails.

## Features
- Logs HTTP Method, Path, Status Code, Response Duration (ms).
- Records client IP and User-Agent.
- Masks sensitive credentials in request bodies (passwords, tokens, TOTP secrets).

## Related Architecture
- Subsystem: [[Observability - Structured Logging and Stdio Redirection]]
- Feeds into: [[Model - AuditLog]]
