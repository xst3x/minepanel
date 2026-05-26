# Ranks

## What Ranks Are

Ranks are reusable permission bundles. Create a rank once, assign it to users — rank edits propagate instantly to all holders.

A rank carries two permission bags:

| Bag | Scope |
|---|---|
| Global permissions | Apply regardless of which server is being accessed |
| Per-server permissions | `serverId → permission[]` — each server can have a different set |

A user holds exactly one rank at a time. Individual per-server permissions layer on top.

## Rank Editor

The rank editor shows a **permission matrix**: rows are permission keys, columns are servers. Check a cell to grant that permission on that server.

Global permissions (`account.manage`, `panel.settings`) have their own column independent of any server.

When a user has a permission via their rank, the checkbox in the user-level editor is locked with a "Granted by Rank" tooltip.

> Ranks assigned to at least one user cannot be deleted without first unassigning them.

## Tips

- **Moderator rank** — `console.read`, `players.kick`, `players.ban`
- **Builder rank** — `files.read`, `files.write`
- **Helper rank** — `console.read` only
- Per-server permissions let you grant different access on different servers from the same rank.
