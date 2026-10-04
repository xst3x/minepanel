# MinePanel frontend

One canonical React UI is used for both the installed panel and the public demo. Pages, layouts, routing, CSS and responsive rules are shared.

## Data boundary

All UI requests import `src/lib/api.ts`. Vite resolves its `#backend` re-export to exactly one module:

- `src/lib/backend/real.ts`: the existing authenticated API wrapper, native downloads, upload transport, and WebSocket constructor. JWT storage remains `mp_token`; saved accounts remain `mp_accounts`.
- `src/lib/backend/mock.ts`: explicitly allowed reads and local lifecycle/console actions. Everything else invokes one full-installation notice and rejects with `DEMO_UNAVAILABLE`. There is no network fallback. The demo does not read or replace production credentials; its saved account metadata uses `mp_demo_accounts`.
- `src/lib/backend/fixtures.js`: sample servers, file tree/content, plugins, users, ranks, backups, settings and console lines recovered from the former demo at Git revision `ba9b7b2^`. State lives in memory. Documentation is bundled directly from `src/docs`.
- `DemoNotice` uses the shared modal, buttons and tokens to show the demo indicator, unavailable-action explanation and GitHub CTA. Toast/progress catches suppress duplicate restriction errors.

`VITE_DEMO_MODE=true` selects the mock at **build time**. Omitted or false selects the production provider. `.env.demo` enables demo builds; restart/rebuild when changing the mode. Vercel also sets this variable explicitly. Backend authorization and route contracts are unchanged.

Use `api` for parsed responses, `request` for raw downloads, `createUploadRequest` for upload progress, `createServerSocket` for the console, and `assetUrl` for backend/external image sources. `allowBackendAction` handles actions that must be restricted before an optimistic update, account change or legacy helper. Do not call browser network primitives from a page. The source boundary check runs before both frontend builds, and the demo build rejects any import of the real provider. A demo-only CSP blocks fetch/XHR/WebSocket/EventSource/beacon connections even if a future path bypasses the provider.

## Demo scope

Read-only: all existing screens, file contents, sample catalogs, player details/lists, backup listings, properties, disabled automation examples, FTP configuration, settings and documentation.

Local simulation: start/stop/restart, console history, help/list/version/plugins/say commands, chat, and existing browser appearance preferences. Unknown console commands explain the limitation. No Minecraft process runs.

Full-installation only: creating/importing/deleting/killing servers; file writes/uploads/downloads/archive operations; content installation/removal; software/version updates; backup creation/restoration; credentials/FTP; automation changes/execution; user/rank/account/security mutations; Discord integration changes; saving backend settings. Read methods are also restricted when they provision secrets or generate downloads. Unknown routes fail closed.

## Development and validation

The installation's **Panel Settings → Network & Ports → Base Path** setting defaults to `/` and takes effect after restarting the backend. `BASE_PATH` in the backend environment overrides it. Express mounts its APIs, static files and WebSocket under this path and injects the active `<base>` into HTML; React Router and the real provider consume it. Production assets are built with relative URLs, so a path change needs no rebuild. Use `withBasePath` for root-relative upload URLs and `assetUrl` for backend image/download links; React Router navigation remains relative to its basename.

Set `VITE_BASE_PATH` when running Vite against a prefixed backend or building a prefixed static demo. Demo builds still select only the mock provider and never connect to a backend. Configure the static host to serve assets and SPA fallback under the chosen prefix.

Run `npm install` at the repository root. Root commands are documented in the [main README](../../README.md#demo).

Building requires Node.js 22.12 or newer. The frontend owns TypeScript and its local `scripts/check-network.mjs` prebuild check, so a workspace-only installation can build the demo. Both Vercel configs install only the frontend workspace from the root lockfile. For a Vercel project with `src/frontend` as Root Directory, enable access to files outside that directory and use its checked-in config; frontend demo builds write `dist-demo` inside the workspace by default. The repository-root build command explicitly selects the root `dist-demo` output. Both build the same shared UI; no output-directory environment variable is needed.

Production Vite dev runs on port 5173 and proxies to `BACKEND_URL` (default http://localhost:8082). Production output is `src/public`. Root demo commands write to the root `dist-demo`; a demo build run directly inside `src/frontend` writes to `src/frontend/dist-demo`. Neither overwrites production output. The demo watcher serves the root static build at http://127.0.0.1:5173 with no proxy or HMR connection; refresh after edits.

`npm run typecheck:frontend`, `npm run test:frontend`, `npm run check:network`, `npm test`, and `npm run test:dist` validate types, provider contracts, the network boundary and existing backend behavior. Browser validation should additionally cover nested routes, no API/WebSocket traffic, local controls, restricted-action messaging, and mobile widths.

Vercel uses the repository-root configuration and serves only `dist-demo`. Its SPA fallback follows the [Vercel Vite guidance](https://vercel.com/docs/frameworks/frontend/vite). Do not deploy the production frontend as the public demo or point demo deployment at an installed panel backend.
