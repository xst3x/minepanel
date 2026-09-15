---
title: "Concept - Minecraft Server Entity"
type: "concept"
layer: "domain"
source: "src/db/models/Server.ts"
tags:
  - minepanel
  - domain
  - concept
---

# Domain Concept: Minecraft Server Entity

The central aggregate root in MinePanel. Represents a discrete Minecraft installation with unique network ports, memory constraints, platform software, directory storage, and permissions.

## Core Properties
- **Identity**: Numeric integer `id` mapped to physical directory `servers/<id>/`.
- **Engine Family**: Java (`paper`, `purpur`, `fabric`, `forge`, `vanilla`), Bedrock Dedicated Server (`bedrock`), or PocketMine-MP (`pocketmine`).
- **Network Footprint**: Primary game port, optional extra ports array, and dedicated SFTP port.
- **Autonomous Policies**: `autostart` (on panel boot), `autostart_on_crash` (recovery loop), and `auto_update` schedule.

## Relationships
- Backed by: [[Model - Server]]
- State machine: [[Concept - Server Instance Lifecycle States]]
- Governed by: [[Subsystem - Server Lifecycle and Adapters]]
