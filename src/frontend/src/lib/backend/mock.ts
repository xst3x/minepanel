import * as D from './fixtures.js';
import { fallbackSkin } from '../playerSkin';
import { notifyUnavailable, unavailable } from './restrictions';
import type { RequestOptions } from './types';
export { extractApiErrorMessage } from './errors';
export const demoMode = true;
export const accountStorageKey = 'mp_demo_accounts';
export const getToken = () => 'local-demo-session';
export const setToken = (_token: unknown) => {}; // Never read or overwrite production credentials.
export const request = async (_path: string, _opts?: RequestInit): Promise<Response> => unavailable();
export const createUploadRequest = (): XMLHttpRequest | null => { notifyUnavailable(); return null; };
export const assetUrl = (url: string) => url.startsWith('https://vzge.me/full/') ? fallbackSkin : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#345849"/><path d="M12 12h24v24H12z" fill="#98c9ad"/><path d="M16 20h4v4h-4zm12 0h4v4h-4zm-8 8h8v4h-8z" fill="#234236"/></svg>');
const started = new Map<number, number>([[1, Date.now() - 120000]]);
const sockets = new Set<DemoSocket>();
const history = new Map<number, string[]>();
const players = ['Player1', 'Player2', 'Player3'].map((username, i) => ({ username, uuid: `550e8400-e29b-41d4-a716-44665544000${i + 1}` }));
const consoleHistory = (id: number) => history.get(id) ?? D.getConsoleHistory();
function stats(id: number) {
  const online = D.getServer(id)?.status === 'online';
  return { cpu: online ? 23 : 0, ram: online ? 768 * 1024 * 1024 : 0, players: online ? 3 : 0, tps: online ? 20 : 0, startedAt: online ? started.get(id) : null, uptime: online ? Math.floor((Date.now() - (started.get(id) || Date.now())) / 1000) : 0, timezone: 'UTC' };
}
function broadcast(id: number) {
  for (const socket of sockets) if (socket.id === id) {
    socket.emit('status', D.getServer(id)?.status || 'offline');
    socket.emit('stats', stats(id));
  }
}
function catalog(items: any[], url: URL) {
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const filtered = items.filter(x => `${x.title || x.name} ${x.description}`.toLowerCase().includes(q));
  const offset = Number(url.searchParams.get('offset')) || 0;
  const limit = Number(url.searchParams.get('limit')) || 20;
  return { hits: filtered.slice(offset, offset + limit), totalHits: filtered.length, total: filtered.length };
}
const versions = [{ id: 'sample-version', name: 'Sample release', version_number: '2.20.1', date_published: '2024-11-01', game_versions: ['1.21.3'], loaders: ['paper'], compatible: true, files: [] }];
function project(id: string, items: any[]) {
  const p = items.find(x => x.project_id === id) || items[0];
  return { ...p, id: p.project_id, body: `# ${p.title}\n\n${p.description}\n\nThis is sample catalog data. Install MinePanel to browse live releases and install content.`, followers: 15000, categories: p.categories || [], gallery: [], links: [] };
}

// Explicit allowlist: reads and three lifecycle actions only. Unknown routes fail closed.
// No fetch, socket, credential, filesystem, or network fallback exists in this module.
export async function api(path: string, opts: RequestOptions = {}): Promise<any> {
  const url = new URL(path, 'https://demo.invalid');
  if (url.origin !== 'https://demo.invalid') return unavailable();
  const route = url.pathname;
  const method = (opts.method || 'GET').toUpperCase();
  const match = route.match(/^\/api\/servers\/(\d+)(\/.*)?$/);
  const id = match ? Number(match[1]) : 0;
  const sub = match?.[2] || '';
  if (method === 'POST' && id && ['/start', '/stop', '/restart'].includes(sub)) {
    if (!D.getServer(id)) return unavailable();
    const status = sub === '/stop' ? 'offline' : 'online';
    D.updateServer(id, { status });
    if (status === 'online') started.set(id, Date.now());
    broadcast(id);
    return { message: 'Demo server state updated locally.' };
  }
  if (method !== 'GET') return unavailable();
  if (route === '/api/users/me') return { user: D.getCurrentUser(), ...D.getCurrentUser() };
  if (route === '/api/auth/2fa/status') return { configured: false, enabled: false };
  if (route === '/api/users') return { users: D.getMockUsers(), isCallerManager: true };
  if (route === '/api/users/permissions') return D.getMockAllPermissions();
  if (/^\/api\/users\/\d+\/permissions$/.test(route)) return { rank: { id: 1 }, global: ['*'], servers: { '1': ['*'], '2': ['*'] } };
  if (route === '/api/ranks') return D.getMockRanks();
  if (route === '/api/servers' || route === '/api/discord/bots/servers') return D.getServers();
  if (route === '/api/system/versions') return D.getMockVersions();
  if (route === '/api/system/settings') return D.getMockSettings();
  if (route === '/api/system/metrics') return D.getMockMetrics();
  if (route === '/api/discord/bots') return D.getMockDiscordBots().map(b => ({ ...b, avatar: assetUrl('') }));
  if (route === '/api/docs') return docs;
  if (route === '/api/modpacks/search') return catalog(D.getMockModpacks(), url);
  if (route === '/api/modpacks/categories') return { categories: [['tech', 'Tech'], ['magic', 'Magic'], ['adventure', 'Adventure']] };
  if (route === '/api/modpacks/game-versions') return { versions: ['1.21.3', '1.21.1', '1.20.4'] };
  if (/^\/api\/modpacks\/project\/[^/]+\/versions$/.test(route)) return versions;
  if (/^\/api\/modpacks\/project\/[^/]+$/.test(route)) return project(route.split('/').pop()!, D.getMockModpacks());
  if (/^\/api\/modpacks\/version\/[^/]+\/contents$/.test(route)) return { mods: [], resource_packs: [], shaders: [] };
  if (!match || !D.getServer(id)) return unavailable();
  if (!sub) return D.getServer(id);
  if (sub === '/my-permissions') return { permissions: ['*', 'root'], admin: true };
  if (sub === '/properties') return D.getMockServerProperties(id);
  if (sub === '/stats') {
    const range = url.searchParams.get('range') || '1h';
    const duration = ({ '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 } as Record<string, number>)[range] || 3600000;
    const from = Math.max(started.get(id) || Date.now(), Date.now() - duration);
    return { timezone: 'UTC', data: Array.from({ length: 60 }, (_, i) => ({ t: from + (Date.now() - from) * i / 59, cpu_percent: 23 + Math.sin(i) * 4, ram_bytes: (768 + Math.sin(i / 4) * 80) * 1024 * 1024, tps: 20, players: 3 })) };
  }
  if (sub === '/files/list') return D.getMockFiles(url.searchParams.get('path') || '/');
  if (sub === '/files/read') return { content: D.getFileContent(url.searchParams.get('path') || '') ?? '# Binary sample file. Install MinePanel to access real files.' };
  if (sub === '/files/info') {
    const p = url.searchParams.get('path') || ''; const name = p.split('/').pop();
    const file = D.getMockFiles(p.slice(0, p.lastIndexOf('/')) || '/').find(f => f.name === name);
    return { ...file, path: p, modified: file?.modifiedAt, created: file?.modifiedAt, permissions: 'rw-r--r--' };
  }
  if (sub === '/files/archive-tree') return { archiveName: 'sample.zip', totalEntries: 2, entries: [{ name: 'world/', isDirectory: true, size: 0 }, { name: 'server.properties', isDirectory: false, size: 2450 }] };
  if (sub === '/backups') return D.getMockBackups();
  if (sub === '/backup-config') return { auto_backup: false, backup_interval: 24, backup_includes: 'all' };
  if (sub === '/logs') return [{ name: 'latest.log', size: 15600 }, { name: '2024-12-01-1.log', size: 3200 }];
  if (sub === '/logs/read') return { content: consoleHistory(id).filter(x => x.toLowerCase().includes((url.searchParams.get('filter') || '').toLowerCase())).join('\n'), page: 1, totalPages: 1 };
  if (sub === '/ftp') return { enabled: false, running: false, port: 2121, username: `demo_server_${id}`, host: 'demo.invalid' };
  if (sub === '/players/list') return players;
  if (sub === '/players/lists/whitelist') return players.slice(0, 2).map(p => ({ ...p, name: p.username }));
  if (sub === '/players/lists/ops') return [{ ...players[0], name: players[0].username, level: 4, bypassesPlayerLimit: false }];
  if (sub === '/players/lists/banned-players') return [{ name: 'GrieferJoe', uuid: '550e8400-e29b-41d4-a716-446655440004', reason: 'Griefing community builds', source: 'Admin', expires: 'forever' }];
  if (sub === '/players/lists/banned-ips') return [];
  if (/^\/players\/[^/]+$/.test(sub)) return { health: 20, food: 18, stats: { stats: { 'minecraft:custom': { 'minecraft:play_time': 4320000, 'minecraft:deaths': 5, 'minecraft:mob_kills': 150, 'minecraft:jump': 2500, 'minecraft:walk_one_cm': 1500000 }, 'minecraft:mined': { 'minecraft:stone': 450, 'minecraft:coal_ore': 85 } } }, advancements: { 'minecraft:story/mine_stone': { done: true } } };
  if (sub === '/plugins/installed') return D.getMockInstalledPlugins();
  if (sub === '/plugins/datapacks/installed') return [{ name: 'community-spawn.zip', size: 10240, modrinth: { projectId: 'community-spawn', versionNumber: '1.0' } }];
  if (/^\/plugins\/(modrinth|hangar|datapacks)\/search$/.test(sub)) return catalog(D.getMockModrinthPlugins().map(p => ({ ...p, owner: p.author, slug: p.project_id })), url);
  if (/^\/plugins\/(modrinth|hangar|datapacks)\/project\/.+\/versions$/.test(sub)) return versions;
  if (/^\/plugins\/(modrinth|hangar|datapacks)\/project\//.test(sub)) return project(sub.split('/').pop()!, D.getMockModrinthPlugins());
  if (sub === '/pocketmine/installed') return [];
  if (sub === '/pocketmine/search') return catalog(D.getMockPoggitPlugins(), url);
  if (/^\/pocketmine\/plugin\/[^/]+\/releases$/.test(sub)) return [];
  if (/^\/pocketmine\/plugin\/[^/]+$/.test(sub)) return D.getMockPoggitPlugins()[0];
  if (sub === '/automation') return { automationEnabled: false, rules: [{ id: 1, name: 'Scheduled announcement (example)', enabled: false, script: '# Example only. Execution requires MinePanel.\n# Announce community events from a scheduled rule.\n', created_at: '2024-12-01T12:00:00Z' }] };
  if (sub === '/start-command') return { auto_command: `java -Xms512M -Xmx${D.getServer(id)!.ram_mb}M -jar server.jar nogui`, custom_command: '' };
  if (sub === '/update/settings') return { auto_update_software: false, auto_update_content: false, force_incompatible_updates: false, auto_backup_before_update: true, ignored_plugins: [], update_interval_hours: 12, last_update_check: null, last_update_run: null, _updateState: { status: 'idle', message: null } };
  if (sub === '/api-keys') return [];
  return unavailable();
}

// Compile the installation's actual documentation into the demo, without a docs backend.
const docFiles = import.meta.glob('../../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const categoryOrder: Record<string, number> = { 'getting-started': 1, servers: 2, users: 3, discord: 4, advanced: 5 };
const docs = Object.entries(docFiles).map(([path, raw]) => {
  const slug = path.split('/docs/')[1].replace(/\.md$/, '');
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const meta = Object.fromEntries((block?.[1] || '').split('\n').filter(line => line.includes(':')).map(line => { const i = line.indexOf(':'); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
  const content = block ? raw.slice(block[0].length).trimStart() : raw;
  const category = meta.category || slug.split('/')[0];
  return { slug, category, title: meta.title || content.match(/^#\s+(.+)$/m)?.[1] || slug.split('/').pop(), content, order: Number(meta.order || 999), category_order: Number(meta.category_order || categoryOrder[category] || 999) };
}).sort((a, b) => a.category_order - b.category_order || a.category.localeCompare(b.category) || a.order - b.order);

// Small WebSocket-shaped local transport; preserves ServerLayout's event protocol.
class DemoSocket {
  readyState = 0;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  timer: ReturnType<typeof setTimeout>;
  ticker: ReturnType<typeof setInterval>;
  constructor(public id: number) {
    sockets.add(this);
    this.ticker = setInterval(() => this.emit('stats', stats(this.id)), 3000);
    this.timer = setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }
  emit(type: string, data: unknown) { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
  send(raw: string) {
    if (this.readyState !== 1) return;
    const msg = JSON.parse(raw);
    if (msg.type === 'auth') { this.emit('history', consoleHistory(this.id)); broadcast(this.id); return; }
    if (msg.type !== 'command' && msg.type !== 'chat') return;
    const cmd = String(msg.data).trim();
    const lower = cmd.toLowerCase();
    let reply = 'Try help, list, version, plugins, or say <message>. Other commands require a full MinePanel installation.';
    if (D.getServer(this.id)?.status !== 'online') reply = 'The demo server is offline. Use Start to simulate starting it.';
    else if (lower === 'help') reply = 'Local demo commands: help, list, version, plugins, say <message>.';
    else if (lower === 'list') reply = 'There are 3/20 players online: Player1, Player2, Player3';
    else if (lower === 'version') reply = `${D.getServer(this.id)?.software} ${D.getServer(this.id)?.version}`;
    else if (lower === 'plugins') reply = 'Plugins (3): EssentialsX, LuckPerms, CoreProtect';
    else if (msg.type === 'chat' || lower.startsWith('say ')) reply = `[Server] ${msg.type === 'chat' ? cmd : cmd.slice(4)}`;
    const line = `[Demo] ${reply}`;
    history.set(this.id, [...consoleHistory(this.id), `> ${cmd}`, line].slice(-200));
    // Asynchronous delivery preserves the UI's command-before-response order.
    queueMicrotask(() => this.emit('console', line));
  }
  close() { clearInterval(this.ticker); clearTimeout(this.timer); this.readyState = 3; sockets.delete(this); }
}
export const createServerSocket = (url: string) => new DemoSocket(Number(new URL(url).searchParams.get('serverId')));

export const allowBackendAction = () => { notifyUnavailable(); return false; };

