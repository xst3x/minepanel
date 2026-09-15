---
title: "Automation Engine"
type: "engine"
layer: "automation"
source: "src/core/automationEngine.ts"
tags:
  - minepanel
  - automation
  - engine
---

# Automation Engine

**Source**: `src/core/automationEngine.ts`

`Automation Engine` parses Minecraft console logs in real time to trigger automated user scripts. It connects to [[Process Manager Wrapper]] console events, applies pre-compiled regular expressions, and dispatches events to [[Automation Worker Manager]].

## Supported Event Triggers
- `player_join`: Parsed from `[Thread/INFO]: <player> joined the game`
- `player_leave`: Parsed from `[Thread/INFO]: <player> left the game`
- `player_chat`: Parsed from `[Thread/INFO]: <<player>> <message>` (with 200ms debounce)
- `server_ready`: Parsed from `Done (X.XXs)!`
- `server_stop` / `crash`: Triggered on process exit

## Relationships
- Belongs to: [[Subsystem - Server Automations Engine]]
- Listens to: [[Process Manager Wrapper]]
- Uses: [[Automation Worker Manager]], [[Database Access Layer]]
- Managed by: [[Automation Routes]]
