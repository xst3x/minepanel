# Server Management

## Creating a Server

Admin-only. The panel resolves the JAR, downloads it to the local cache, copies it into `servers/<name>/server.jar`, writes `eula.txt=true`, and inserts a DB record.

| Field | Constraint |
|---|---|
| Name | Unique. Becomes the directory name (sanitized). |
| Software | Paper · Purpur · Vanilla · Fabric · Quilt · Forge · Magma |
| Version | Fetched from the upstream version manifest |
| RAM (MB) | 512 – 16,384 |
| Port | 1024 – 65,535, unique across all servers |

> **Forge:** Triggers a separate `--installServer` run. Check `install.log` in the server directory if it fails.

## Lifecycle — Start / Stop / Restart / Kill

| Action | Behaviour |
|---|---|
| **Start** | Spawns `java -Xmx<ram>M -jar server.jar nogui`. Forge uses args from `run.bat`/`run.sh`. Console history is cleared before launch. |
| **Stop** | Writes `/stop\n` to stdin. Waits up to 15 s. |
| **Restart** | Graceful stop + immediate fresh start. |
| **Kill** | SIGKILL to the tracked PID. Console history is cleared. |

> Every lifecycle action acquires an exclusive per-server lock. Concurrent requests return HTTP 409.

## File Manager

Sandboxed to `servers/<name>/`. Path-traversal attempts return 403.

| Operation | Permission |
|---|---|
| Browse / read / download file | `server.files.read` |
| Download folder (as ZIP) | `server.files.read` — signed token URL, expires 5 min |
| Upload file | `server.files.write` — max 100 MB |
| Edit file (inline) | `server.files.read` + `write` — files > 5 MB must be downloaded |
| Delete | `server.files.delete` |
| New file / folder | `server.files.write` |

The editor uses **CodeMirror 5** with syntax highlighting for `.yml`, `.yaml`, `.properties`, `.json`, `.js`, `.sh`, `.bat`, and plain text.

## Import from ZIP

| Field | Notes |
|---|---|
| Archive | `.zip` only — no size cap, streams directly to disk |
| Executable Path | Relative path of JAR inside the archive, e.g. `server.jar` |
| Server Root Path | Prefix to strip before extracting. Leave empty if JAR is at archive root. |
| Port / RAM / Software / Version | Same constraints as normal server creation. |

## Backups

Stored as timestamped ZIPs inside `servers/<name>/backups/`.

| Type | Notes |
|---|---|
| Manual | Triggered from the Backups tab. |
| Auto-backup | Per-server interval in hours, checked hourly. |
| Auto on change | Always created before a software/version switch. |
| Restore | Server must be offline. |

## Switch Software / Version

Both require `server.properties.write` and the server must be offline.

**Change Version** — downloads new JAR for the same software, replaces `server.jar`. Forge re-runs the installer.

**Switch Software** — two-phase: dry-run returns compatibility warnings, then confirmed request executes. Rollback backup created first. Incompatible folders are renamed to `.disabled`, not deleted.

## Plugins & Mods

| Action | Mechanism |
|---|---|
| Disable | `foo.jar` → `foo.jar.disabled` |
| Enable | `foo.jar.disabled` → `foo.jar` |
| Delete | Permanently removes the file |
| Upload | Drops file into `plugins/` or `mods/` |
| Modrinth search | Search and install directly from the panel |

## Player Management

Reads live player data from `world/playerdata/` NBT files — no RCON required. The player modal shows the full inventory, armor, off-hand, and ender chest.

| Action | Permission |
|---|---|
| View + inventory | `server.players.read` |
| Kick | `server.players.kick` |
| Ban | `server.players.ban` |
| OP / DeOP | `server.players.op` |
