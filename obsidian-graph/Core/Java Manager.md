---
title: "Java Manager"
type: "manager"
layer: "backend"
source: "src/core/javaManager.ts"
tags:
  - minepanel
  - backend
  - manager
---

# Java Manager

**Source**: `src/core/javaManager.ts`

`Java Manager` discovers, validates, and manages Java runtime environments (JRE/JDK) on the host operating system. Modern Minecraft versions require specific Java releases (e.g. Java 8 for 1.12.2, Java 17 for 1.18–1.20.4, Java 21 for 1.20.5+); Java Manager verifies that appropriate runtimes are available.

## Key Functions
- `getJavaPath(customPath)`: Resolves custom path or defaults to system `java`.
- `getJavaVersion(javaPath)`: Runs `java -version` and parses major version number.
- `listAvailableJavaInstallations()`: Scans standard OS directories (`Program Files/Java`, `/usr/lib/jvm`) for installed runtimes.

## Relationships
- Belongs to: [[Subsystem - Server Lifecycle and Adapters]]
- Used by: [[Server Lifecycle Routes]], [[MinePanel Entrypoint]], [[Update Manager]]
