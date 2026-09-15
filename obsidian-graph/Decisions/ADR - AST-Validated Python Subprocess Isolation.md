---
title: "ADR - AST-Validated Python Subprocess Isolation"
type: "decision"
layer: "architecture"
source: "src/core/automationEngine.ts"
tags:
  - minepanel
  - architecture
  - decision
---

# Architectural Decision: AST-Validated Python Subprocess Isolation

## Context
Users want customizable automations (e.g. triggering in-game announcements when players join, stopping servers at night). Providing user scripting introduces massive remote code execution (RCE) risks if users can access host filesystems or sockets.

## Decision
Two-tier security isolation:
1. **Pre-Execution Static Analysis**: [[Python AST Validator]] parses the script's AST tree before saving, rejecting dangerous nodes (`os`, `subprocess`, `socket`, `eval`, `__import__`).
2. **Runtime Subprocess Sandbox**: [[Automation Worker Manager]] runs the script in a dedicated Python subprocess using [[Python Sandbox Runner]], injecting a restricted mock API and enforcing a strict 5-second CPU timeout with hard `SIGKILL`.

## Relationships
- Governs: [[Automation Engine]], [[Python AST Validator]], [[Python Sandbox Runner]]
