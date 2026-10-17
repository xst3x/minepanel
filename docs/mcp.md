# Native MinePanel MCP

## Implementation status

This implementation provides a native, disabled-by-default MCP endpoint, 46 management tools, identity/key management, centralized authorization, three approval modes, a durable approval/result system, and the management frontend. **Complete GUI feature parity is not achieved.** The withheld capabilities and remaining production work are listed below. There are no placeholder tools for those capabilities.

## Architecture and integration

`src/minepanel.ts` owns the existing Express application, installation `BASE_PATH`, HTTP/TLS listener, and WebSocket server. MCP mounts before the general JSON parser and request logger, so credentials and oversized bodies are rejected before dispatch. The management API is mounted inside the existing panel router at `/api/mcp`. The GUI uses `/mcp-servers`; this is separate from the `/mcp` protocol endpoint so disabling MCP cannot prevent access to its administration page.

The maintained official TypeScript SDK packages are `@modelcontextprotocol/server` 2.3.1 and `@modelcontextprotocol/node` 2.1.1. `createMcpHandler` builds a fresh authorized server for each request; `toNodeHandler` integrates it with Express. The current SDK supports modern MCP and legacy stateless Streamable HTTP. The automated client test uses the official `@modelcontextprotocol/client` 2.3.1. No independent listener, management backend, protocol implementation, or duplicate Minecraft state exists.

`src/core/mcp/registry.ts` is the fixed, extensible operation registry. JSON operations dispatch through `operations.ts` into the existing Express routers **with their authentication, permission checks, and Joi validators retained**. Callers cannot supply a route, HTTP method, principal, or administrator token. An object-local `WeakMap` binds the trusted MCP principal to this in-process request; external bodies, headers and JWTs cannot mint that capability. This avoids duplicating route-bound business logic. Existing lifecycle handlers continue to use `processManager`, `executionManager`, `serverHelper`, resolver/download services, process locks, and native/Docker behavior.

`permissions.ts` shares rank evaluation between users and MCP. Identities use the `mcp:<uuid>` principal namespace and are stored outside `users`. They have no passwords or GUI sessions. Permission overrides expand inherited wildcard grants before applying explicit denials. Access to an explicitly allowed server is mandatory even for an Owner rank. Rank global grants and per-server rank maps retain their existing meaning. The existing `server.plugins.install` check is used, despite the GUI permission catalog primarily showing `server.plugins.manage`; the identity form provides the install override explicitly.

`safeServerPath.ts` rejects traversal and symlinks in an existing path or the ancestors of a newly created path. The file GUI uses this same helper. `writeServerFile.ts` shares optional SHA-256 version checks with GUI writes and performs comparison and writing without an intervening await. External processes editing the filesystem still require operational coordination; this is not a filesystem transaction or operating-system sandbox. ZIP extraction in the existing GUI additionally checks entry paths and symlinks before extracting. MCP tree/archive limits are enforced before shared-handler dispatch; existing GUI archive sizes are preserved.

## Configuration

1. Build the backend and frontend with `npm run build`, then restart MinePanel normally. Migration 026 runs through the existing migration runner; no existing table is reset. Versions 24 and 25 can already belong to older authorization/foreign-key migrations. Migration 026 also preserves MCP data created by the earlier MCP migration numbering.
2. Sign in with the global `mcp.manage` permission, granted by default to Owner, Admin and Manager. Open **MCP Servers → MCP Configuration**, or use **Panel Settings → MCP Configuration** if you also have panel settings access. Migration 027 adds the MCP permission to existing named ranks without replacing their other grants.
3. Set the endpoint path (default `/mcp`), rate/capacity limits, and public HTTPS origin for remote use. The public origin must contain no path, query, fragment, or embedded credentials. The active panel base path is appended independently. For example, `BASE_PATH=/panel/` and endpoint `/mcp` yield `https://panel.example.com/panel/mcp`.
4. Enable the endpoint. Open **MCP Servers** and create an identity with a rank, explicit server scope, overrides, and an approval mode. Save its key when displayed; it cannot be retrieved later.

Remote HTTP is rejected. Direct loopback HTTP is allowed only with a loopback peer and a literal localhost/loopback Host. Remote Host must match the configured HTTPS public origin. Origin validation does not inherit MinePanel's permissive CORS wildcard: only the public origin, additional explicit origins, or the local same origin qualify.

For TLS termination, set `MCP_TRUST_PROXY` in the environment to the actual proxy addresses/subnets (for example `loopback` for a same-host Caddy/Nginx). Only those source addresses may assert `X-Forwarded-Proto: https`. The proxy must overwrite that header and preserve the external Host. This setting does not change the GUI's Express trust-proxy policy. A live production reverse proxy has not been configured or tested by this implementation.

Limits are persisted in the existing SQLite database: global requests/minute, identity ceiling/minute, maximum concurrent operations, pending approval ceiling, request/parse timeout, approval lifetime and raw request byte limit. Identity limits can be lower than the global identity ceiling. `express-rate-limit` supplies the HTTP limits. JSON-RPC batches are rejected. Limits use process-local stores and capacity reservations; clustered/multiple API processes require a shared limiter and distributed admission/capacity store before deployment.

The endpoint is stateless: authenticated POST requests only, with no session IDs. Authenticated GET/DELETE receive 405; a supplied `Mcp-Session-Id` is rejected. OAuth discovery, dynamic registration, legacy standalone SSE, browser CORS preflights and subscription streams are not supported integration surfaces. Clients must support explicit bearer headers and Streamable HTTP.

## Keys, approvals and audit

Keys contain a UUID plus 256 random bits from Node's cryptographic RNG. SQLite holds only their SHA-256 verifier. Verification uses `timingSafeEqual`; rotation changes the credential generation, and revocation also disables the identity. Every request authenticates; every actual operation reloads status, current rank permissions, overrides, server access and global enabled state.

Approval modes:

| Mode | Behavior |
| --- | --- |
| Full Access | Execute currently authorized operations immediately. |
| Approve Dangerous Commands | Execute ordinary authorized operations; approve console commands, file mutations, shutdown/kill/deletion, player actions, content changes and backup operations with destructive retention effects. |
| Approve Everything | Every advertised management tool call, including reads, creates an approval request. |

The frontend Approval Center presents identity, tool, exact validated arguments, server, risk, timestamps and status. Interactive panel accounts with `mcp.manage` may decide or administer identities/settings. This permission appears in the global Administration permission catalog; it does not grant general panel settings access. MCP credentials and internal principals cannot administer identities, and agent rank inheritance/overrides cannot grant `mcp.manage`.

Validated arguments and credential generation are immutable in each persisted operation. Human approval does not immediately execute it: the client reads the returned `resultUri` (`minepanel://operations/<approvalId>`), which atomically claims an approved operation, rechecks access and executes it once. Outside Everything mode, `approval_result` offers the same control-plane polling as a tool. In Everything mode it is withheld to avoid an exempt tool or recursive approval requests. Clients that do not support resources cannot complete native approvals in Everything mode.

Statuses are `pending`, `approved`, `denied`, `expired`, `executing`, `completed`, and `failed`. Concurrent polls cannot replay an operation. Permissions are rechecked after approval. Tightening the approval mode applies to auto-approved work that has not started. The pending ceiling is serialized in the API process. A response timeout returns an execution ID while retaining the operation's concurrency slot until the underlying handler actually finishes. A restarted panel marks interrupted work failed and never retries uncertain effects automatically. Revocation cannot undo an already-started side effect.

Approval changes reuse the existing panel WebSocket at `/ws?channel=mcp`, authenticated by its first auth frame. This channel requires an interactive account with `mcp.manage`, and revalidates permissions, disabled status, JWT expiry and revocation before each event/refresh. Existing console WebSocket messages are unchanged. Notifications contain only a pending count; full arguments remain in the permission-protected management API.

Audit records store actor, event, identity, tool, operation/server IDs and timestamps, never keys or operation arguments/results. Approval records hold exact arguments and bounded, redacted results to enable durable review/polling. Protect the SQLite database as panel administration data. Approval and audit archival/retention policies are future work; the UI prioritizes pending approvals up to the configured pending ceiling, and shows at least 200 recent rows. Audit history is bounded to 200 rows per API read. Expiration maintenance runs every 15 seconds and execution always checks the deadline independently.

## Capability map

Each listed tool uses the indicated existing handler/service and its existing permission. Full schemas and descriptions come from live discovery. Tools are only advertised when at least one explicitly allowed server, or the relevant global scope, grants the required permission.

| GUI capability | MCP tools | Existing owner / permission |
| --- | --- | --- |
| List and inspect servers | `servers_list`, `server_inspect` | `serverManagementRoutes`, `serverHelper`, DB; MCP requires `server.console.read`, filtered server list. |
| Lifecycle control | `server_start`, `server_stop`, `server_restart`, `server_kill`, `server_delete` | `serverLifecycleRoutes` / `serverManagementRoutes`; `server.start/stop/restart/kill`, deletion `account.manage`. |
| Console history and command control | `console_read`, `console_command`, `console_clear` | `processManager`, lifecycle routes; `server.console.read/write`. |
| Directory list, metadata, text edit | `files_list`, `files_info`, `files_read`, `files_write` | `fileRoutes`, shared path/write helpers; `server.files.read/write`. |
| Create/rename/copy/move/archive/delete | `files_create`, `files_mkdir`, `files_rename`, `files_copy`, `files_move`, `files_archive`, `files_delete` | `fileRoutes`; `server.files.write/delete`. Content destination mutations additionally need `server.plugins.install`. |
| Online/known players, player details | `players_online`, `players_list`, `player_inspect`, `player_lists` | `playerRoutes`; `server.players.read`. |
| GUI player actions and list removal | `player_action`, `player_list_remove` | `playerRoutes`, process/Docker commands and saved-data helpers; `server.players.manage`. |
| Installed content and Modrinth browsing | `plugins_installed`, `plugins_search`, `plugins_versions` | `pluginRoutes`; `server.files.read`, discovery adds `server.plugins.read`. |
| Content install/update/remove | `plugins_install`, `plugins_update_all`, `plugins_remove` | `pluginRoutes` provider/download helpers; `server.plugins.install`. |
| Backup list/create/delete and schedule read | `backups_list`, `backups_create`, `backups_delete`, `backup_config_read` | `backupRoutes`, `serverHelper.createBackup`, management routes; `server.backups.read/create/delete`. |
| Server properties and logs | `properties_read`, `logs_list`, `logs_tail` | `propertiesRoutes`, `logRoutes`; existing `server.files.read` and `server.logs.read`. |
| Automation list/inspect/delete | `automation_list`, `automation_inspect`, `automation_delete` | `automationRoutes`, existing DB, `automationEngine.invalidateCache`; `server.automation.read/write`. |
| User/rank metadata | `users_list`, `ranks_list` | `userRoutes`, `rankRoutes`, existing Sequelize/DB; `account.manage`. |
| Panel settings inspection | `panel_settings_read` | `systemRoutes` / existing settings storage; `panel.settings`. |

### Withheld GUI capabilities and exact remaining work

| GUI capability | Existing owner / permission | Why not exposed yet |
| --- | --- | --- |
| Server create/import/modpack create | `serverManagementRoutes`, `modpackRoutes`; `server.create` | Creation assumes a real user `owner_id`. It needs a shared non-user ownership/service contract and atomic assignment of created server scope. Multipart import also needs a bounded adapter. |
| Software/version switching, updates, rollback, arbitrary start command/settings | management/update routes, `UpdateManager`; `server.properties.write` | Executable paths/custom commands and downloaded content need additional policy checks against indirect privilege escalation before exposing mutations. |
| Binary file upload/download and batch ZIP download | `fileRoutes` / Multer / download tokens; `server.files.read/write` | The reusable operation adapter intentionally handles JSON operations only. Binary transfers need bounded content services and credential-safe download behavior, not leaked GUI download tokens. Text files can already be created/read/written. |
| ZIP extraction through MCP | `fileRoutes`; `server.files.write` | The GUI validates archive paths/symlinks; MCP additionally needs bounded expansion and credential/content destination enforcement across every archive entry. No extraction tool is advertised. |
| Backup restore/download/inspection of archive contents | `backupRoutes`; `server.backups.restore/read` | The old restore code uses an undeclared `unzipper` dependency and resolves before all extracted writes finish. Replace it with a tested shared restore service with symlink, zip-slip, size and stopped-server controls before exposing it. |
| Backup schedule update | management routes; `server.backups.create` | Requires a reviewed schema/adapter for the complete existing scheduling contract. |
| Player list additions | `playerRoutes`; `server.players.manage` | Add a reviewed MCP schema matching list-specific name/IP/reason/OP level validation before exposing it. Existing action and removal tools are available. |
| Hangar/PocketMine/datapacks and full provider browsing | plugin / pocketmine routes; read/install permissions | Only Modrinth version install and standard installed content operations are mapped. Provider-specific inputs and content directory checks remain. |
| Automation create/update/toggle/verify/execute | `automationRoutes`, `workerManager`, `automationEngine`; `server.automation.write/read` | Python scripts can trigger indirect panel actions through worker/internal credentials. They need principal propagation and permission checks at every script effect; approval alone would not prevent escalation. |
| User create/delete/disable/password/rank/permission changes | `userRoutes`; `account.manage` | Existing handlers permit unrestricted privilege assignments. A shared grant ceiling and protected-user/identity-rank checks are needed; MCP cannot modify users, assigned ranks or its own identity. |
| Rank create/update/delete/reorder | `rankRoutes`; `account.manage` | Reuse these only after enforcing no self-grant and no changes to ranks assigned to any MCP identity. Read-only inspection is available. |
| Panel setting mutations, port restart, Java management | `systemRoutes`; `panel.settings` | Paths, account defaults, registration and executable settings require reviewed field-specific schemas/grant controls. |
| FTP/SFTP, Discord/bots, API keys and account credentials | FTP/Discord/key/auth routes; feature-specific permissions | These workflows contain credentials/session material. They need secret-specific APIs and principled output contracts; they are not generic MCP operations. |
| Live stats/config, world management, docs and profile/account UI actions | stats/world/docs/user/auth routes; respective read/write permissions | No corresponding management tools are registered. Static MCP architecture/workflow resources replace only the agent documentation use case. |

Text reads are limited to 1 MiB; writes to 200,000 characters; tree/archive operations to 10,000 entries and 64 MiB. File metadata scans cap their entry count. The existing log-tail handler reads an entire file, so MCP currently refuses tails of logs larger than 8 MiB; replace it with a shared bounded reader to remove this limit. Redacted file reads do not expose a raw-file version hash, and writing the literal redaction sentinel is rejected.

These omissions are intentional discovery omissions, not stub successes. Arbitrary commands and trusted plugin installation retain the powerful effects of the existing GUI permissions; an approval layer is not an OS sandbox. Known credential fields/paths and private-key text are blocked or redacted, but custom server/plugin file formats and unlabeled secrets need further threat review before granting broad production file-read access. Symlink checks do not eliminate races with a hostile external process swapping paths; use filesystem isolation and trusted server processes.

## Client setup

Replace the example URL with the Setup tab's effective endpoint. Store the key privately and use a separate identity per client/purpose. Do not commit actual keys.

### Codex

Add to `~/.codex/config.toml` and supply `MINEPANEL_MCP_KEY` in the environment of the Codex process:

```toml
[mcp_servers.minepanel]
url = "https://panel.example.com/panel/mcp"
bearer_token_env_var = "MINEPANEL_MCP_KEY"
```

This follows the [official Codex MCP configuration](https://developers.openai.com/codex/mcp/). The endpoint's bearer credentials do not use OAuth.

### Claude Code

```text
claude mcp add --transport http minepanel "https://panel.example.com/panel/mcp" --header "Authorization: Bearer <your-key>"
```

Use your client's secret/header helper when available to avoid putting a real key into shell history. See [Claude Code's remote MCP documentation](https://code.claude.com/docs/en/mcp).

### Cursor

Add a private entry to `.cursor/mcp.json` or your global Cursor MCP configuration:

```json
{
  "mcpServers": {
    "minepanel": {
      "url": "https://panel.example.com/panel/mcp",
      "headers": { "Authorization": "Bearer ${env:MINEPANEL_MCP_KEY}" }
    }
  }
}
```

Cursor supports [HTTP configuration and environment interpolation](https://cursor.com/docs/mcp).

### Google Antigravity

The [current Antigravity remote configuration](https://antigravity.google/docs/mcp) uses `serverUrl`, rather than `url`:

```json
{
  "mcpServers": {
    "minepanel": {
      "serverUrl": "https://panel.example.com/panel/mcp",
      "headers": { "Authorization": "Bearer <your-key>" }
    }
  }
}
```

Use the configuration file location documented for your Antigravity surface/version. Other MCP clients must support Streamable HTTP and explicit authorization headers. Resource/prompt support varies; Everything mode specifically needs resource polling. Only the official SDK client and legacy protocol requests were tested here, not each named desktop application.

## Optional skill installation

Copy the complete `agent-skills/minepanel` folder to the skill location supported by your client. [Codex](https://developers.openai.com/codex/skills/) supports `~/.agents/skills/minepanel/` (or the configured skill directory); [Claude Code](https://code.claude.com/docs/en/skills) supports `~/.claude/skills/minepanel/` or a project `.claude/skills/minepanel/`. [Cursor Agent Skills](https://cursor.com/docs/skills) supports `.cursor/skills/minepanel/`; other clients should follow their own skill conventions. Connecting MCP does not install this skill. No user profile/configuration has been changed automatically.

The skill's frontmatter follows the `name`/`description` plus `SKILL.md` folder convention. Tool descriptions, schemas, `minepanel://guide`, authorized capabilities, server resource templates, operation result resources and the maintenance prompt remain independently useful.

## Verification and files

New backend files: `src/core/mcp/{principal,store,operations,registry,engine,transport,notifications}.ts`, `src/core/{safeServerPath,writeServerFile}.ts`, `src/routes/mcpRoutes.ts`, and migration `src/db/migrations/026_mcp.ts`. Existing `auth.ts`, `permissions.ts`, `minepanel.ts`, `fileRoutes.ts`, `validators.ts` and package/TypeScript configuration are integrated. Corresponding JavaScript/source maps are generated under `dist/`.

Frontend additions: `pages/McpServers.tsx`, `components/McpSettings.tsx`, `components/McpConnectionSetup.tsx`, `components/McpNotifications.tsx`, `lib/mcp.ts`, `styles/pages/McpServers.css`; `App.tsx`, `AppLayout.tsx`, and `Settings.tsx` integrate routing/navigation/settings. The existing provider facade, modal, Select, Section, notifications and CSS tokens are reused. Demo mode displays an installation CTA and does not open MCP connections. Vite output stays in `src/public`.

Tests: `tests/mcp.test.ts` uses temporary files, in-memory SQLite, mocked Minecraft processes, Supertest, and the real SDK client. It covers authentication, rotation/revocation, scoped ranks and overrides, all approval modes, expiration, immutable arguments, concurrent claims, ownership, pending/capacity/request limits, protocol discovery, resource polling, path/symlink/credential protection and GUI version-conflict regression. `tests/setup-backend.cjs` waits for the exported application readiness promise before closing databases, preventing startup/teardown races during the regression run.

The browser QA uses Edge/Playwright because the Browser plugin is unavailable. It exercises create/key display/dismissal, approval confirmation, configuration saving, and desktop/mobile rendering at 1440×1000 and 390×844 with fixture API responses. That proves rendering and interactions, not production proxy or physical Minecraft behavior.

The compiled fixture tests additionally exercise identity creation, live tool discovery, human approval and owned resource-result retrieval with the official SDK client under both `/panel/` and `/custom/admin/`. They use a copied installation and fixture database, not production data. The optional skill passes the bundled skill validator. The completed full backend run passed 197 tests in 19 suites, including 33 MCP tests. Frontend: 69 tests. Compiled layout/runtime checks: 9 tests. Both TypeScript checks, frontend build, and network boundary pass. npm audit reports 54 repository advisories (12 moderate, 40 high, 2 critical); no advisories are attributed to the MCP SDK packages or Zod in that report.

Reproduce checks with `npm test`, `npm run typecheck:frontend`, `npm run build`, `npm run test:frontend`, `npm run test:dist`, and `npm run check:network`. Review the lockfile's npm audit separately; the repository currently reports dependency advisories. No blanket dependency upgrades or live/destructive Minecraft tests were performed.
