# MinePanel Frontend (React + Vite + react-router-dom)

A pure React + Vite migration scaffold for the MinePanel frontend, designed to talk to your **existing Express backend** unchanged. No TanStack, no Lovable runtime — fully local, no vendor lock-in.

## Run locally

```bash
# 1. Install
npm install

# 2. Start your existing Express backend (defaults to port 8082)
#    cd ../   &&   node index.js

# 3. Start the React dev server
npm run dev
# Open http://localhost:5173
```

Vite proxies these paths to your Express backend (see `vite.config.js`):
- `/api/*`
- `/assets/*`
- `/avatars/*`

Override the backend URL if needed:
```bash
BACKEND_URL=http://localhost:9000 npm run dev
```

## Production build

```bash
npm run build
# Output in dist/ — serve via your Express backend (e.g. app.use(express.static('dist')))
# Make sure unknown routes fall back to dist/index.html so client-side routing works.
```

## Project layout

```
src/
  main.jsx                 # React entry, mounts <BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>
  App.jsx                  # All routes (react-router-dom v6)
  lib/api.js               # fetch wrapper + Bearer token storage (localStorage 'mp_token')
  context/AuthContext.jsx  # login/logout/me, exposes useAuth()
  components/
    RequireAuth.jsx        # Redirects to /login if no session
    AppLayout.jsx          # Sidebar + <Outlet/> for authenticated routes
    ServerLayout.jsx       # Tabs for /server/:id/* with <Outlet/>
  pages/
    Login.jsx              # Fully ported (POST /api/auth/login, supports 2FA)
    Panel.jsx Servers.jsx Users.jsx Ranks.jsx Settings.jsx
    Discord.jsx Docs.jsx Profile.jsx
    server/
      Overview.jsx Console.jsx Files.jsx Content.jsx
      Properties.jsx Backups.jsx Logs.jsx Settings.jsx Ftp.jsx
  styles/style.css         # Original CSS, copied 1:1 — source of truth for design
  legacy/                  # Original vanilla frontend, kept for reference
    index.html             # Original markup — copy section HTML into pages as you port
    js/*.js                # Original modules (~14k lines) — port logic into React pages
```

## Routes

| Path                          | Component                |
| ----------------------------- | ------------------------ |
| `/login`                      | `pages/Login.jsx`        |
| `/panel`                      | `pages/Panel.jsx`        |
| `/servers`                    | `pages/Servers.jsx`      |
| `/users`                      | `pages/Users.jsx`        |
| `/ranks`                      | `pages/Ranks.jsx`        |
| `/settings`                   | `pages/Settings.jsx`     |
| `/discord`                    | `pages/Discord.jsx`      |
| `/docs`                       | `pages/Docs.jsx`         |
| `/profile`                    | `pages/Profile.jsx`      |
| `/server/:id/overview`        | `pages/server/Overview.jsx` |
| `/server/:id/console`         | `pages/server/Console.jsx`  |
| `/server/:id/files`           | `pages/server/Files.jsx`    |
| `/server/:id/content`         | `pages/server/Content.jsx`  |
| `/server/:id/properties`      | `pages/server/Properties.jsx` |
| `/server/:id/backups`         | `pages/server/Backups.jsx`  |
| `/server/:id/logs`            | `pages/server/Logs.jsx`     |
| `/server/:id/settings`        | `pages/server/Settings.jsx` |
| `/server/:id/ftp`             | `pages/server/Ftp.jsx`      |

## What's done

- ✅ Vite + React 18 + react-router-dom v6, no framework lock-in
- ✅ Dev proxy to Express on `:8082`
- ✅ Original `style.css` imported verbatim — visual design unchanged
- ✅ Theme + accent bootstrap script preserved in `index.html`
- ✅ Auth flow: login form, 2FA prompt, token stored, `/api/auth/me` hydration, logout
- ✅ Route guard (`RequireAuth`) + sidebar layout + nested server-tab layout
- ✅ All 9 top-level + 9 nested server routes registered as real React Router routes (replacing the old show/hide section pattern)
- ✅ Original HTML and JS preserved under `src/legacy/` as your porting reference

## What's left — the iterative work

Your old frontend is ~14,000 lines of vanilla JS across 9 modules tightly coupled to a single 1,900-line `index.html`. Faithfully porting every panel can't be done in one pass without risking regressions. Each page under `src/pages/` is currently a stub that points you at the legacy file to port.

**Recommended porting order** (each is a self-contained step):

1. **`Panel.jsx`** — dashboard stats. Grab the `#dashboard-view` section from `legacy/index.html`, convert to JSX, fetch from `/api/system/...` and `/api/stats/...` via `api()`.
2. **`Servers.jsx`** — server list + create flow. Use `/api/servers`.
3. **`server/Overview.jsx` + `server/Console.jsx`** — the console likely uses a WebSocket / SSE; reuse the same endpoint from `legacy/js/core.js`. WebSocket proxying is enabled (`ws: true` in vite.config.js).
4. **`server/Files.jsx`** + **`Content.jsx`** + **`Properties.jsx`** — file manager and editors (CodeMirror is already linked in `index.html`).
5. **`server/Backups.jsx` / `Logs.jsx` / `Ftp.jsx` / `Settings.jsx`** — straightforward CRUD against existing routes.
6. **`Users.jsx` / `Ranks.jsx` / `Settings.jsx` / `Profile.jsx`** — admin pages; reuse `legacy/js/account2fa.js` logic for 2FA setup.
7. **`Discord.jsx`** — port `legacy/js/discord.js` + `discord-bots.js`.

### Porting pattern per page

```jsx
// 1. Copy the relevant <div class="view"> from legacy/index.html into JSX
//    (class → className, for → htmlFor, style="x: y" → style={{ x: 'y' }})
// 2. Replace document.getElementById(...).addEventListener('click', ...) with React handlers
// 3. Replace fetch('/api/...') with our api() helper (adds Bearer token automatically)
// 4. Use useState/useEffect for state previously held in module-scope variables

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Servers() {
  const [servers, setServers] = useState([]);
  useEffect(() => { api('/api/servers').then(setServers); }, []);
  return (/* JSX from legacy markup */);
}
```

### Backend tweaks you may need

- **CORS** during dev: the Vite proxy handles same-origin so you usually won't need any CORS changes.
- **SPA fallback** in production: when serving `dist/` from Express, add a catch-all so client routes refresh correctly:
  ```js
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
  ```
- **`/api/auth/me`**: the AuthContext expects a GET endpoint that returns the current user from the bearer token. If your backend uses a different shape, adjust `AuthContext.jsx`.

## Why this scaffold and not a "complete" port

A line-by-line conversion of 14k lines of imperative DOM-mutating code into idiomatic React isn't a single deliverable — it's a refactor that benefits from being done module-by-module with you reviewing each one against the live UI. This scaffold gives you the structural foundation (routing, auth, styling, API plumbing) so each feature port is a small, isolated change.
