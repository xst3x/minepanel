---
title: "File Retry Utility"
type: "utility"
layer: "core"
source: "src/core/utils/fsRetry.ts"
tags:
  - minepanel
  - core
  - utility
---

# File Retry Utility

**Source**: `src/core/utils/fsRetry.ts`

Provides retry-with-backoff wrappers (`retryRename`, `retryDelete`, `retryUnlink`, `retryCopy`) designed to handle Windows file locking issues where antiviruses or processes temporarily lock files.

## Relationships
- Belongs to: [[Subsystem - Core Backend and Web Server]]
- Used by: [[Server Helper]], [[File Routes]]
