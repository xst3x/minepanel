---
title: "ADR - Mutex Locking Strategy for Server Lifecycle"
type: "decision"
layer: "architecture"
source: "src/core/process-proxy-manager.ts"
tags:
  - minepanel
  - architecture
  - decision
---

# Architectural Decision: Mutex Locking Strategy for Server Lifecycle

## Context
Concurrent operations on the same Minecraft server (e.g. a user clicking "Start" while a scheduled auto-update is stopping the server and swapping jars) cause filesystem corruption, port binding collisions, and race conditions.

## Decision
Embed an in-memory Mutex Lock mechanism inside [[Proxy Process Manager]] (`acquireLock(serverId, timeoutMs)`, `releaseLock(serverId)`).
- Every lifecycle endpoint in [[Server Lifecycle Routes]] and [[Update Manager]] must successfully acquire the server's lock before dispatching actions.
- Automatic lock expiration timers (default 60,000ms) prevent permanent deadlocks if an unexpected failure occurs.

## Consequences
- Prevents race conditions during start, stop, restart, backup restoration, and jar updates.
- Operations on different servers run concurrently without contention.

## Relationships
- Enforced by: [[Proxy Process Manager]]
- Consumed by: [[Server Lifecycle Routes]], [[Update Manager]]
