# MinePanel: Frontend Architecture & Component Map

Complete guide to React/Vite frontend structure, component hierarchy, state management, and API integration.

---

## Frontend Setup

**Framework**: React 18 + Vite

**Location**: `src/frontend/`

**Build**: `npm run build` → outputs `dist/`

**Dev Server**: `npm run dev` → http://localhost:5173

**CSS**: Pure CSS with CSS variables (no Tailwind, no Bootstrap)

**Routing**: React Router DOM v6

**HTTP Client**: Axios with custom API wrapper (`lib/api.js`)

---

## Application Entry Point

### `main.jsx`
- Mounts React app to `<div id="root">`
- Renders `<App />`

### `App.jsx`
- Top-level router configuration
- Defines all routes and layout wrapping
- Route definitions below

---

## Route Structure

### Public Routes (No Auth Required)
```
/login                  → Login.jsx (authentication)
```

### Protected Routes (Auth Required)
```
/                       → Panel.jsx (dashboard)
/servers                → Servers.jsx (server list)
/settings               → Settings.jsx (panel config)
/users                  → Users.jsx (user management)
/ranks                  → Ranks.jsx (permission editor)
/profile                → Profile.jsx (user profile)
/discord                → Discord.jsx (bot/webhook config)
/docs                   → Docs.jsx (documentation)

/server/:serverId/*     → ServerLayout.jsx wrapper
  /server/:serverId/overview   → pages/server/Overview.jsx
  /server/:serverId/console    → pages/server/Console.jsx
  /server/:serverId/files      → pages/server/Files.jsx
  /server/:serverId/backup     → pages/server/Backup.jsx
  /server/:serverId/plugins    → pages/server/Plugins.jsx
  /server/:serverId/properties → pages/server/Properties.jsx
  /server/:serverId/players    → pages/server/Players.jsx
  /server/:serverId/settings   → pages/server/Settings.jsx
  /server/:serverId/stats      → pages/server/Stats.jsx
  /server/:serverId/logs       → pages/server/Logs.jsx
```

---

## Core Components

### `AppLayout.jsx` [CORE]

**Purpose**: Main layout wrapper, navigation, theming

**Renders**:
- Top navbar with MinePanel logo, title, user menu
- Left sidebar with:
  - "SERVERS" section (list of user's servers)
  - "GLOBAL" section (Users, Ranks, Settings, Discord, Docs)
  - Create Server button, Import Server button
- Main content area
- Toast notification system

**Props**: `children` (pages to render)

**State**:
- `isNavOpen` (mobile nav toggle)
- `theme` (dark/light)
- `accentColor` (from user custom accent or default)

**Features**:
- CSS variable injection for dynamic theming
- SVG logo/favicon rendering (inline React components)
- Responsive (nav collapses on mobile)
- Active route highlighting

**Logo & Favicon Implementation**:
```javascript
// LogoIcon & FaviconIcon are inline React SVG components
// Inherit --accent CSS variable for color
// useInjectFavicon hook creates data:image/svg+xml favicon
const logoColor = 'hsl(149,90%,42%)';  // Green accent
```

---

### `ServerLayout.jsx` [CORE]

**Purpose**: Wrapper for server-specific pages, enforces `:serverId` param

**Props**: `children` (nested pages like Console, Files, etc.)

**Provides**:
- Server context (`serverId` from URL param)
- Server data fetching (name, status, version)
- Tab navigation between server pages
- Quick action buttons (Start, Stop, Restart, Kill)
- Status indicator (Online/Offline/Crashed)

**Renders**:
```
ServerLayout
  ├─ Server Header (name, status, action buttons)
  ├─ Tab Navigation (Overview, Console, Files, Backup, etc.)
  ├─ Nested Route Content (children)
  └─ Footer (port, owner, created date)
```

---

### `RequireAuth.jsx`

**Purpose**: Route guard (401 redirect if not authenticated)

**Usage**:
```jsx
<Route element={<RequireAuth />}>
  <Route path="/servers" element={<Servers />} />
</Route>
```

**Flow**:
1. Check AuthContext for token
2. If missing/invalid: redirect to /login
3. If valid: render route

---

### `CodeEditor.jsx`

**Purpose**: Syntax-highlighted code editor (server files, configs)

**Library**: CodeMirror (@codemirror/*)

**Props**:
- `value`: File contents (string)
- `onChange`: Update callback
- `language`: 'javascript', 'properties', 'java', 'yaml', etc.
- `readOnly`: Disable editing (boolean)
- `height`: CSS height

**Features**:
- Syntax highlighting per language
- Line numbers
- Automatic indentation
- Undo/redo
- Search & replace (Ctrl+F)

---

### `Select.jsx`

**Purpose**: Reusable dropdown/select component

**Props**:
- `options`: `[{ label, value }, ...]`
- `value`: Currently selected
- `onChange`: Update callback
- `placeholder`: Text when empty
- `disabled`: Disable selection

**Usage**:
```jsx
<Select
  options={[
  { label: 'Paper', value: 'paper' },
  { label: 'Spigot', value: 'spigot' }
]}
  value={selectedSoftware}
  onChange={(v) => setSelectedSoftware(v)}
/>
```

---

### `Toast.jsx`

**Purpose**: Notification system (success, error, warning, info)

**Global Usage** (via context):
```javascript
import { useToast } from '../context/ToastContext';
const { showToast } = useToast();

showToast('Server started successfully', 'success');
showToast('Failed to delete server', 'error');
```

**Features**:
- Auto-dismiss (5 seconds)
- Stacking (multiple toasts)
- Color-coded by type (green=success, red=error, etc.)

---

## Pages

### `Login.jsx`

**Route**: `/login`

**Purpose**: Authentication entry point

**Features**:
- Username/password form
- "Remember me" checkbox
- 2FA TOTP input (if enabled)
- "Forgot password?" link (if configured)
- Backend validation feedback

**State**:
- `username`, `password` (form inputs)
- `totp_token` (if 2FA required)
- `loading` (submission state)
- `error` (error message)

**On Submit**:
1. POST /auth/login { username, password }
2. If 2FA required: show TOTP input
3. If 2FA enabled: POST /auth/totp/verify { token }
4. Store JWT in AuthContext
5. Redirect to /

---

### `Panel.jsx`

**Route**: `/` (dashboard)

**Purpose**: Overview of all servers, quick stats

**Renders**:
- "Quick Stats" cards:
  - Total servers
  - Online servers
  - Total players
  - Panel uptime
- Server grid/cards:
  - Server name, software, version
  - Status (online/offline)
  - Player count
  - CPU/RAM usage (last sample)
  - Quick action buttons
- Recent activity log (if configured)

**API Calls**:
- GET /api/server (list all servers)
- GET /api/stats/:serverId/latest (for each server)
- GET /api/system/info (panel uptime)

---

### `Servers.jsx`

**Route**: `/servers`

**Purpose**: Server management, creation, import

**Renders**:
- Server list table with columns:
  - Name, Software, Version, Port, RAM, Owner
  - Status (online/offline)
  - Action buttons (Edit, Delete, Import, Export)
- "Create Server" button → form modal
- "Import Server" button → ZIP upload modal

**Create Server Modal**:
- Input: Name, Software (dropdown), Version (dropdown), RAM, Port
- On Submit:
  1. POST /api/server { name, software, version, ram_mb, port }
  2. Show loading spinner (JAR download takes time)
  3. Redirect to /server/:id/overview

**Import Server Modal**:
- Drag-drop or file input: ZIP file
- On Submit:
  1. POST /api/server/:id/import (multipart form-data)
  2. Extract and validate
  3. Show success toast

---

### `Settings.jsx`

**Route**: `/settings`

**Purpose**: Global panel configuration

**Sections**:
- **Panel Info**: Name, version, uptime
- **Branding**: Logo, theme color, favicon
- **Database**: Backup, restore, integrity check
- **Security**: JWT secret rotation, password policy
- **Features**: Discord bot token, webhook prefix
- **Cleanup**: Purge old logs, old backups

**API Calls**:
- PATCH /api/system/settings
- POST /api/db/backup
- POST /api/db/integrity

---

### `Users.jsx`

**Route**: `/users`

**Purpose**: User account management (admin view)

**Renders**:
- User list table:
  - Username, Email, Rank, Created Date
  - Action buttons (Edit, Delete, Reset Password)
- "Create User" button → user creation modal

**Create User Modal**:
- Input: Username, Email, Role (dropdown), Password
- On Submit: POST /api/users
- Options: Send invitation email, auto-generate password

**Edit User Modal**:
- Change: Username, Email, Role
- Change password
- Delete user
- View last login

---

### `Ranks.jsx`

**Route**: `/ranks`

**Purpose**: Permission group editor

**Renders**:
- List of ranks with:
  - Name, Color, Permission count
  - Edit, Delete buttons
- "Create Rank" button → rank form modal

**Edit Rank Modal**:
- Input: Name, Color picker, Permission checkboxes
- Permission categories:
  - Server (start, stop, restart, etc.)
  - Console (read, write)
  - Files (read, write, delete)
  - Players (kick, ban, OP)
  - Plugins (manage)
  - Backups (create, restore, delete)
  - Settings (read, write)
- "Select All", "Deselect All" shortcuts

---

### `Profile.jsx`

**Route**: `/profile`

**Purpose**: User settings, 2FA, theme customization

**Sections**:
- **Account Info**: Username, Email, Created Date
- **Password**: Change password form
- **Avatar**: Upload avatar image
- **Theme**: Custom accent color picker
- **Two-Factor Auth**:
  - Status (enabled/disabled)
  - Setup button → QR code modal
  - Backup codes download
  - Disable button
- **Sessions**: Active sessions (current IP, location, last active)

**API Calls**:
- PATCH /api/users/:userId/password
- POST /api/users/:userId/avatar
- PATCH /api/users/:userId/custom-accent
- POST /auth/totp/setup
- POST /auth/totp/confirm
- POST /auth/totp/disable

---

### `Discord.jsx`

**Route**: `/discord`

**Purpose**: Discord bot and webhook configuration

**Sections**:
- **Discord Bot**:
  - Register new bot (token input)
  - List registered bots
  - Link bot to server
  - Delete bot
- **Server Webhooks**:
  - Per-server Discord webhook URL
  - Event selection (server start/stop, player join/leave)
  - Test webhook button

**API Calls**:
- POST /api/discord-bots
- GET /api/discord-bots
- POST /api/discord-bots/:botId/link-server
- POST /api/discord/webhook
- DELETE /api/discord/webhook/:webhookId

---

### `Docs.jsx`

**Route**: `/docs`

**Purpose**: In-app documentation viewer

**Features**:
- Sidebar: Doc category list
- Main area: Rendered markdown
- Search bar (Ctrl+K)
- Breadcrumb navigation
- "Edit on GitHub" link (optional)

**API**:
- GET /api/docs (list)
- GET /api/docs/:docId (content)

---

## Server-Specific Pages (`pages/server/`)

### `Overview.jsx`

**Route**: `/server/:serverId/overview`

**Purpose**: Server dashboard and quick stats

**Renders**:
- **Server Status Card**:
  - Online/Offline/Crashed indicator
  - Uptime
  - Port, Software, Version
  - World size
- **Performance Cards**:
  - CPU usage (% + bar)
  - Memory usage (% + bar)
  - Player count (online / max)
  - CPU & RAM last 30s (mini graph)
- **Quick Actions**:
  - Start, Stop, Restart, Kill buttons
- **Recent Activity**:
  - Last 10 console messages
  - Last 5 crashes (if any)

**WebSocket**:
- Subscribe to `server:stats` (updates every ~2-5s)
- Subscribe to `server:process-state` (online/offline changes)

---

### `Console.jsx`

**Route**: `/server/:serverId/console`

**Purpose**: Real-time server console

**Layout**:
```
┌─────────────────────────────────┐
│ Console Output (scrollable)     │
│ [15:30:45] Server started       │ ← WebSocket lines
│ [15:30:46] Loading plugins      │
│ [15:30:48] [done]               │
├─────────────────────────────────┤
│ /say Hello ▌                    │ ← Input field
└─────────────────────────────────┘
```

**Features**:
- Auto-scroll to bottom
- Line timestamps
- Color-coded output (if server sends ANSI codes)
- Copy console output
- Clear console button
- Disable console (server offline)

**Input**:
- Type command → Enter
- POST /api/server/:id/console/command { command }
- Output appears in console

**WebSocket**:
- Subscribe to `server:console`
- Each message: `{ type: 'server:console', line: '...' }`

---

### `Files.jsx`

**Route**: `/server/:serverId/files`

**Purpose**: File browser, editor, upload/download

**Layout**:
```
┌────────────────────────────────────────┐
│ Breadcrumb: servers / server1 / world │
├────────────────────────────────────────┤
│ New Folder │ Upload Files │ Delete     │
├────────────────────────────────────────┤
│ Filename         │ Size   │ Modified   │
│ world/ (folder)  │ -      │ 2 hours    │
│ server.jar       │ 850 MB │ 1 month    │
│ server.prop.. ✎  │ 2 KB   │ 1 day      │
├────────────────────────────────────────┤
│ File Preview: (server.properties)      │
│ [Edit] [Download] [Delete]             │
└────────────────────────────────────────┘
```

**Features**:
- Directory navigation
- File preview (text files in CodeEditor)
- Edit text files → POST /api/files/:id/write
- Upload files → POST /api/files/:id/upload (drag-drop)
- Download files → GET /api/files/:id/download
- Delete files/dirs → POST /api/files/:id/delete
- Create folders → POST /api/files/:id/createdir
- Rename → POST /api/files/:id/rename

**API Calls**:
- GET /api/files/:serverId (list)
- GET /api/files/:serverId/read (file content)
- POST /api/files/:serverId/write (save file)
- POST /api/files/:serverId/upload (multipart)
- GET /api/files/:serverId/download (binary)
- POST /api/files/:serverId/delete
- POST /api/files/:serverId/createdir
- POST /api/files/:serverId/rename

---

### `Backup.jsx`

**Route**: `/server/:serverId/backup`

**Purpose**: Backup management (create, restore, delete)

**Renders**:
- **Manual Backup**:
  - "Create Backup Now" button
  - Backup progress bar (if in progress)
  - Last backup timestamp
- **Backup List**:
  - Table: Backup name, size, created, action buttons
  - Action buttons: Restore, Download, Delete
- **Auto-Backup Config**:
  - Enable checkbox
  - Interval (hours)
  - Retention policy (days)
  - Backup scope (all / world-only / plugins-only)

**Flow**:
1. Click "Create Backup Now"
2. POST /api/backup/:serverId
3. Show spinner ("Creating backup, server may pause...")
4. GET /api/backup/:serverId/status (poll progress)
5. On complete, show "Backup created: timestamp"

**Restore Flow**:
1. Click "Restore" on backup
2. Confirm: "This will overwrite current server state"
3. POST /api/backup/:serverId/restore { backupId }
4. Server stops, files replaced, server restarts
5. Show status "Restore complete"

---

### `Plugins.jsx`

**Route**: `/server/:serverId/plugins`

**Purpose**: Plugin management (view, upload, delete, ignore list)

**Renders**:
- **Plugin List**:
  - Table: Name, Version, Authors, Status (loaded/not loaded)
  - Action buttons: Delete
  - Ignore toggle (exclude on restart)
- **Upload**:
  - "Upload Plugin" button
  - Drag-drop JAR file area
  - Progress bar on upload
- **Ignore List**:
  - Multi-select: Which plugins to ignore on restart
  - Save button

**API Calls**:
- GET /api/plugins/:serverId (list)
- POST /api/plugins/:serverId/upload (multipart JAR)
- DELETE /api/plugins/:serverId/:pluginName
- PATCH /api/plugins/:serverId/ignore { ignored: [...] }

---

### `Properties.jsx`

**Route**: `/server/:serverId/properties`

**Purpose**: server.properties editor

**Renders**:
- Key-value editor:
  - Search bar (filter keys)
  - Table: Property, Value, Description (if known)
  - Edit inline (click to edit)
  - Add new property button
  - Delete property button
- Save button
- Reset to default button

**API Calls**:
- GET /api/properties/:serverId (parse file)
- PATCH /api/properties/:serverId (save changes)

**Pre-defined Properties** (with descriptions):
```
motd                    → Server message of the day
max-players             → Max player count
difficulty              → Game difficulty
gamemode                → Creative, Survival, etc.
allow-flight            → Can players fly
pvp                     → Player vs player enabled
spawn-protection        → Spawn area protection radius
view-distance           → Chunk render distance
... (20+ more)
```

---

### `Players.jsx`

**Route**: `/server/:serverId/players`

**Purpose**: Player management (ban, whitelist, OP)

**Sections**:
- **Online Players**:
  - List: Player names, joined time
  - Actions: Kick, Ban, OP
- **Whitelist**:
  - Enabled checkbox
  - List: Player names
  - Add player input
  - Remove buttons
- **Bans**:
  - List: Banned players, ban date, reason
  - Unban button
- **OPs**:
  - List: OP players, OP level
  - Revoke OP button

**API Calls**:
- GET /api/players/:serverId (online list)
- POST /api/players/:serverId/kick { playerName, reason }
- POST /api/players/:serverId/ban { playerName, reason }
- POST /api/players/:serverId/unban { playerName }
- GET /api/players/:serverId/whitelist
- POST /api/players/:serverId/whitelist/add { playerName }
- POST /api/players/:serverId/whitelist/remove { playerName }
- POST /api/players/:serverId/op { playerName }
- POST /api/players/:serverId/deop { playerName }

---

### `Settings.jsx`

**Route**: `/server/:serverId/settings`

**Purpose**: Server-specific configuration

**Sections**:
- **Basic**:
  - Server name, RAM, Java path
- **Auto-Update**:
  - Check for updates button
  - Auto-update enabled checkbox
  - Notification preference
- **Backup** (see Backup.jsx for detail)
- **FTP**:
  - Enable checkbox
  - Port number
  - Credentials (show/hide)
  - Test connection button
- **Performance**:
  - CPU threshold (%)
  - Memory threshold (%)
  - Throttle on exceed (yes/no)
- **Stats Collection**:
  - Interval (seconds)
  - Retention (days)
  - Track TPS checkbox

**API Calls**:
- PATCH /api/server/:id (basic update)
- PATCH /api/server/:id/update/settings (all settings)

---

### `Stats.jsx`

**Route**: `/server/:serverId/stats`

**Purpose**: Performance graphs and trends

**Renders**:
- **Time Range Selector**: Last hour / 6 hours / 24 hours / 7 days
- **Graphs** (using Chart.js or custom SVG):
  - CPU usage over time (line graph, %)
  - Memory usage over time (area graph, MB)
  - Player count trend (line graph)
- **Summary Stats**:
  - Average CPU, Max CPU
  - Average Memory, Max Memory
  - Peak players, Current players
  - Uptime %

**API Calls**:
- GET /api/stats/:serverId (time-series data)
- Polling: Every 5-10 seconds for live updates

---

### `Logs.jsx`

**Route**: `/server/:serverId/logs`

**Purpose**: Log file viewer

**Renders**:
- **Log File List**:
  - latest.log (most recent)
  - 2024-06-19.log, 2024-06-18.log, etc.
  - File size, last modified
- **Log Viewer**:
  - Display log file (tail: last 500 lines)
  - Search bar (Ctrl+F)
  - Download log button
  - Clear logs button (archive)
- **Error Log**:
  - Separate view for crash-reports
  - Stack traces highlighted

**API Calls**:
- GET /api/logs/:serverId (list)
- GET /api/logs/:serverId/:logFile (content, tail)

---

## State Management

### Context: `AuthContext.jsx`

**Global State**:
```javascript
{
  user: { id, username, email, rank, ... },
  token: "eyJhbGc...",
  isAuthenticated: boolean,
  loading: boolean,
  error: string
}
```

**Methods**:
```javascript
const { login, logout, updateUser, checkAuth } = useAuthContext();

await login(username, password);  // POST /auth/login
await logout();                   // Clear token
```

**Usage in Pages**:
```jsx
const { user, isAuthenticated } = useAuthContext();
if (!isAuthenticated) return <Navigate to="/login" />;
return <h1>Welcome, {user.username}</h1>;
```

---

## API Integration (`lib/api.js`)

**Axios Wrapper** with auto-token injection

```javascript
import api from '../lib/api';

// GET request
const servers = await api.get('/server');

// POST request
const newServer = await api.post('/server', {
  name: 'Server 1',
  software: 'paper',
  version: '1.20.1',
  ram_mb: 1024,
  port: 25566
});

// PATCH request
await api.patch(`/server/${id}`, { name: 'New Name' });

// DELETE request
await api.delete(`/server/${id}`);

// Error handling
try {
  await api.get('/server/999');
} catch (err) {
  console.error(err.response.data.message);  // "Server not found"
}
```

**Features**:
- Auto-adds `Authorization: Bearer <token>` header
- Parses error responses
- Retry logic (optional, for network failures)
- Request/response logging (dev mode)
- Timeout: 30 seconds (per request)

---

## Styling System

**Location**: `styles/style.css`

**Approach**: CSS Variables + Pure CSS (no preprocessor)

### CSS Variables (Root)
```css
:root {
  /* Colors */
  --accent: #10b981;                    /* Primary brand color */
  --accent-hover: #059669;              /* Accent on hover */
  --accent-glow: rgba(16, 185, 129, 0.3);
  --accent-subtle: rgba(16, 185, 129, 0.1);
  
  --bg-primary: #1f2937;                /* Main background */
  --bg-surface: #111827;                /* Card/panel background */
  --bg-surface-hover: #1a202c;
  
  --text-primary: #f3f4f6;              /* Main text */
  --text-secondary: #d1d5db;            /* Secondary text */
  --text-muted: #9ca3af;                /* Disabled text */
  
  --border-color: #374151;              /* Border color */
  --border-color-subtle: #1e293b;
  
  --danger: #ef4444;                    /* Error/delete color */
  --warning: #f59e0b;                   /* Warning color */
  --success: #10b981;                   /* Success color */
  --info: #3b82f6;                      /* Info color */
  
  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  
  /* Typography */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  
  /* Border Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}
```

### Theme Customization
```javascript
// User can set custom accent color
document.documentElement.style.setProperty('--accent', '#3b82f6');
document.documentElement.style.setProperty('--accent-hover', '#1d4ed8');
```

### Strict Style Rules (Per Requirements)
- ✅ No gradients (use solid colors + --accent-subtle)
- ✅ No emojis in code/UI (use icons or text)
- ✅ No marketing language in comments (be technical)
- ✅ Use CSS variables for all colors
- ✅ Responsive design (mobile-first)

---

## Component Reusability Matrix

| Component | Reused In | Times | Level |
|-----------|-----------|-------|-------|
| Select | Server create, User create, Filter forms | 10+ | HIGH |
| CodeEditor | Files, Properties, Logs | 8+ | HIGH |
| Toast | All pages (notifications) | 50+ | HIGH |
| RequireAuth | Route wrapper | - | HIGH |
| ServerLayout | All /server/* pages | 10 | HIGH |
| AppLayout | All pages | ALL | **CORE** |

---

## Testing & QA

**Test Files**: `tests/test_frontend.js` (if exists)

**Manual Testing Checklist**:
- [ ] Login/logout flow
- [ ] Create server (with JAR download)
- [ ] Start/stop server
- [ ] View console output (WebSocket)
- [ ] Upload file
- [ ] Edit server.properties
- [ ] Create backup, restore backup
- [ ] Ban/whitelist players
- [ ] Change user settings
- [ ] 2FA setup/disable
- [ ] Discord webhook test
- [ ] Responsive (mobile, tablet, desktop)

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)

**Polyfills**: None needed (ES2020+)

---

## Performance Tips

- **Code Splitting**: Routes are lazy-loaded by Vite
- **Image Optimization**: Use WebP where possible
- **Caching**: LocalStorage for non-sensitive data (user preferences)
- **API Calls**: Debounce file upload progress, throttle console output
- **Rendering**: useMemo/useCallback for expensive computations

---

## Troubleshooting Frontend Issues

### Blank screen after login
- Check AuthContext initialization
- Verify token stored correctly
- Check browser console for JS errors
- Clear LocalStorage: `localStorage.clear()`

### Console WebSocket not connecting
- Check browser WS connection (DevTools → Network → WS)
- Verify token in WebSocket headers
- Check backend server.js WebSocket handler
- Firewall may block WebSocket (port 8082 or custom)

### Styles not applying
- Check CSS variables loaded (inspect `:root`)
- Verify no conflicting CSS
- Clear browser cache (Ctrl+Shift+Delete)
- Check if dark mode CSS is being overridden

### API errors 401/403
- Token may have expired (auto-refresh or re-login)
- User permissions insufficient (check Rank)
- CORS issue (backend should allow frontend origin)

---

## Future Improvements

- [ ] Dark/Light theme toggle
- [ ] Mobile app (React Native)
- [ ] Real-time player activity dashboard
- [ ] Plugin marketplace integration
- [ ] Server backup scheduling UI
- [ ] Analytics dashboard
- [ ] Community features (player profiles, stats leaderboard)
