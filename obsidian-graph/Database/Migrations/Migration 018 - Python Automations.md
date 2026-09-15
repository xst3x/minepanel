---
title: Migration 018 - Python Automations
type: migration
source_file: src/db/migrations/018_python_automations.ts
tags:
  - #database
  - #migration
  - #automation
---

# Migration 018 - Python Automations

Adds support for custom Python automation scripts executed securely against server instances.

## Schema Changes
- Added columns to `automation_rules`:
  - `script_language` ('json' | 'python')
  - `script_content` (Text)

## Related Architecture
- Handled by: [[Automation Engine]]
- Route: [[Automation Routes]]


## Architecture Connections
- Engine: [[Automation Engine]], [[Subsystem - Server Automations Engine]]
- Python Sandbox: [[Python Sandbox Runner]], [[Python AST Validator]]
- Flow: [[Data Flow - Sandboxed Python Automations]]
- UI View: [[Frontend Automation View]]
