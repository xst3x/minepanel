---
title: "Observability - Structured Logging and Stdio Redirection"
type: "observability"
layer: "backend"
source: "src/core/utils/logger.ts"
tags:
  - minepanel
  - backend
  - observability
---

# Observability: Structured Logging and Stdio Redirection

**Source**: `src/core/utils/logger.ts`

Winston-powered logging service providing colored timestamped console transports and rolling daily file transports in `logs/minepanel.log`. Automatically masks passwords, JWT secrets, and tokens from log output.

## Relationships
- Imported across all backend controllers, services, and managers.
