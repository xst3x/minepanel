// ── Central mock data store ──────────────────────────────────────────────────
// Recovered sample data used only by the local provider.

const KEYS = {
  user:           'mp_demo_user',
  servers:        'mp_demo_servers',
};

// Fixtures recovered from Git ba9b7b2^; state is isolated to this page lifetime.
const memory = new Map();
function ls(k, fallback) { return structuredClone(memory.has(k) ? memory.get(k) : fallback); }
function ss(k, v) { memory.set(k, structuredClone(v)); }

// ── Current user ─────────────────────────────────────────────────────────────
export function getCurrentUser() {
  return ls(KEYS.user, {
    id: 1,
    username: 'Admin',
    role: 'admin',
    globalPermissions: ['*', 'root', 'panel.settings'],
    created_at: '2024-01-15T10:00:00.000Z',
    disabled: false,
  });
}

// ── Servers ──────────────────────────────────────────────────────────────────

export function getServers() {
  return ls(KEYS.servers, getDefaultServers());
}

export function getServer(id) {
  return getServers().find(s => s.id === id) || null;
}

export function updateServer(id, patch) {
  const list = getServers();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  ss(KEYS.servers, list);
  return list[idx];
}

function getDefaultServers() {
  return [
    {
      id: 1,
      name: 'Survival World',
      software: 'paper',
      version: '1.21.3',
      status: 'online',
      port: 25565,
      ram_mb: 2048,
      java_path: 'java',
      log_retention_days: 7,
      backup_retention_days: 30,
      autostart: true,
      autostart_on_crash: true,
      created_at: '2024-06-01T12:00:00.000Z',
      icon: null,
      modpack_title: null,
      modpack_version: null,
    },
    {
      id: 2,
      name: 'Creative Build',
      software: 'purpur',
      version: '1.21.1',
      status: 'offline',
      port: 25566,
      ram_mb: 4096,
      java_path: 'java',
      log_retention_days: 7,
      backup_retention_days: 30,
      autostart: false,
      autostart_on_crash: false,
      created_at: '2024-07-15T08:00:00.000Z',
      icon: null,
      modpack_title: null,
      modpack_version: null,
    },
  ];
}

// ── Mock file system ─────────────────────────────────────────────────────────
export function getMockFiles(path) {
  const fs = getFileSystem();
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let node = fs;
  for (const p of parts) {
    if (node[p] && typeof node[p] === 'object' && !node[p]._meta) {
      node = node[p];
    } else {
      return [];
    }
  }
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node)
    .filter(([key]) => key !== '_meta' && !key.startsWith('.'))
    .map(([key, val]) => ({
      name: key,
      isDirectory: !val._meta,
      size: val._meta?.size || 0,
      modifiedAt: val._meta?.modified || new Date().toISOString(),
    }));
}

export function getFileContent(path) {
  const fs = getFileSystem();
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let node = fs;
  for (const p of parts) {
    if (node[p] && typeof node[p] === 'object') {
      node = node[p];
    } else {
      return null;
    }
  }
  return node?._meta?.content || null;
}

function getFileSystem() {
  let fs = ls(KEYS.servers + '_files', null);
  if (!fs) {
    fs = getDefaultFileSystem();
    ss(KEYS.servers + '_files', fs);
  }
  return fs;
}

function getDefaultFileSystem() {
  return {
    'server.properties': { _meta: { size: 2450, content: `#Minecraft server properties
motd=A Minecraft Server
server-port=25565
gamemode=survival
difficulty=easy
max-players=20
spawn-animals=true
spawn-monsters=true
pvp=true
online-mode=true
allow-flight=false
view-distance=10
simulation-distance=10
max-tick-time=60000
network-compression-threshold=256
max-world-size=29999984
enable-rcon=false
white-list=false
enforce-whitelist=false
`, modified: '2024-12-01T10:00:00.000Z' } },
    world: {
      'level.dat': { _meta: { size: 4520, content: '', modified: '2024-12-01T10:00:00.000Z' } },
      'region': {
        'r.0.0.mca': { _meta: { size: 10240, content: '', modified: '2024-12-01T10:00:00.000Z' } },
        'r.0.1.mca': { _meta: { size: 8192, content: '', modified: '2024-12-01T10:00:00.000Z' } },
      },
      'playerdata': {
        '00000000-0000-0000-0000-000000000001.dat': { _meta: { size: 1200, content: '', modified: '2024-12-01T10:00:00.000Z' } },
      },
    },
    plugins: {},
    logs: {
      'latest.log': { _meta: { size: 15600, content: generateFakeLogContent(200), modified: new Date().toISOString() } },
      'bluemap.log': { _meta: { size: 3200, content: '[Info] BlueMap initialized\n[Info] Map render complete\n', modified: '2024-12-01T10:00:00.000Z' } },
    },
    backups: {},
    'ops.json': { _meta: { size: 45, content: '[]\n', modified: '2024-12-01T10:00:00.000Z' } },
    'whitelist.json': { _meta: { size: 45, content: '[]\n', modified: '2024-12-01T10:00:00.000Z' } },
    'banned-players.json': { _meta: { size: 45, content: '[]\n', modified: '2024-12-01T10:00:00.000Z' } },
    'banned-ips.json': { _meta: { size: 45, content: '[]\n', modified: '2024-12-01T10:00:00.000Z' } },
    'bukkit.yml': { _meta: { size: 890, content: 'settings:\n  allow-end: true\n  warn-on-overload: true\n  permissions-file: permissions.yml\n  update-folder: update\n  ping-packet-limit: 100\n  use-exact-login-location: false\n  plugin-profiling: false\n  connection-throttle: 4000\n  query-plugins: true\n  deprecated-verbose: default\n  shutdown-message: Server closed\n', modified: '2024-12-01T10:00:00.000Z' } },
    'commands.yml': { _meta: { size: 320, content: 'command-block-overrides: []\nalias-overrides: []\n', modified: '2024-12-01T10:00:00.000Z' } },
    'permissions.yml': { _meta: { size: 45, content: '# permissions\n', modified: '2024-12-01T10:00:00.000Z' } },
  };
}

function generateFakeLogContent(lines) {
  const levels = ['INFO', 'WARN', 'INFO', 'INFO', 'ERROR', 'INFO', 'INFO'];
  const messages = [
    '[paper] Loaded 248 recipes',
    '[paper] Loaded 108 advancements',
    '[paper] Starting Minecraft server on *:25565',
    '[paper] Preparing spawn area: 75%',
    '[paper] Done! For help, type "help" or "?"',
    '[paper] UUID of host 00000000-0000-0000-0000-000000000001 is 00000000-0000-0000-0000-000000000001',
    '[BlueMap] BlueMap 3.21 initialized',
    '[paper] Player1 joined the game',
    '[paper] Player2 lost connection: Timed out',
    '[paper] ExperienceHelper: Loaded 15 custom advancements',
    '[paper] Thread RCON Client /127.0.0.1: opened',
    '[paper] Done loading spigot permissions',
    '[paper] CONSOLE: save-all',
    '[paper] Save complete',
  ];
  const out = [];
  const base = Date.now() - lines * 60000;
  for (let i = 0; i < lines; i++) {
    const d = new Date(base + i * 60000);
    const ts = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    const level = levels[Math.floor(Math.random() * levels.length)];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    out.push(`[${ts}] [${level}] ${msg}`);
  }
  return out.join('\n');
}

// ── Mock backups ─────────────────────────────────────────────────────────────
export function getMockBackups() {
  return [
    { name: 'backup-20241201.zip', size: 52428800, date: '2024-12-01T03:00:00.000Z' },
    { name: 'backup-20241130.zip', size: 51904512, date: '2024-11-30T03:00:00.000Z' },
    { name: 'backup-20241129.zip', size: 49807360, date: '2024-11-29T03:00:00.000Z' },
  ];
}

// ── Mock metrics generator ───────────────────────────────────────────────────
let mockCpu = 23;
let mockRam = 512;
export function getMockMetrics() {
  mockCpu = Math.max(0, Math.min(100, mockCpu + (Math.random() - 0.5) * 8));
  mockRam = Math.max(128, Math.min(4096, mockRam + (Math.random() - 0.5) * 128));
  return {
    cpu: { usage: mockCpu, temp: Math.round(45 + Math.random() * 15) },
    memory: { usedPercentage: Math.round((mockRam / 2048) * 100) },
  };
}

// ── Mock console output generator ────────────────────────────────────────────
let consoleLogs = [
  '[Panel] Server initialized.',
  '[Panel] Waiting for commands...',
  '[Server] Starting Minecraft server on *:25565',
  '[Server] Loading world...',
  '[Server] Loaded 248 recipes',
  '[Server] Loaded 108 advancements',
  '[Server] Done! For help, type "help" or "?"',
];
export function getConsoleHistory() {
  return [...consoleLogs];
}

// ── Mock installed plugins ───────────────────────────────────────────────────
export function getMockInstalledPlugins() {
  return [
    { name: 'EssentialsX-2.20.1.jar', size: 524288, modrinth: { projectId: 'essential', versionNumber: '2.20.1', versionId: 'v1' } },
    { name: 'LuckPerms-5.4.131.jar', size: 389120, modrinth: { projectId: 'luckperms', versionNumber: '5.4.131', versionId: 'v2' } },
    { name: 'CoreProtect-22.3.jar', size: 245760, modrinth: { projectId: 'coreprotect', versionNumber: '22.3', versionId: 'v3' } },
  ];
}

// ── Mock Modrinth plugins list ──────────────────────────────────────────────
export function getMockModrinthPlugins() {
  return [
    { project_id: 'essential', title: 'EssentialsX', author: 'EssentialsX Team', description: 'The essential server-side mod for Minecraft servers.', downloads: 5200000, icon_url: null, categories: ['utility'], project_type: 'plugin', game_versions: ['1.21', '1.20.4', '1.20'], loaders: ['paper', 'purpur'] },
    { project_id: 'luckperms', title: 'LuckPerms', author: 'Luck', description: 'A permissions plugin for Minecraft servers.', downloads: 4800000, icon_url: null, categories: ['utility'], project_type: 'plugin', game_versions: ['1.21', '1.20.4', '1.20'], loaders: ['paper', 'purpur', 'sponge'] },
    { project_id: 'coreprotect', title: 'CoreProtect', author: 'PlayLegend', description: 'Block and entity logging for grief prevention.', downloads: 3200000, icon_url: null, categories: ['utility'], project_type: 'plugin', game_versions: ['1.21', '1.20.4', '1.20'], loaders: ['paper', 'purpur'] },
    { project_id: 'worldedit', title: 'WorldEdit', author: 'EngineHub', description: 'A voxel editor for Minecraft.', downloads: 8500000, icon_url: null, categories: ['utility'], project_type: 'plugin', game_versions: ['1.21', '1.20.4', '1.20'], loaders: ['paper', 'purpur', 'sponge'] },
    { project_id: 'vault', title: 'Vault', author: 'MilkBowl', description: 'A permission/economy API for Bukkit plugins.', downloads: 6200000, icon_url: null, categories: ['utility'], project_type: 'plugin', game_versions: ['1.21', '1.20.4', '1.20'], loaders: ['paper', 'purpur'] },
    { project_id: 'placeholderapi', title: 'PlaceholderAPI', author: 'HelpChat', description: 'A placeholder expansion system for Minecraft.', downloads: 4100000, icon_url: null, categories: ['utility'], project_type: 'plugin', game_versions: ['1.21', '1.20.4', '1.20'], loaders: ['paper', 'purpur'] },
  ];
}

// ── Mock Discord bots ────────────────────────────────────────────────────────
export function getMockDiscordBots() {
  return [
    { id: 1, username: 'MinePanel Bot', avatar: null, guildId: '123456789012345678', serverIds: [1, 2], enabled: true, online: true, createdAt: '2024-10-01T12:00:00.000Z' },
  ];
}

// ── Mock panel settings ──────────────────────────────────────────────────────
export function getMockSettings() {
  return {
    loginCooldown: 60,
    maxAttempts: 5,
    rateLimit: 100,
    defaultRam: 2048,
    defaultPort: 25565,
    maxRam: 16384,
    ftpPort: 2121,
    ftpEnabled: false,
    requireInviteTokenToCreateAccount: true,
    defaultRankId: null,
    defaultJavaPath: 'java',
  };
}

// ── Mock users ───────────────────────────────────────────────────────────────
export function getMockUsers() {
  return [
    { id: 1, username: 'Admin', role: 'admin', rank_name: 'Owner', rank_color: '#f59e0b', disabled: false, created_at: '2024-01-15T10:00:00.000Z' },
    { id: 2, username: 'Moderator', role: 'mod', rank_name: 'Moderator', rank_color: '#3b82f6', disabled: false, created_at: '2024-03-20T14:00:00.000Z' },
    { id: 3, username: 'Builder', role: 'member', rank_name: null, rank_color: null, disabled: false, created_at: '2024-06-10T09:00:00.000Z' },
  ];
}

// ── Mock ranks ───────────────────────────────────────────────────────────────
export function getMockRanks() {
  return [
    { id: 1, name: 'Owner', color: '#f59e0b', is_builtin: true, global_permissions: ['*', 'root', 'panel.settings'], permissions: { '1': ['*'], '2': ['*'] } },
    { id: 2, name: 'Admin', color: '#ef4444', is_builtin: false, global_permissions: ['panel.settings', 'account.manage'], permissions: { '1': ['*'], '2': ['*'] } },
    { id: 3, name: 'Moderator', color: '#3b82f6', is_builtin: false, global_permissions: [], permissions: { '1': ['server.console.send', 'server.players.read'], '2': ['server.console.send'] } },
  ];
}

// ── Mock permissions list ────────────────────────────────────────────────────
export function getMockAllPermissions() {
  return [
    { key: 'server.start', label: 'Start Server', group: 'Server', globalOnly: false },
    { key: 'server.stop', label: 'Stop Server', group: 'Server', globalOnly: false },
    { key: 'server.console.read', label: 'Read Console', group: 'Server', globalOnly: false },
    { key: 'server.console.send', label: 'Send Console Commands', group: 'Server', globalOnly: false },
    { key: 'server.players.read', label: 'Read Player Data', group: 'Players', globalOnly: false },
    { key: 'server.players.manage', label: 'Manage Players', group: 'Players', globalOnly: false },
    { key: 'server.files.read', label: 'Read Files', group: 'Files', globalOnly: false },
    { key: 'server.files.edit', label: 'Edit Files', group: 'Files', globalOnly: false },
    { key: 'server.plugins.read', label: 'Read Plugins', group: 'Plugins', globalOnly: false },
    { key: 'server.properties.read', label: 'Read Properties', group: 'Properties', globalOnly: false },
    { key: 'server.properties.write', label: 'Write Properties', group: 'Properties', globalOnly: false },
    { key: 'server.backups.read', label: 'Read Backups', group: 'Backups', globalOnly: false },
    { key: 'server.backups.write', label: 'Manage Backups', group: 'Backups', globalOnly: false },
    { key: 'server.logs.read', label: 'Read Logs', group: 'Logs', globalOnly: false },
    { key: 'server.ftp.access', label: 'FTP Access', group: 'FTP', globalOnly: false },
    { key: 'server.ftp.manage', label: 'Manage FTP', group: 'FTP', globalOnly: false },
    { key: 'server.automation.read', label: 'Read Automations', group: 'Automation', globalOnly: false },
    { key: 'server.automation.write', label: 'Write Automations', group: 'Automation', globalOnly: false },
    { key: 'account.manage', label: 'Account Management', group: 'Account', globalOnly: true },
    { key: 'panel.settings', label: 'Panel Settings', group: 'Account', globalOnly: true },
  ];
}

// ── Mock Poggit plugins ──────────────────────────────────────────────────────
export function getMockPoggitPlugins() {
  return [
    { name: 'PurePerms', mainAuthor: '64FF00', description: 'A powerful permissions plugin for PocketMine-MP', downloads: 150000, version: '1.4.0', icon: null },
    { name: 'EasyEconomy', mainAuthor: 'EcoDev', description: 'Simple and lightweight economy system for PMMP', downloads: 85000, version: '2.1.0', icon: null },
    { name: 'SimpleAuth', mainAuthor: 'AuthTeam', description: 'Authentication system for PocketMine-MP', downloads: 120000, version: '3.0.1', icon: null },
  ];
}

// ── Mock modpacks ────────────────────────────────────────────────────────────
export function getMockModpacks() {
  return [
    { project_id: 'pack1', title: 'All the Mods 9', author: 'ATM Team', description: 'A massive modpack with over 300 mods.', downloads: 3200000, icon_url: null },
    { project_id: 'pack2', title: 'Enigmatica 10', author: 'Enigmatica Team', description: 'Expert questing modpack.', downloads: 2100000, icon_url: null },
    { project_id: 'pack3', title: 'FTB Academy', author: 'FTB Team', description: 'Learn Minecraft modding.', downloads: 1800000, icon_url: null },
    { project_id: 'pack4', title: 'RLCraft', author: 'Shivaxi', description: 'A brutal survival modpack.', downloads: 4500000, icon_url: null },
  ];
}

// ── Mock server info by id ───────────────────────────────────────────────────
export function getMockServerProperties(id) {
  return {
    'motd': '&aWelcome to &6MinePanel Demo Server!',
    'server-port': '25565',
    'gamemode': 'survival',
    'difficulty': 'easy',
    'max-players': '20',
    'spawn-animals': 'true',
    'spawn-monsters': 'true',
    'pvp': 'true',
    'online-mode': 'true',
    'allow-flight': 'false',
    'view-distance': '10',
    'simulation-distance': '10',
    'max-tick-time': '60000',
    'network-compression-threshold': '256',
    'max-world-size': '29999984',
    'enable-rcon': 'false',
    'white-list': 'false',
    'enforce-whitelist': 'false',
    'spawn-protection': '16',
    'hardcore': 'false',
    'sync-chunk-writes': 'true',
    'entity-broadcast-range-percentage': '100',
    'player-idle-timeout': '0',
    'allow-nether': 'true',
    'generate-structures': 'true',
  };
}

// ── Mock software version map ────────────────────────────────────────────────
export function getMockVersions() {
  return {
    'paper': ['1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4'],
    'vanilla': ['1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1'],
    'vanilla-snapshot': ['1.21.4-wa', '1.21.3', '1.21.2-wp'],
    'purpur': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'fabric': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'forge': ['1.21.1', '1.20.4', '1.20.1', '1.19.4'],
    'neoforge': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'quilt': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'folia': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'velocity': ['3.4.0', '3.3.2', '3.3.1', '3.3.0'],
    'waterfall': ['1.21', '1.20', '1.19'],
    'spongevanilla': ['1.21.1', '1.20.4'],
    'magma': ['1.21.1', '1.20.4', '1.20.1'],
    'mohist': ['1.21.1', '1.20.4', '1.20.1', '1.19.4'],
    'arclight': ['1.21.1', '1.20.4', '1.20.1'],
    'leaves': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'pufferfish': ['1.21.3', '1.21.1', '1.20.6', '1.20.4'],
    'bedrock': ['1.21.60', '1.21.50', '1.21.40', '1.21.30'],
    'bedrock-preview': ['1.21.70', '1.21.60'],
    'pocketmine': ['5.20.0', '5.19.0', '5.18.0', '5.17.0', '5.16.0'],
  };
}
