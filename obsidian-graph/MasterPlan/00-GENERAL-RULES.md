---
title: "00-GENERAL-RULES"
type: "masterplan"
tags:
  - #masterplan
  - #roadmap
---

# 00-GENERAL-RULES

> Part of the [[Project]] roadmap and [[MASTER_ROADMAP]].

# GENERAL RULES FOR ALL AGENTS

Source of truth: Core Rules from Plan 1.

## Philosophy
MinePanel must remain:
- Lightweight
- Self-hostable
- SQLite compatible
- Homelab friendly
- Low RAM usage
- Low CPU usage

Never introduce:
- Microservices
- Kubernetes
- Unnecessary Redis
- Framework rewrites
- TypeScript migrations unless explicitly requested

## Required Workflow

For EVERY task:

1. Understand existing architecture.
2. Find root cause.
3. Measure impact.
4. Propose minimal change.
5. Implement.
6. Test.
7. Document.

Never perform speculative refactors.

## Code Standards

- Prefer small focused changes.
- Maintain backwards compatibility.
- Keep database migrations safe.
- Avoid hidden breaking changes.
- Every new dependency requires justification.

## Audit Requirements

For every audit:
- Finding
- Severity
- Evidence
- Root Cause
- Risk
- Fix
- Validation

## Documentation Requirements

Update:
- /docs developer docs
- In-panel documentation when user-facing behavior changes

## Performance Rules

Never optimize without measurement.
Always benchmark before and after.

## Related Architecture
- Project Map: [[Project]]
- Subsystems: [[Subsystem - Core Backend and Web Server]], [[Subsystem - Database and Persistence]], [[Subsystem - Authentication and Permissions]]


## Architecture Connections
- Entrypoint: [[MinePanel Entrypoint]]
- Architecture Foundations: [[Project]]
- Config Specifications: [[Config - Environment Variables Specification]]
