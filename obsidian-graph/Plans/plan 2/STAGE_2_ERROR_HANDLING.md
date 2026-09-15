---
title: "STAGE_2_ERROR_HANDLING"
type: "plan"
tags:
  - #plan
  - #architecture
---

# STAGE_2_ERROR_HANDLING

> Internal development plan for [[Project]].

# STAGE 2: STANDARDIZED ERROR HANDLING
**Duration:** 3-4 hours
**Status:** HIGH

## STAGE GOAL
Replace all raw JSON error responses with the centralized `sendError(res, E.CODE, status)` helper.

## TASKS
1. Map all existing `res.status().json()` to `E.*` codes.
2. Ensure all `catch (err)` blocks use Winston `logger.error`.
3. Distinguish between token expiration and invalidation in `authenticateToken`.


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Framework: [[Application Errors Framework]]
- Structured Codes: [[Application Error Codes]]
- Web Server Handler: [[MinePanel Entrypoint]]
