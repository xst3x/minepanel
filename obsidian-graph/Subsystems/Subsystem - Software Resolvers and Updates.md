---
title: "Subsystem - Software Resolvers and Updates"
type: "subsystem"
layer: "core"
source: "src/core/resolvers/index.ts"
tags:
  - minepanel
  - core
  - subsystem
---

# Subsystem: Software Resolvers and Updates

The **Software Resolvers and Updates** subsystem automates the discovery, compatibility verification, download, and atomic installation of Minecraft server binaries and modpacks.

## Key Responsibilities
1. **Dynamic Version Resolvers**: Interfaces with remote upstream APIs to fetch builds for Paper, Purpur, Fabric, Forge, NeoForge, Quilt, Magma, Mohist, Leaves, Folia, Velocity, Waterfall, and Vanilla.
2. **Automated Updates**: Manages the complete update lifecycle: pre-flight compatibility check → graceful server stop → pre-update backup → atomic jar replacement → restart.
3. **Compatibility Safeguards**: Checks required Java runtimes against the host system to prevent unbootable server configurations.
4. **Modpack Installer**: Searches Modrinth for CurseForge/Modrinth modpacks, downloading and extracting them into the server folder.

## Connected Architectural Nodes
- [[Software Version Resolvers]]: Upstream API scrapers and artifact downloaders.
- [[Version Manager]]: Metadata cache storing available Minecraft editions and versions.
- [[Update Manager]]: Single-server update coordinator handling rollback backups and downloads.
- [[Update Scheduler]]: Automated cron/interval worker checking for new software releases.
- [[Compatibility Engine]]: Evaluator verifying Java version and dependency requirements.
- [[Modpack Service]]: Modrinth integration searching and downloading modpacks.
