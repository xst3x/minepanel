---
title: "Scheduler - Auto-Update Polling Scheduler"
type: "scheduler"
layer: "backend"
source: "src/core/update/UpdateScheduler.ts"
tags:
  - minepanel
  - backend
  - scheduler
---

# Scheduler: Auto-Update Polling Scheduler

**Source**: `src/core/update/UpdateScheduler.ts`

Background loop that evaluates servers configured with automatic software updates. Polls upstream version resolvers, creates pre-update rollback backups, and applies approved minor/patch builds.

## Relationships
- Part of: [[Update Scheduler]]
- Executes: [[Update Manager]]
