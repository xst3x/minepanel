---
title: "Subsystem - Server Automations Engine"
type: "subsystem"
layer: "automation"
source: "src/core/automationEngine.ts"
tags:
  - minepanel
  - automation
  - subsystem
---

# Subsystem: Server Automations Engine

The **Server Automations Engine** allows administrators to define custom Python 3 automation scripts that react in real-time to Minecraft console events (e.g. player join/leave, chat messages, server ready, crash).

## Security & Isolation
To prevent malicious code execution, the automation engine incorporates two strict security gates:
1. **Python AST Validation**: Before saving or running, [[Python AST Validator]] analyzes the syntax tree to strictly forbid dangerous modules (`os`, `sys`, `subprocess`, `socket`, etc.).
2. **Sandboxed Worker Pool**: Scripts run inside [[Python Sandbox Runner]] via [[Automation Worker Manager]] with strict CPU timeouts (5s default) and hard SIGKILL enforcement.

## Connected Architectural Nodes
- [[Automation Engine]]: Real-time regex log pattern matcher firing event triggers.
- [[Automation Worker Manager]]: Process pool managing isolated Python subprocess lifecycles.
- [[Python Sandbox Runner]]: Python harness exposing safe `minepanel` APIs to user scripts.
- [[Python AST Validator]]: Static code analysis blocking prohibited Python libraries.
- [[Automation Routes]]: REST API for managing automation rules and testing scripts.
- [[Frontend Automation View]]: User interface for script authoring, testing, and viewing execution logs.


## Architecture Connections
- Engine: [[Automation Engine]], [[Subsystem - Server Automations Engine]]
- Python Sandbox: [[Python Sandbox Runner]], [[Python AST Validator]]
- Flow: [[Data Flow - Sandboxed Python Automations]]
- UI View: [[Frontend Automation View]]
