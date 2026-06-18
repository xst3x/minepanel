// src/middleware/validators.js
// Centralized Joi schemas for all route inputs.
// Usage: router.post('/route', validate(V.login), handler)

const Joi = require('joi');

// ─── Reusable primitives ─────────────────────────────────────────────────────

const username = Joi.string().trim().min(3).max(32).pattern(/^[a-zA-Z0-9_-]+$/).message('Username may only contain letters, numbers, underscores, and hyphens').required();
const password = Joi.string().min(6).max(128).pattern(/[0-9]/).message('Password must be at least 6 characters and contain at least one number').required();
const port     = Joi.number().integer().min(1024).max(65535).required();
const ram      = Joi.number().integer().min(512).max(16384).required();

// ─── Auth ────────────────────────────────────────────────────────────────────

const login = Joi.object({
    username: Joi.string().trim().min(1).max(64).required(),
    password: Joi.string().min(1).max(128).required(),
    totpCode: Joi.string().max(8).optional().allow('', null),
});

const register = Joi.object({
    username,
    password,
    confirmPassword: Joi.string().required(),
    token: Joi.string().optional().allow('', null),
});

// ─── User management ─────────────────────────────────────────────────────────

const createUser = Joi.object({
    username,
    password,
});

const changeName = Joi.object({
    currentName: Joi.string().trim().min(1).max(64).required(),
    newName: username,
    confirmNewName: Joi.string().trim().required(),
});

const adminChangeName = Joi.object({
    newName: username,
    confirmNewName: Joi.string().required(),
});

const changePassword = Joi.object({
    oldPassword: Joi.string().min(1).max(128).required(),
    newPassword: password,
    newPasswordConfirm: Joi.string().required(),
});

const resetPassword = Joi.object({
    newPassword: password,
    confirmPassword: Joi.string().required(),
});

const generateToken = Joi.object({
    permissions: Joi.array().items(Joi.string()).required(),
    ranks: Joi.array().items(Joi.number().integer()).required(),
});

// ─── Server ──────────────────────────────────────────────────────────────────

const SOFTWARE_VALUES = ['vanilla', 'snapshots', 'paper', 'purpur', 'fabric', 'forge', 'quilt', 'magma', 'spigot', 'bungeecord', 'waterfall', 'velocity', 'bedrock', 'bedrock-preview', 'pocketmine', 'nukkitx', 'powernukkitx', 'waterdogpe'];

const createServer = Joi.object({
    name:     Joi.string().min(1).max(64).required(),
    software: Joi.string().trim().lowercase().valid(...SOFTWARE_VALUES).required(),
    version:  Joi.string().min(1).max(32).required(),
    ram_mb:   ram,
    port,
});

const serverSettings = Joi.object({
    name:                 Joi.string().min(1).max(64).required(),
    port,
    ram_mb:               ram,
    java_path:            Joi.string().min(1).max(512).default('java'),
    log_retention_days:   Joi.number().integer().min(0).max(3650).default(30),
    backup_retention_days: Joi.number().integer().min(0).max(3650).default(7),
    autostart:            Joi.boolean().optional(),
    autostart_on_crash:   Joi.boolean().optional(),
});

const changeVersion = Joi.object({
    version: Joi.string().min(1).max(32).required(),
});

const switchSoftware = Joi.object({
    software: Joi.string().trim().lowercase().valid(...SOFTWARE_VALUES).required(),
    version:  Joi.string().min(1).max(32).required(),
    confirm:  Joi.boolean().optional(),
});

const backupConfig = Joi.object({
    enabled:  Joi.boolean().required(),
    interval: Joi.number().integer().min(1).max(168).default(24),
    includes: Joi.string().valid('all', 'world', 'plugins', 'config').default('all'),
});

const sendCommand = Joi.object({
    command: Joi.string().min(1).max(256).required(),
});

// ─── File operations ─────────────────────────────────────────────────────────

const filePath = Joi.object({
    path: Joi.string().min(1).max(2048).required(),
});

const fileWrite = Joi.object({
    path:    Joi.string().min(1).max(2048).required(),
    content: Joi.string().allow('').max(10 * 1024 * 1024).required(), // 10 MB text cap
});

const fileRename = Joi.object({
    oldPath: Joi.string().min(1).max(2048).required(),
    newName: Joi.string().min(1).max(255).required(),
});

const fileMove = Joi.object({
    sourcePath: Joi.string().min(1).max(2048).required(),
    destPath:   Joi.string().min(1).max(2048).required(),
});

const mkdir = Joi.object({
    path: Joi.string().min(1).max(2048).required(),
    name: Joi.string().min(1).max(255).required(),
});

// ─── Rank ────────────────────────────────────────────────────────────────────

const createRank = Joi.object({
    name:  Joi.string().min(2).max(32).required(),
    color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
});

const updateRank = Joi.object({
    name:    Joi.string().min(2).max(32).required(),
    color:   Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
    global:  Joi.array().items(Joi.string()).required(),
    servers: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.string())).required(),
});

// ─── System ──────────────────────────────────────────────────────────────────

const panelSettings = Joi.object({
    loginCooldown:                    Joi.number().integer().min(0).max(3600).optional(),
    maxAttempts:                      Joi.number().integer().min(1).max(100).optional(),
    rateLimit:                        Joi.number().integer().min(1).max(10000).optional(),
    ftpPort:                          Joi.number().integer().min(1024).max(65535).optional(),
    ftpEnabled:                       Joi.boolean().optional(),
    defaultRam:                       Joi.number().integer().min(512).max(16384).optional(),
    defaultPort:                      Joi.number().integer().min(1024).max(65535).optional(),
    maxRam:                           Joi.number().integer().min(512).max(65536).optional(),
    requireInviteTokenToCreateAccount: Joi.boolean().optional(),
    defaultRankId: Joi.number().integer().allow(null).optional(),
}).min(1);

const changePort = Joi.object({
    port: Joi.number().integer().min(1).max(65535).required(),
});

// ─── File operations (body-based routes) ─────────────────────────────────────

const fileDelete = Joi.object({
    path: Joi.string().min(1).max(2048).required(),
});

const fileCreate = Joi.object({
    path: Joi.string().min(1).max(2048).required(),
});

const mkdirSimple = Joi.object({
    path: Joi.string().min(1).max(2048).required(),
});

const fileRenameBody = Joi.object({
    oldPath: Joi.string().min(1).max(2048).required(),
    newPath: Joi.string().min(1).max(2048).required(),
});

// ─── User rank assignment ─────────────────────────────────────────────────────

const setUserRank = Joi.object({
    rankId: Joi.number().integer().positive().allow(null).required(),
});

// ─── User accent color ────────────────────────────────────────────────────────

const accentColor = Joi.object({
    accent: Joi.string()
        .pattern(/^(#[0-9a-fA-F]{6}|hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\))$/)
        .required(),
});

// ─── Custom accent creation ─────────────────────────────────────────────────────
const customAccentCreate = Joi.object({
    label: Joi.string().min(1).max(32).required(),
    value: Joi.string().pattern(/^hsl\(\d+,\d+%,\d+%\)$/).required(),
});

// ─── User permissions ─────────────────────────────────────────────────────────

const userPermissions = Joi.object({
    global:  Joi.array().items(Joi.string()).required(),
    servers: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.string())).required(),
});

// ─── FTP ─────────────────────────────────────────────────────────────────────

const ftpConfig = Joi.object({
    username: Joi.string().min(1).max(64).required(),
    password: Joi.string().min(8).max(128).optional().allow(''),
    port:     Joi.number().integer().min(1024).max(65535).required(),
});

// ─── Discord ─────────────────────────────────────────────────────────────────

const discordConnect = Joi.object({
    botToken: Joi.string().min(1).max(100).required(),
    guildId:  Joi.string().pattern(/^\d{17,20}$/).message('guildId must be a valid Discord snowflake (17-20 digits)').required(),
});

const discordToggle = Joi.object({
    enabled: Joi.boolean().required(),
});

const discordValidateToken = Joi.object({
    botToken: Joi.string().min(1).max(100).required(),
});

// ─── Threshold ───────────────────────────────────────────────────────────────

const thresholdAdd = Joi.object({
    value:   Joi.number().required(),
    action:  Joi.string().min(1).max(64).required(),
    label:   Joi.string().max(50).optional().allow(''),
    enabled: Joi.boolean().optional(),
});

const thresholdPatch = Joi.object({
    value:   Joi.number().optional(),
    action:  Joi.string().min(1).max(64).optional(),
    label:   Joi.string().max(50).optional().allow(''),
    enabled: Joi.boolean().optional(),
}).min(1);

const thresholdToggle = Joi.object({
    enabled: Joi.boolean().optional(),
});

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
    // Auth
    login, register,
    // Users
    createUser, changeName, adminChangeName, changePassword, resetPassword, generateToken,
    accentColor, customAccentCreate, setUserRank, userPermissions,
    // Server
    createServer, serverSettings, changeVersion, switchSoftware, backupConfig, sendCommand,
    // Files
    filePath, fileWrite, fileRename, fileMove, mkdir,
    fileDelete, fileCreate, mkdirSimple, fileRenameBody,
    // Ranks
    createRank, updateRank,
    // System
    panelSettings, changePort,
    // FTP
    ftpConfig,
    // Discord
    discordConnect, discordToggle, discordValidateToken,
    // Threshold
    thresholdAdd, thresholdPatch, thresholdToggle,
};
