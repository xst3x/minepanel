"use strict";
const database_1 = require("../db/database");
const { E, sendError } = require('./errors');
const AVAILABLE_PERMISSIONS = [
    { key: 'server.start', label: 'Start Server', group: 'Server Control' },
    { key: 'server.stop', label: 'Stop Server', group: 'Server Control' },
    { key: 'server.restart', label: 'Restart Server', group: 'Server Control' },
    { key: 'server.kill', label: 'Force Kill Server', group: 'Server Control' },
    { key: 'server.console.read', label: 'View Console', group: 'Console' },
    { key: 'server.console.write', label: 'Send Commands', group: 'Console' },
    { key: 'server.console.chat.view', label: 'View Server Chat', group: 'Console' },
    { key: 'server.console.chat.send', label: 'Send Chat Messages', group: 'Console' },
    { key: 'server.files.read', label: 'View Files', group: 'File Management' },
    { key: 'server.files.write', label: 'Edit Files', group: 'File Management' },
    { key: 'server.files.delete', label: 'Delete Files', group: 'File Management' },
    { key: 'server.players.read', label: 'View Players', group: 'Player Management' },
    { key: 'server.players.kick', label: 'Kick Players', group: 'Player Management' },
    { key: 'server.players.ban', label: 'Ban Players', group: 'Player Management' },
    { key: 'server.players.op', label: 'OP Players', group: 'Player Management' },
    { key: 'server.players.manage', label: 'Manage Players (Commands)', group: 'Player Management' },
    { key: 'server.plugins.read', label: 'View Plugins', group: 'Plugins' },
    { key: 'server.plugins.manage', label: 'Manage Plugins', group: 'Plugins' },
    { key: 'server.backups.read', label: 'View Backups', group: 'Backups' },
    { key: 'server.backups.create', label: 'Create Backups', group: 'Backups' },
    { key: 'server.backups.restore', label: 'Restore Backups', group: 'Backups' },
    { key: 'server.backups.delete', label: 'Delete Backups', group: 'Backups' },
    { key: 'server.properties.read', label: 'View Server Settings', group: 'Settings & Logs' },
    { key: 'server.properties.write', label: 'Edit Server Settings', group: 'Settings & Logs' },
    { key: 'server.logs.read', label: 'View Logs', group: 'Settings & Logs' },
    { key: 'server.stats.read', label: 'View Statistics', group: 'Statistics' },
    { key: 'server.ftp.access', label: 'FTP Access', group: 'FTP' },
    { key: 'server.ftp.manage', label: 'Manage FTP Settings', group: 'FTP' },
    { key: 'server.automation.read', label: 'View Automation Rules', group: 'Automation' },
    { key: 'server.automation.write', label: 'Create / Edit Automation Rules', group: 'Automation' },
    { key: 'account.manage', label: 'Manage Accounts', group: 'Administration', globalOnly: true },
    { key: 'panel.settings', label: 'Manage Panel Settings', group: 'Administration', globalOnly: true },
    { key: 'mcp.manage', label: 'Manage MCP Servers', group: 'Administration', globalOnly: true }
];
async function getEffectivePermissions(userId, serverId) {
    if (typeof userId === 'string' && userId.startsWith('mcp:')) {
        const identity = await (0, database_1.dbGet)('SELECT rank_id, overrides, allowed_servers, enabled FROM mcp_identities WHERE id = ?', [userId.slice(4)]);
        if (!identity || !identity.enabled)
            return [];
        if (serverId && !JSON.parse(identity.allowed_servers).includes(String(serverId)))
            return [];
        const rank = identity.rank_id ? await (0, database_1.dbGet)('SELECT permissions, global_permissions FROM ranks WHERE id = ?', [identity.rank_id]) : null;
        const base = permissionsFromRank(rank, serverId);
        const overrides = JSON.parse(identity.overrides);
        // Expand wildcards before applying explicit denials. No admin role bypass for MCP.
        const expanded = new Set(base.includes('*') || base.includes('root')
            ? [...AVAILABLE_PERMISSIONS.map(p => p.key), 'server.create', 'server.plugins.install'] : base);
        for (const [permission, granted] of Object.entries(overrides)) {
            if (granted)
                expanded.add(permission);
            else
                expanded.delete(permission);
        }
        // Control-plane administration belongs to interactive panel users only.
        expanded.delete('mcp.manage');
        return [...expanded];
    }
    const user = await (0, database_1.dbGet)('SELECT role, rank_id, global_permissions FROM users WHERE id = ?', [userId]);
    if (!user)
        return [];
    if (user.role === 'admin')
        return ['*'];
    const permSet = new Set();
    if (user.global_permissions) {
        try {
            JSON.parse(user.global_permissions).forEach(p => permSet.add(p));
        }
        catch (e) { }
    }
    if (user.rank_id) {
        const rank = await (0, database_1.dbGet)('SELECT permissions, global_permissions FROM ranks WHERE id = ?', [user.rank_id]);
        permissionsFromRank(rank, serverId).forEach(p => permSet.add(p));
    }
    if (serverId) {
        const individualPerms = await (0, database_1.dbAll)('SELECT permission FROM user_server_permissions WHERE user_id = ? AND server_id = ?', [userId, serverId]);
        individualPerms.forEach(p => permSet.add(p.permission));
    }
    return [...permSet];
}
function permissionsFromRank(rank, serverId) {
    const permissions = new Set();
    if (!rank)
        return [];
    try {
        JSON.parse(rank.global_permissions || '[]').forEach(p => permissions.add(p));
    }
    catch (_) { }
    if (serverId) {
        try {
            (JSON.parse(rank.permissions || '{}')[serverId] || []).forEach(p => permissions.add(p));
        }
        catch (_) { }
    }
    return [...permissions];
}
const checkPermission = (requiredPermission) => {
    return async (req, res, next) => {
        const userId = req.user.id;
        const serverId = req.params.serverId || req.body.serverId;
        if (!serverId) {
            return sendError(res, E.BAD_REQUEST, 400, 'Server ID is required');
        }
        try {
            if (req.user && req.user.internal === true) {
                return next();
            }
            const perms = await getEffectivePermissions(userId, serverId);
            if (perms.includes('*') || perms.includes('root') || perms.includes(requiredPermission)) {
                return next();
            }
            return sendError(res, E.FORBIDDEN, 403, `Missing permission: ${requiredPermission}`);
        }
        catch (e) {
            console.error(`[Permissions] checkPermission error (User: ${userId}, Server: ${serverId}):`, e);
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    };
};
const hasPermission = async (userId, serverId, requiredPermission) => {
    const perms = await getEffectivePermissions(userId, serverId);
    return perms.includes('*') || perms.includes('root') || perms.includes(requiredPermission);
};
const checkGlobalPermission = (requiredPermission) => {
    return async (req, res, next) => {
        const userId = req.user.id;
        try {
            const perms = await getEffectivePermissions(userId, null);
            if (perms.includes('*') || perms.includes('root') || perms.includes(requiredPermission)) {
                return next();
            }
            return sendError(res, E.FORBIDDEN, 403, `Missing global permission: ${requiredPermission}`);
        }
        catch (e) {
            console.error(`[Permissions] checkGlobalPermission error (User: ${userId}):`, e);
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    };
};
module.exports = { checkPermission, hasPermission, checkGlobalPermission, getEffectivePermissions, AVAILABLE_PERMISSIONS };
//# sourceMappingURL=permissions.js.map