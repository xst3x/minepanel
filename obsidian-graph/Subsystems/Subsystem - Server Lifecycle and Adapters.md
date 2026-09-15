---
title: "Subsystem - Server Lifecycle and Adapters"
type: "subsystem"
layer: "adapter"
source: "src/routes/modules/serverLifecycleRoutes.ts"
tags:
  - minepanel
  - adapter
  - subsystem
---

# Subsystem: Server Lifecycle and Adapters

The **Server Lifecycle and Adapters** subsystem handles starting, stopping, restarting, killing, creating, and modifying Minecraft game servers across three distinct engine families: Java Edition, Bedrock Dedicated Server, and PocketMine-MP.

## Key Responsibilities
1. **Unified Launch Descriptors**: Translates database server configurations into exact platform-specific launch arguments, binaries, and environment variables.
2. **Graceful Shutdown**: Sends `stop` or `save-all` to the console, waiting for clean exit before falling back to `SIGTERM`/`SIGKILL`.
3. **Platform Adapters**:
   - Java: Manages JVM flags, heap size, and Java version selection via [[Java Manager]].
   - Bedrock: Resolves native `bedrock_server.exe`/`bedrock_server` binary and dynamically configures `server.properties` via [[Bedrock Adapter]].
   - PocketMine: Executes PHP binary with PocketMine runtime descriptors via [[PocketMine Adapter]].

## Connected Architectural Nodes
- [[Server Lifecycle Routes]]: HTTP API endpoints for power actions (`/start`, `/stop`, `/restart`, `/kill`).
- [[Server Management Routes]]: Server creation, deletion, server.jar uploading, and settings updates.
- [[Bedrock Adapter]]: Platform adapter for official Minecraft Bedrock Dedicated Servers.
- [[PocketMine Adapter]]: Platform adapter for PocketMine-MP PHP servers.
- [[Java Manager]]: Discovery and validation of installed Java runtimes (Java 8 to 21+).
- [[Server Helper]]: Filesystem directories and server property management.
