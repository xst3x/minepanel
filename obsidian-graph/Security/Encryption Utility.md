---
title: "Encryption Utility"
type: "utility"
layer: "security"
source: "src/core/utils/encryption.ts"
tags:
  - minepanel
  - security
  - utility
---

# Encryption Utility

**Source**: `src/core/utils/encryption.ts`

`Encryption Utility` provides AES-256-GCM symmetric encryption for sensitive stored secrets, including Discord bot tokens, webhook secrets, and external integration credentials.

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Used by: [[Discord Client Lifecycle]], [[Database Access Layer]]
