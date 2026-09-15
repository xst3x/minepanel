---
title: "Data Flow - Sandboxed Python Automations"
type: "flow"
layer: "architecture"
source: "src/core/automationEngine.ts"
tags:
  - minepanel
  - architecture
  - flow
---

# Data Flow: Sandboxed Python Automations

Traces how Minecraft console log events trigger isolated, AST-validated Python scripts.

```mermaid
flowchart TD
    Stdout["Console Log Output"] --> Parser["Automation Engine (Regex Matcher)"]
    Parser -->|"Matches: player_join, player_chat, server_stop"| Trigger["Trigger Event Fired"]
    Trigger --> CacheCheck{"Is Automation Enabled & Cached?"}
    CacheCheck -- No --> Ignore["Ignore line (Zero overhead)"]
    CacheCheck -- Yes --> WorkerPool["Automation Worker Manager"]
    WorkerPool --> PreCheck["Python AST Validator (AST Inspection)"]
    PreCheck -- Disallowed Import (os, sys, socket) --> Block["Reject Script with Error"]
    PreCheck -- Valid Script --> Runner["Python Sandbox Runner Subprocess"]
    Runner --> API["Inject safe 'minepanel' mock runtime"]
    API --> Command["minepanel.send_command(cmd) via ProcessManager"]
    Runner --> Timeout{"Execution <= 5s?"}
    Timeout -- Exceeded --> Kill["Force SIGKILL to subprocess"]
    Timeout -- Clean Exit --> Log["Emit automation log to UI"]
```


## Architecture Connections
- Engine: [[Automation Engine]], [[Subsystem - Server Automations Engine]]
- Python Sandbox: [[Python Sandbox Runner]], [[Python AST Validator]]
- Flow: [[Data Flow - Sandboxed Python Automations]]
- UI View: [[Frontend Automation View]]
