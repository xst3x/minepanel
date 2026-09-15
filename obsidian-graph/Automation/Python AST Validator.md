---
title: "Python AST Validator"
type: "security"
layer: "automation"
source: "src/core/automation/validator.py"
tags:
  - minepanel
  - automation
  - security
---

# Python AST Validator

**Source**: `src/core/automation/validator.py`

`Python AST Validator` performs static Abstract Syntax Tree (AST) analysis on automation scripts before they are saved to the database or executed.

## Security Rules
- **Blocked Imports**: `os`, `sys`, `subprocess`, `socket`, `shutil`, `builtins`, `importlib`, `pty`, `ctypes`.
- **Blocked Calls**: `eval()`, `exec()`, `__import__()`, `open()`, `compile()`.
- **Blocked Attributes**: Access to dunder attributes like `__globals__`, `__subclasses__`, or `__code__`.

## Relationships
- Belongs to: [[Subsystem - Server Automations Engine]]
- Used by: [[Automation Routes]], [[Python Sandbox Runner]]
