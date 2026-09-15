---
title: Application Errors Framework
type: core
source_file: src/core/errors.ts
tags:
  - #core
  - #backend
---

# Application Errors Framework

Standardized error hierarchy for MinePanel backend services and API routes.

## Class Hierarchy
- `AppError` (Base custom error with message, statusCode, errorCode, details)
  - `NotFoundError` (404)
  - `ValidationError` (400)
  - `UnauthorizedError` (401)
  - `ForbiddenError` (403)
  - `ConflictError` (409)
  - `ProcessExecutionError` (500)

## Related Architecture
- Error constants: [[Application Error Codes]]
- Caught by: Global Express error handler in [[MinePanel Entrypoint]]
- Subsystem: [[Subsystem - Core Backend and Web Server]]
