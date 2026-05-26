const { db, dbGet, dbAll } = require('../db/database');

const AVAILABLE_PERMISSIONS = [
    { key: 'server.start', label: 'Start Server', group: 'Server Control' },
    { key: 'server.stop', label: 'Stop Server', group: 'Server Control' },
    { key: 'server.restart', label: 'Restart Server', group: 'Server Control' },
    { key: 'server.kill', label: 'Force Kill Server', group: 'Server Control' },
    { key: 'server.console.read', label: 'View Console', group: 'Console' },
    { key: 'server.console.write', label: 'Send Commands', group: 'Console' },
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
    { key: 'server.ftp.access', label: 'FTP Access', group: 'FTP' },
    { key: 'server.ftp.manage', label: 'Manage FTP Settings', group: 'FTP' },
    { key: 'account.manage', label: 'Manage Accounts', group: 'Administration', globalOnly: true },
    { key: 'panel.settings', label: 'Manage Panel Settings', group: 'Administration', globalOnly: true }
];

async function getEffectivePermissions(userId, serverId) {
    const user = await dbGet('SELECT role, rank_id, global_permissions FROM users WHERE id = ?', [userId]);
    if (!user) return [];
    if (user.role === 'admin') return ['*'];

    const permSet = new Set();

    // 1. Add user's individual global permissions
    if (user.global_permissions) {
        try {
            JSON.parse(user.global_permissions).forEach(p => permSet.add(p));
        } catch (e) {}
    }

    // 2. Add user's rank permissions (if rank is assigned)
    if (user.rank_id) {
        const rank = await dbGet('SELECT permissions, global_permissions FROM ranks WHERE id = ?', [user.rank_id]);
        if (rank) {
            // Add rank global permissions
            if (rank.global_permissions) {
                try {
                    JSON.parse(rank.global_permissions).forEach(p => permSet.add(p));
                } catch (e) {}
            }
            // Add rank server-specific permissions
            if (rank.permissions && serverId) {
                try {
                    const serverMap = JSON.parse(rank.permissions);
                    const serverPerms = serverMap[serverId] || [];
                    serverPerms.forEach(p => permSet.add(p));
                } catch (e) {}
            }
        }
    }

    // 3. Add user's individual server-specific permissions (only if serverId is provided)
    if (serverId) {
        const individualPerms = await dbAll(
            'SELECT permission FROM user_server_permissions WHERE user_id = ? AND server_id = ?',
            [userId, serverId]
        );
        individualPerms.forEach(p => permSet.add(p.permission));
    }

    return [...permSet];
}

const checkPermission = (requiredPermission) => {
    return async (req, res, next) => {
        const userId = req.user.id;
        const serverId = req.params.serverId || req.body.serverId;

        if (!serverId) {
            return res.status(400).json({ error: 'Server ID is required' });
        }

        try {
            const perms = await getEffectivePermissions(userId, serverId);
            if (perms.includes('*') || perms.includes('root') || perms.includes(requiredPermission)) {
                return next();
            }
            res.status(403).json({ error: 'Forbidden: Missing permission ' + requiredPermission });
        } catch (e) {
            console.error(`[Permissions] checkPermission error (User: ${userId}, Server: ${serverId}):`, e);
            res.status(500).json({ error: 'Database error' });
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
            res.status(403).json({ error: 'Forbidden: Missing global permission ' + requiredPermission });
        } catch (e) {
            console.error(`[Permissions] checkGlobalPermission error (User: ${userId}):`, e);
            res.status(500).json({ error: 'Database error' });
        }
    };
};

module.exports = { checkPermission, hasPermission, checkGlobalPermission, getEffectivePermissions, AVAILABLE_PERMISSIONS };

