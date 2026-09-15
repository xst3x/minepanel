---
title: "Update Manager"
type: "manager"
layer: "core"
source: "src/core/update/UpdateManager.ts"
tags:
  - minepanel
  - core
  - manager
---

# Update Manager

**Source**: `src/core/update/UpdateManager.ts`

`Update Manager` orchestrates the software update lifecycle for a Minecraft server. It ensures safe updates by verifying compatibility, creating rollback backups, and swapping jar files atomically while the server is stopped.

## Update Lifecycle
1. `checkForUpdate(serverId)`: Queries resolvers to see if a newer build or version is available.
2. `runUpdate(serverId, targetVersion, targetBuild)`:
   - Acquires server lock via [[Process Manager Wrapper]].
   - Verifies Java compatibility via [[Compatibility Engine]].
   - Gracefully stops the server.
   - Creates a full rollback backup via [[Server Helper]].
   - Downloads new server jar to temporary file, validates checksum, and atomically swaps with `server.jar`.
   - Restarts the server.
3. `rollback(serverId)`: Restores the pre-update backup if the new version fails to boot.

## Relationships
- Belongs to: [[Subsystem - Software Resolvers and Updates]]
- Uses: [[Software Version Resolvers]], [[Compatibility Engine]], [[Server Helper]], [[Process Manager Wrapper]]
