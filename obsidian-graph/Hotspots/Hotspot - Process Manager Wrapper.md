---
title: "Hotspot - Process Manager Wrapper"
type: "hotspot"
layer: "worker"
source: "src/core/processManager.ts"
tags:
  - minepanel
  - worker
  - hotspot
---

# Architectural Hotspot: Process Manager Wrapper

**Central Abstraction Boundary**

Bridges web controllers with native OS processes across the IPC boundary. Provides an identical API interface regardless of whether the calling code runs in an API worker or standalone test suite.
