---
type: doc
title: Ranks
category: users
order: 2
---

# Ranks

## What Ranks Are

Ranks are reusable permission bundles. Instead of configuring each user individually, you create a rank once and assign it. Rank edits propagate instantly to all holders.

A rank carries two permission bags:

| Bag | Scope |
|---|---|
| Global permissions | Apply regardless of which server is being accessed |
| Per-server permissions | Map of `serverId → permission[]` — each server can have a different set |

> A user can hold exactly one rank at a time. Individual per-server permissions layer on top via the resolution chain described in Roles & Permissions.

## Rank Editor

The rank editor renders a **permission matrix**: rows are permission keys, columns are servers. Check a cell to grant that permission on that server.

Global permissions (`account.manage`, `panel.settings`) have their own column and are independent of any specific server.

When a user has a permission via their rank, the corresponding checkbox in the user-level editor is rendered locked with a "Granted by Rank" status — you cannot override it in the user view without changing their rank or overriding the database.

> **Warning**: Ranks that are assigned to at least one user cannot be deleted without first unassigning them.
