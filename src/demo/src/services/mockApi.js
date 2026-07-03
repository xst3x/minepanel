// ── Mock API Service ─────────────────────────────────────────────────────────
// Replaces all backend API calls with in-memory mock data + realistic delays.
// This is the only file the rest of the app imports from '../../lib/api.js'
// (we'll alias it or replace imports — simpler: we just replace ./lib/api.js)

import * as D from './mockData.js';
import { getMockVersions } from './mockData.js';
import { isDemoRestricted } from './demoRestrictions.js';

// ── Simulated delay ──────────────────────────────────────────────────────────
const MIN_DELAY = 80;
const MAX_DELAY = 350;

function delay() {
  return new Promise(r => setTimeout(r, MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY)));
}

// ── Token handling (same interface as real api.js) ──────────────────────────
const TOKEN_KEY = 'mp_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || 'demo-token-abc123';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// ── Mock router — maps URL patterns to mock data ────────────────────────────

async function mockHandler(path, opts = {}) {
  await delay();

  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body || {};

  // ── Auth routes ────────────────────────────────────────────────────────────
  if (path === '/api/auth/login' && method === 'POST') {
    if (body.username === 'Admin' && (body.password === 'admin' || body.password === 'Admin123')) {
      return { token: 'demo-token-abc123', user: D.getCurrentUser() };
    }
    const err = new Error('Invalid username or password.');
    err.status = 401;
    err.code = 'AUTH_INVALID_CREDENTIALS';
    throw err;
  }

  if (path === '/api/auth/logout') return { message: 'Logged out.' };
  if (path === '/api/auth/forgot-check') {
    return { has2fa: false };
  }
  if (path === '/api/auth/password-reset-with-totp') {
    throw new Error('Password reset is disabled in demo mode.');
  }
  if (path === '/api/auth/register') throw new Error('Registration is disabled in demo mode.');
  if (path === '/api/auth/2fa/status') return { configured: false, enabled: false };
  if (path === '/api/auth/2fa/setup') throw new Error('2FA setup is disabled in demo mode.');
  if (path === '/api/auth/2fa/verify') throw new Error('2FA verification is disabled in demo mode.');
  if (path === '/api/auth/2fa/toggle') throw new Error('2FA toggle is disabled in demo mode.');
  if (path === '/api/auth/2fa/disable') throw new Error('2FA disable is disabled in demo mode.');
  if (path === '/api/auth/2fa/regenerate-backup-codes') throw new Error('Backup codes are disabled in demo mode.');

  // ── User routes ────────────────────────────────────────────────────────────
  if (path === '/api/users/me' || path === '/api/users/me/username') {
    if (method === 'POST') throw new Error('Username change is disabled in demo mode.');
    return { user: D.getCurrentUser(), ...D.getCurrentUser() };
  }
  if (path.match(/\/api\/users\/me\/password/)) throw new Error('Password change is disabled in demo mode.');

  if (path === '/api/users') {
    return { users: D.getMockUsers(), isCallerManager: true };
  }
  if (path === '/api/users/permissions') return D.getMockAllPermissions();
  if (path.match(/\/api\/users\/permissions/)) return D.getMockAllPermissions();

  const userMatch = path.match(/\/api\/users\/(\d+)\/permissions/);
  if (userMatch) {
    return { rank: { id: 1 }, global: ['*'], servers: {} };
  }
  const userRankMatch = path.match(/\/api\/users\/(\d+)\/rank/);
  if (userRankMatch) return { message: 'Rank updated.' };
  const userDeleteMatch = path.match(/\/api\/users\/(\d+)\/delete/);
  if (userDeleteMatch) return { message: 'User deleted.' };
  const toggleMatch = path.match(/\/api\/users\/(\d+)\/toggle-disabled/);
  if (toggleMatch) return { message: 'User status updated.' };
  const changeNameMatch = path.match(/\/api\/users\/(\d+)\/change-name/);
  if (changeNameMatch) throw new Error('Username change is disabled in demo mode.');
  const changePassMatch = path.match(/\/api\/users\/(\d+)\/change-password/);
  if (changePassMatch) throw new Error('Password reset is disabled in demo mode.');

  if (path === '/api/users/change-name') throw new Error('Username change is disabled in demo mode.');
  if (path === '/api/users/change-password') throw new Error('Password change is disabled in demo mode.');
  if (path === '/api/users/create') throw new Error('User creation is disabled in demo mode.');
  if (path === '/api/users/generate-token') throw new Error('Token generation is disabled in demo mode.');
  if (path === '/api/users/tokens/clear-all') throw new Error('Token clearing is disabled in demo mode.');

  // ── Server routes ──────────────────────────────────────────────────────────
  if (path === '/api/servers' && method === 'GET') {
    return D.getServers();
  }
  if (path.match(/\/api\/servers\/reorder/)) {
    if (method === 'POST') return { message: 'Order saved.' };
  }

  const serverMatch = path.match(/\/api\/servers\/(\d+)(\/.*)?$/);
  if (serverMatch) {
    const sid = parseInt(serverMatch[1]);
    const sub = serverMatch[2] || '';

    // GET /api/servers/:id
    if (!sub && method === 'GET') {
      return D.getServer(sid);
    }
    // DELETE /api/servers/:id
    if (!sub && method === 'DELETE') {
      if (isDemoRestricted('server.delete')) throw demoError('Server deletion is disabled in the demo version.');
      return { message: 'Server deleted.' };
    }

    // ── /api/servers/:id/my-permissions
    if (sub === '/my-permissions') {
      return { permissions: ['*', 'root'], admin: true };
    }

    // ── Start / Stop / Restart / Kill
    if (['/start', '/stop', '/restart', '/kill'].includes(sub)) {
      const action = sub.replace('/', '');
      D.updateServer(sid, { status: action === 'start' ? 'online' : 'offline' });
      return { message: `Server ${action} command sent.` };
    }

    // ── Settings
    if (sub === '/settings') return { message: 'Settings saved.' };

    // ── Properties
    if (sub === '/properties') {
      if (method === 'GET') return D.getMockServerProperties(sid);
      return { message: 'Properties saved.' };
    }
    if (sub === '/properties/icon') {
      if (method === 'POST') return { message: 'Icon updated.' };
      if (method === 'DELETE') return { message: 'Icon removed.' };
    }

    // ── Files
    if (sub.startsWith('/files')) {
      return handleFileRoutes(sid, sub, method, body, path);
    }

    // ── Backups
    if (sub === '/backup-config') {
      if (method === 'GET') return { auto_backup: false, backup_interval: 24, backup_includes: 'all' };
      return { message: 'Config saved.' };
    }
    if (sub === '/backups') return D.getMockBackups();
    if (sub.match(/\/backups\/create/)) return { message: 'Backup created.' };
    if (sub.match(/\/backups\/.+\/restore/)) return { message: 'Backup restored.' };
    if (sub.match(/\/backups\/.+\/delete/)) return { message: 'Backup deleted.' };

    // ── Logs
    if (sub === '/logs') {
      return [{ name: 'latest.log', size: 15600 }, { name: 'bluemap.log', size: 3200 }];
    }
    if (sub.match(/\/logs\/read/)) {
      return { content: D.getConsoleHistory().slice(-100).join('\n'), page: 1, totalPages: 1 };
    }

    // ── FTP
    if (sub === '/ftp') return D.getMockFtpInfo();
    if (sub === '/ftp/toggle') return { enabled: true, running: true };
    if (sub === '/ftp/config') return { message: 'FTP config saved.' };
    if (sub === '/ftp/password') return { password: 'demo-ftp-password' };

    // ── Players
    if (sub.match(/\/players\/list/)) {
      return [
        { uuid: '550e8400-e29b-41d4-a716-446655440001', username: 'Player1' },
        { uuid: '550e8400-e29b-41d4-a716-446655440002', username: 'Player2' },
        { uuid: '550e8400-e29b-41d4-a716-446655440003', username: 'Player3' },
      ];
    }
    if (sub.match(/\/players\/([^/]+)/)) {
      const playerUuid = sub.match(/\/players\/([^/]+)/)[1];
      if (sub.includes('/command')) return { message: 'Command sent.' };
      if (sub.includes('/lists')) return handlePlayerListRoutes(sid, sub, method, body);
      return { health: 20, food: 20, stats: { stats: { 'minecraft:custom': { 'minecraft:play_time': 4320000, 'minecraft:deaths': 5, 'minecraft:mob_kills': 150, 'minecraft:player_kills': 12, 'minecraft:jump': 2500, 'minecraft:walk_one_cm': 1500000, 'minecraft:swim_one_cm': 50000, 'minecraft:fly_one_cm': 800000, 'minecraft:fall_one_cm': 30000, 'minecraft:drop': 45, 'minecraft:damage_taken': 25000, 'minecraft:damage_dealt': 85000, 'minecraft:sleep_in_bed': 30, 'minecraft:leave_game': 42, 'minecraft:traded_with_villager': 18, 'minecraft:time_since_death': 72000 }, 'minecraft:killed_by': { 'minecraft:skeleton': 3, 'minecraft:creeper': 1 }, 'minecraft:crafted': { 'minecraft:stone_pickaxe': 5, 'minecraft:furnace': 2 }, 'minecraft:mined': { 'minecraft:stone': 450, 'minecraft:dirt': 230, 'minecraft:coal_ore': 85 } } }, advancements: { 'minecraft:story/mine_stone': { done: true }, 'minecraft:story/iron_tools': { done: true } } };
    }

    // ── Plugins / Content
    if (sub === '/plugins/installed' || sub.startsWith('/plugins/installed')) return D.getMockInstalledPlugins();
    if (sub.startsWith('/plugins/modrinth/search')) return { hits: D.getMockModrinthPlugins(), totalHits: D.getMockModrinthPlugins().length };
    if (sub.match(/\/plugins\/modrinth\/project\/.+\/versions/)) {
      return [
        { id: 'v1', name: '2.20.1', version_number: '2.20.1', date_published: '2024-11-01', game_versions: ['1.21', '1.20.4'], loaders: ['paper'], compatible: true, files: [{ primary: true, url: '#', size: 524288 }] },
        { id: 'v2', name: '2.19.0', version_number: '2.19.0', date_published: '2024-09-15', game_versions: ['1.20.4', '1.20'], loaders: ['paper'], compatible: true, files: [{ primary: true, url: '#', size: 512000 }] },
      ];
    }
    if (sub.match(/\/plugins\/modrinth\/project\//)) {
      const projId = sub.split('/').pop();
      const plugins = D.getMockModrinthPlugins();
      const p = plugins.find(x => x.project_id === projId) || plugins[0];
      return { ...p, id: p.project_id, body: `# ${p.title}\n\n${p.description}\n\n## Features\n\n- Easy to use\n- Lightweight\n- Configurable\n\n## Installation\n\n1. Download the jar\n2. Place it in your plugins folder\n3. Restart the server`, followers: 15000, team: 'Development Team', categories: p.categories, gallery: [], links: [], modrinthUrl: `https://modrinth.com/plugin/${p.project_id}` };
    }
    if (sub.match(/\/plugins\/datapacks/)) {
      return [{ name: 'datapack1.zip', size: 10240, modrinth: { projectId: 'dp1', versionNumber: '1.0' } }];
    }
    if (sub.match(/\/plugins\/install/)) return { message: 'Plugin installed.' };
    if (sub.match(/\/plugins\/uninstall/)) return { message: 'Plugin uninstalled.' };
    if (sub.match(/\/plugins\/update-all/)) return { message: 'All plugins up to date.', updated: 0 };
    if (sub.match(/\/plugins\/datapacks\/install/)) return { message: 'Datapack installed.' };

    // ── PocketMine
    if (sub.match(/\/pocketmine\/installed/)) return [];
    if (sub.match(/\/pocketmine\/search/)) return { hits: D.getMockPoggitPlugins(), total: D.getMockPoggitPlugins().length };
    if (sub.match(/\/pocketmine\/install/)) return { message: 'Plugin installed.' };
    if (sub.match(/\/pocketmine\/uninstall/)) return { message: 'Plugin uninstalled.' };
    if (sub.match(/\/pocketmine\/plugin\/.+\/releases/)) {
      return [{ version: '1.4.0', state: 2, submittedAt: 1700000000, api: [{ from: '5.0', till: '5.20' }], artifact: '#', name: 'PurePerms.phar' }];
    }
    if (sub.match(/\/pocketmine\/plugin\//)) return { name: 'PurePerms', description: 'A powerful permissions plugin for PocketMine-MP', downloads: 150000, mainAuthor: '64FF00', version: '1.4.0', icon: null, license: 'GPLv3', api: [{ from: '5.0', till: '5.20' }], poggitUrl: 'https://poggit.pmmp.io', repoUrl: 'https://github.com', repo: 'PurePerms' };

    // ── Automation
    if (sub === '/automation') {
      if (method === 'GET') return { rules: [], automationEnabled: false };
      if (method === 'POST') return { rule: { id: Date.now(), name: body.name, script: '# Write your automation script here\n', enabled: false } };
    }
    if (sub.match(/\/automation\/server-toggle/)) return { automationEnabled: true };
    if (sub.match(/\/automation\/\d+\/toggle/)) return { enabled: true };
    if (sub.match(/\/automation\/\d+$/)) return { rule: { id: 1, name: 'script', script: '', enabled: true } };
    if (sub.match(/\/automation\/verify/)) return { valid: true, errors: [] };
    if (sub.match(/\/automation\/run-test/)) return { message: 'Test run started.' };

    // ── Switch software
    if (sub.match(/\/switch-software/)) {
      if (body.confirm) return { message: 'Engine switched successfully!' };
      return { warnings: ['Existing plugins may not be compatible.'] };
    }

    // ── Update routes
    if (sub.match(/\/update\/settings/)) {
      return {
        auto_update_software: false,
        auto_update_content: false,
        force_incompatible_updates: false,
        auto_backup_before_update: true,
        ignored_plugins: [],
        update_interval_hours: 12,
        last_update_check: null,
        last_update_run: null,
        _updateState: { status: 'idle', message: null },
      };
    }
    if (sub.match(/\/update\/check/)) return { available: false, currentVersion: '1.21.3', latestVersion: '1.21.3', compatible: true };
    if (sub.match(/\/update\/run/)) return { newVersion: '1.21.3', message: 'Update complete!' };
    if (sub.match(/\/update\/rollback/)) return { restoredFrom: 'backup' };

    // ── Start command
    if (sub.match(/\/start-command/)) {
      if (method === 'GET') return { auto_command: 'java -Xms512M -Xmx2G -jar paper.jar nogui', custom_command: '' };
      return { message: 'Start command saved.' };
    }
  }

  // ── Create server
  if (path === '/api/servers/create' && method === 'POST') {
    const count = D.getServerCount();
    if (count >= 2) throw demoError('Server creation limit reached. Maximum 2 servers allowed in demo mode.');
    D.incrementServerCount();
    const newServer = {
      id: D.nextServerId(),
      name: body.name || 'New Server',
      software: body.software || 'paper',
      version: body.version || '1.21.3',
      status: 'offline',
      port: Number(body.port) || 25565,
      ram_mb: Number(body.ram_mb) || 2048,
      java_path: 'java',
      log_retention_days: 7,
      backup_retention_days: 30,
      autostart: false,
      autostart_on_crash: false,
      created_at: new Date().toISOString(),
      icon: null,
      modpack_title: null,
      modpack_version: null,
    };
    const servers = D.getServers();
    servers.push(newServer);
    D.setServers(servers);
    return { ...newServer, message: 'Server created!' };
  }

  if (path === '/api/servers/import' && method === 'POST') {
    throw demoError('Server import is disabled in demo mode.');
  }

  // ── System routes ──────────────────────────────────────────────────────────
  if (path === '/api/system/versions') {
    return getMockVersions();
  }
  if (path === '/api/system/settings') {
    if (method === 'GET') return D.getMockSettings();
    return { message: 'Settings saved.' };
  }
  if (path === '/api/system/change-port') throw demoError('Port change is disabled in demo mode.');
  if (path === '/api/system/metrics') return D.getMockMetrics();
  if (path === '/api/system/health') return { booted: true };

  // ── Discord routes ─────────────────────────────────────────────────────────
  if (path === '/api/discord/bots') {
    if (method === 'GET') return D.getMockDiscordBots();
    if (method === 'POST') return { id: 2, message: 'Bot added.' };
  }
  if (path.match(/\/api\/discord\/bots\/\d+$/)) {
    if (method === 'PUT') return { message: 'Bot updated.' };
    if (method === 'DELETE') return { message: 'Bot deleted.' };
  }
  if (path.match(/\/api\/discord\/bots\/\d+\/toggle/)) return { message: 'Bot toggled.' };
  if (path === '/api/discord/bots/servers') return D.getServers();
  if (path === '/api/discord/bots/validate-token') return { valid: true, bot: { username: 'MinePanel Bot', avatar: null } };

  // ── Rank routes ────────────────────────────────────────────────────────────
  if (path === '/api/ranks') {
    const order = D.getRankOrder();
    const ranks = D.getMockRanks();
    if (order) {
      const ordered = [];
      for (const id of order) {
        const r = ranks.find(x => x.id === id);
        if (r) ordered.push(r);
      }
      for (const r of ranks) {
        if (!ordered.includes(r)) ordered.push(r);
      }
      return ordered;
    }
    return ranks;
  }
  if (path.match(/\/api\/ranks\/reorder/)) {
    D.setRankOrder(body.order);
    return { message: 'Order saved.' };
  }
  if (path.match(/\/api\/ranks\/create/)) return { rankId: Date.now() };
  if (path.match(/\/api\/ranks\/\d+$/)) return { message: 'Rank updated.' };
  if (path.match(/\/api\/ranks\/\d+\/delete/)) return { message: 'Rank deleted.' };

  // ── Docs routes ────────────────────────────────────────────────────────────
  if (path === '/api/docs') return D.getMockDocs();

  // ── Modpack routes ─────────────────────────────────────────────────────────
  if (path.match(/\/api\/modpacks\/search/)) return { hits: D.getMockModpacks(), totalHits: D.getMockModpacks().length };
  if (path.match(/\/api\/modpacks\/categories/)) return { categories: [['popular', 'Popular'], ['tech', 'Tech'], ['magic', 'Magic'], ['adventure', 'Adventure'], ['quest', 'Quest']] };
  if (path.match(/\/api\/modpacks\/game-versions/)) return { versions: ['1.21', '1.20.4', '1.20', '1.19.4', '1.18.2'] };
  if (path.match(/\/api\/modpacks\/create-server/)) throw demoError('Modpack installation is disabled in demo mode. Download the full version.');
  if (path.match(/\/api\/modpacks\/project\/[^/]+\/versions/)) return [{ id: 'v1', name: '1.0.0', version_number: '1.0.0', date_published: '2024-11-01', game_versions: ['1.21'], loaders: ['fabric', 'forge'], files: [{ primary: true, url: '#', size: 1000000 }] }];
  if (path.match(/\/api\/modpacks\/project\//)) {
    const modpacks = D.getMockModpacks();
    const p = modpacks[0] || modpacks[0];
    return { ...p, id: p.project_id, body: '# Modpack\n\nA curated modpack for MinePanel demo.\n\n## Included Mods\n\n- JourneyMap\n- JEI\n- OptiFine\n- Many more!', followers: 50000, team: 'Demo Team', categories: ['tech', 'magic'], gallery: [], links: [], modrinthUrl: 'https://modrinth.com/modpack/' + p.project_id, icon_url: null };
  }
  if (path.match(/\/api\/modpacks\/version\/.+\/contents/)) return { mods: [], resource_packs: [], shaders: [] };

  // ── Modpack icon proxy ──────────────────────────────────────────────────────
  if (path.match(/\/api\/modpacks\/icon/)) {
    return { message: 'Icon proxy not available in demo mode.' };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  console.warn('[MockAPI] Unhandled route:', method, path);
  throw new Error(`Backend API not available in demo mode: ${method} ${path}`);
}

// ── File route handler ───────────────────────────────────────────────────────
function handleFileRoutes(sid, sub, method, body, fullPath) {
  const url = new URL(fullPath, 'http://localhost');
  const p = url.searchParams;

  if (sub === '/files/list' || sub.startsWith('/files/list')) {
    const path = p.get('path') || '/';
    return D.getMockFiles(path);
  }
  if (sub === '/files/read' || sub.startsWith('/files/read')) {
    const filePath = p.get('path') || '';
    const content = D.getFileContent(filePath);
    return { content: content || '# File not found in demo\n\nThis file does not exist in the demo environment.' };
  }
  if (sub === '/files/write') {
    D.setFileContent(body.path, body.content);
    return { message: 'File saved.' };
  }
  if (sub === '/files/mkdir') {
    D.createMockFile(body.path, true);
    return { message: 'Directory created.' };
  }
  if (sub === '/files/create') {
    D.createMockFile(body.path, false);
    return { message: 'File created.' };
  }
  if (sub === '/files/upload') throw demoError('File upload is disabled in demo mode.');
  if (sub === '/files/delete') {
    D.setFileContent(body.path, '');
    return { message: 'File deleted.' };
  }
  if (sub === '/files/batch-delete') return { message: 'Files deleted.' };
  if (sub === '/files/batch-download') return { downloadUrl: '#' };
  if (sub === '/files/archive') return { message: 'Archive created.' };
  if (sub === '/files/move') return { message: 'Files moved.' };
  if (sub === '/files/copy') return { message: 'Files copied.' };
  if (sub === '/files/extract') return { message: 'Archive extracted.' };
  if (sub.match(/\/files\/download/)) return { downloadUrl: '#' };
  if (sub.match(/\/files\/archive-tree/)) {
    return { archiveName: 'demo.zip', totalEntries: 3, entries: [{ name: 'README.txt', isDirectory: false, size: 120 }, { name: 'config.yml', isDirectory: false, size: 300 }, { name: 'scripts/', isDirectory: true, size: 0 }] };
  }

  console.warn('[MockAPI] Unhandled file route:', sub);
  throw new Error(`Backend API not available in demo mode: ${method} ${fullPath}`);
}

// ── Player list routes ───────────────────────────────────────────────────────
function handlePlayerListRoutes(sid, sub, method, body) {
  if (sub.includes('whitelist')) {
    if (method === 'GET') return [];
    if (method === 'POST') return { message: 'Player added to whitelist.' };
    if (method === 'DELETE') return { message: 'Player removed from whitelist.' };
  }
  if (sub.includes('ops')) {
    if (method === 'GET') return [];
    if (method === 'POST') return { message: 'Player opped.' };
    if (method === 'DELETE') return { message: 'Player deopped.' };
  }
  if (sub.includes('banned-players')) {
    if (method === 'GET') return [];
    if (method === 'POST') return { message: 'Player banned.' };
    if (method === 'DELETE') return { message: 'Player pardoned.' };
  }
  if (sub.includes('banned-ips')) {
    if (method === 'GET') return [];
    if (method === 'POST') return { message: 'IP banned.' };
    if (method === 'DELETE') return { message: 'IP unbanned.' };
  }
  return [];
}

function demoError(msg) {
  const err = new Error(msg);
  err.status = 403;
  err.code = 'DEMO_RESTRICTION';
  return err;
}

// ── Public mock API function ─────────────────────────────────────────────────
export async function mockApi(path, opts = {}) {
  return mockHandler(path, opts);
}

// ── Convenience re-exports for mock usage ────────────────────────────────────
export default mockApi;
