---
title: "Audit Logger"
type: "service"
layer: "security"
source: "src/core/utils/auditLog.ts"
tags:
  - minepanel
  - security
  - service
---

# Audit Logger

**Source**: `src/core/utils/auditLog.ts`

`Audit Logger` creates persistent records of significant security and administrative actions (logins, failed authentications, server deletion, permission changes, password resets) in [[Model - AuditLog]].

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Uses: [[Database Access Layer]], [[Model - AuditLog]]
