# MinePanel Frontend (React + Vite)

**A modern, production‑ready React + Vite scaffold for the MinePanel UI**. It works out‑of‑the‑box with the existing Express backend and follows a clean, component‑driven architecture.

---

## 📦 Prerequisites
- **Node.js** ≥ 18 (recommended LTS)
- **npm** (or `pnpm`/`yarn` if you prefer – the scripts are npm‑compatible)
- The **MinePanel Express backend** running (default `http://localhost:8082`).

---

## 🚀 Quick start (development)
```bash
# 1️⃣ Install dependencies
npm install

# 2️⃣ Start the backend (from the project root)
cd ../ && node index.js   # defaults to port 8082

# 3️⃣ Launch the Vite dev server
npm run dev   # http://localhost:5173
```
The dev server proxies the following paths to the backend (see `vite.config.js`):
- `/api/*`
- `/assets/*`
- `/avatars/*`

If your backend runs on a different host/port, override the URL:
```bash
BACKEND_URL=http://localhost:9000 npm run dev
```

---

## 📦 Production build
```bash
npm run build   # bundles the app into the `dist/` folder
```
Serve the static files from your Express app, for example:
```js
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static('dist'));
// SPA fallback – ensure client‑side routing works
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'dist', 'index.html')));
```

---

## 📁 Project layout
```
src/
  main.jsx               # React entry – mounts <BrowserRouter> & <AuthProvider>
  App.jsx                # Top‑level route definitions (react‑router‑dom v6)
  lib/api.js             # Central fetch wrapper – injects Bearer token from localStorage (`mp_token`)
  context/AuthContext.jsx# Auth flow – login, logout, token refresh, `useAuth()` hook
  components/
    RequireAuth.jsx      # Guard – redirects to /login when unauthenticated
    AppLayout.jsx        # Sidebar + <Outlet> for authenticated routes
    ServerLayout.jsx     # Server‑tab layout – nested <Outlet> for /server/:id/*
    Select.jsx           # Custom dropdown rendered via React Portal (prevents clipping)
  pages/
    Login.jsx            # Login page with optional 2FA
    Panel.jsx            # Dashboard overview
    Servers.jsx          # Server list & creation
    Users.jsx            # User management
    Ranks.jsx            # Rank management
    Settings.jsx         # Global settings
    Discord.jsx          # Discord integration page
    Docs.jsx             # Documentation page
    Profile.jsx          # User profile page
    server/
      Overview.jsx
      Console.jsx
      Files.jsx
      Content.jsx
      Properties.jsx
      Backups.jsx
      Logs.jsx
      Settings.jsx
      Ftp.jsx
  styles/style.css       # Design system – CSS variables, glass‑morphism, gradients, etc.
  legacy/                # Original vanilla frontend (reference only)
```

---

## 🔀 Routing table
| Path | Component |
|------|-----------|
| `/login` | `pages/Login.jsx` |
| `/panel` | `pages/Panel.jsx` |
| `/servers` | `pages/Servers.jsx` |
| `/users` | `pages/Users.jsx` |
| `/ranks` | `pages/Ranks.jsx` |
| `/settings` | `pages/Settings.jsx` |
| `/discord` | `pages/Discord.jsx` |
| `/docs` | `pages/Docs.jsx` |
| `/profile` | `pages/Profile.jsx` |
| `/server/:id/overview` | `pages/server/Overview.jsx` |
| `/server/:id/console` | `pages/server/Console.jsx` |
| `/server/:id/files` | `pages/server/Files.jsx` |
| `/server/:id/content` | `pages/server/Content.jsx` |
| `/server/:id/properties` | `pages/server/Properties.jsx` |
| `/server/:id/backups` | `pages/server/Backups.jsx` |
| `/server/:id/logs` | `pages/server/Logs.jsx` |
| `/server/:id/settings` | `pages/server/Settings.jsx` |
| `/server/:id/ftp` | `pages/server/Ftp.jsx` |

---

## ✅ Completed features
- Vite + React 18 scaffold with react‑router‑dom v6 routing
- Development proxy to the Express backend (`:8082` by default)
- Full import of the original `style.css` – visual design unchanged
- Theme & accent bootstrap script preserved in `index.html`
- Authentication flow: login, optional 2FA, token storage, `/api/auth/me` hydration, logout
- Route guard (`RequireAuth`) + persistent sidebar layout
- Nested server‑tab layout (`ServerLayout.jsx`)
- Legacy HTML/JS kept under `src/legacy/` for reference

---

## 🛠️ Recent UI adjustments (for reference)
- **Primary button** – gradient removed; now uses a solid `var(--accent)` background for a cleaner look.
- **Dropdowns** – rendered through a React Portal to avoid clipping inside overflow‑hidden containers.
- **Server Icon card** – the unused **“Choose Item”** button was removed; the card now only offers **Upload PNG** and **Remove** actions.

---

## 📸 Screenshots

![Server Icon Card](C:/Users/stefa/Desktop/MinePanel/github-assets/server-icon.png)

![Primary Button Example](C:/Users/stefa/Desktop/MinePanel/github-assets/primary-button.png)

## 📋 Migration roadmap – legacy to React
The original vanilla frontend (~14 k lines) is kept in `src/legacy/`. Each page under `src/pages/` is a stub that references its legacy counterpart. Follow the steps below to incrementally replace legacy code with React components.

### Recommended order (self‑contained steps)
1. **`Panel.jsx`** – dashboard statistics. Extract the `#dashboard-view` markup from `legacy/index.html`, convert to JSX, and fetch data via `/api/system/...` and `/api/stats/...`.
2. **`Servers.jsx`** – server list & creation flow (`/api/servers`).
3. **`server/Overview.jsx` & `server/Console.jsx`** – console (WebSocket/SSE). Proxy support is already enabled in `vite.config.js`.
4. **`server/Files.jsx`, `server/Content.jsx`, `server/Properties.jsx`** – file manager and editors (CodeMirror already linked).
5. **`server/Backups.jsx`, `server/Logs.jsx`, `server/Ftp.jsx`, `server/Settings.jsx`** – straightforward CRUD against existing endpoints.
6. **Admin pages** – `Users.jsx`, `Ranks.jsx`, `Settings.jsx`, `Profile.jsx`. Reuse the legacy 2FA logic where applicable.
7. **`Discord.jsx`** – port legacy Discord bot integration.

### Porting pattern per page
```jsx
// 1️⃣ Copy the relevant <div class="view"> from legacy/index.html into JSX
//    (class → className, for → htmlFor, style="x: y" → style={{ x: 'y' }})
// 2️⃣ Replace direct DOM event listeners with React handlers.
// 3️⃣ Swap raw `fetch('/api/...')` calls for the centralized `api()` helper (adds Bearer token automatically).
// 4️⃣ Migrate module‑scoped state to `useState`/`useEffect` hooks.

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Servers() {
  const [servers, setServers] = useState([]);
  useEffect(() => { api('/api/servers').then(setServers); }, []);
  return (/* JSX generated from legacy markup */);
}
```

---

## 🗂️ Backend considerations
- **CORS** – handled by Vite proxy during development; no changes required.
- **SPA fallback** – in production, ensure Express serves `dist/index.html` for unknown routes (see the snippet above).
- **`/api/auth/me`** – must return the current user based on the Bearer token; adjust `AuthContext.jsx` if the response shape differs.

---

## 🤝 Contributing
1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Follow the migration pattern when adding new pages.
4. Run `npm run lint` and ensure tests (if any) pass.
5. Open a pull request with a concise description of the change.

---

*This README is intended for developers working on the MinePanel frontend. It provides an overview of the scaffold, recent UI changes, and a clear migration path from the legacy codebase.*
