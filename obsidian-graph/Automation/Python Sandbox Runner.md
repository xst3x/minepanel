---
title: "Python Sandbox Runner"
type: "worker"
layer: "automation"
source: "src/core/automation/sandbox_runner.py"
tags:
  - minepanel
  - automation
  - worker
---

# Python Sandbox Runner

**Source**: `src/core/automation/sandbox_runner.py`

`Python Sandbox Runner` is the isolated Python harness that executes user automation scripts. It overrides the Python import system, injecting a custom `minepanel` module that exposes safe capabilities:
- `minepanel.send_command(cmd)`
- `minepanel.log(msg)`
- `minepanel.get_stats()`

Any attempt to import prohibited modules or modify protected builtins causes an immediate execution error.

## Relationships
- Belongs to: [[Subsystem - Server Automations Engine]]
- Spawned by: [[Automation Worker Manager]]
- Guarded by: [[Python AST Validator]]
