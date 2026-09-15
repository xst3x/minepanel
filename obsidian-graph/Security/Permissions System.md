---
title: "Permissions System"
type: "security"
layer: "security"
source: "src/core/permissions.ts"
tags:
  - minepanel
  - security
  - security
---

# Permissions System

**Source**: `src/core/permissions.ts`

The `Permissions System` evaluates whether a given user possesses the authority to perform a specific action on a specific Minecraft server.

## Evaluation Hierarchy
1. If user has global role `admin`: full access (`*`) granted immediately.
2. Checks user's assigned global rank permissions.
3. Checks user's server-specific rank and granular permission overrides (`user_server_permissions`).
4. Wildcard matching: permissions like `server.files.*` grant `server.files.read`, `server.files.write`, and `server.files.delete`.

## Relationships
- Belongs to: [[Subsystem - Authentication and Permissions]]
- Uses: [[Database Access Layer]], [[Model - Rank]], [[Model - User]]
