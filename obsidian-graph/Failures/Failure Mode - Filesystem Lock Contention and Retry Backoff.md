---
title: "Failure Mode - Filesystem Lock Contention and Retry Backoff"
type: "failure"
layer: "safety"
source: "src/core/utils/fsRetry.ts"
tags:
  - minepanel
  - safety
  - failure
---

# Failure Mode: Filesystem Lock Contention and Retry Backoff

## Trigger
On Windows environments, active Java processes, antivirus scanners, or indexing daemons frequently hold transient file handles on jars, world files, or plugins (`EBUSY` or `EPERM`).

## Handler Implementation
[[File Retry Utility]] wraps critical filesystem operations with exponential backoff:
- Default: 5 retry attempts with progressive delays (100ms, 200ms, 400ms, 800ms, 1600ms).
- Catches `EBUSY`, `EPERM`, and `EACCES`, retrying until the lock clears before bubbling errors to the user.
