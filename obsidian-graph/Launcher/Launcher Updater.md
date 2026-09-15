---
title: Launcher Updater
type: launcher
source_file: src/launcher/updater.ts
tags:
  - #launcher
  - #backend
---

# Launcher Updater

Self-updating module capable of pulling git updates, rebuilding frontend assets, and running database migrations prior to backend launch.

## Key Steps
1. Checks remote repository for new commits or releases.
2. Stashes local modifications and pulls changes.
3. Runs `npm install` and `npm run build` if dependencies changed.
4. Executes [[Database Migration Runner]] before spawning backend.

## Related Architecture
- Subsystem: [[Subsystem - Supervisor and Launcher]]
