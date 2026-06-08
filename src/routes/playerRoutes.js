const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const zlib = require('zlib');
const Joi = require('joi');
const { validate } = require('../middleware/validation');
const path = require('path');
const crypto = require('crypto');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const processManager = require('../core/processManager');
const executionManager = require('../core/executionManager');
const { getServer, getServerDir } = require('../core/serverHelper');
const { E, sendError } = require('../core/errors');
const logger = require('../core/utils/logger');

const router = express.Router({ mergeParams: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadUsercache = (serverDir) => {
    const cachePath = path.join(serverDir, 'usercache.json');
    try {
        if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {}
    return [];
};

const resolveUsername = (usercache, uuid) => {
    const dashed = uuid.replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, '$1-$2-$3-$4-$5');
    const entry = usercache.find(e => e.uuid === dashed || e.uuid === uuid);
    return entry ? entry.name : null;
};

function getOnlinePlayerNames(serverId) {
    const history = processManager.getHistory(serverId.toString());
    const lines = history.flatMap(chunk => chunk.split(/\r?\n/));
    const onlineSet = new Set();
    for (const line of lines) {
        const joinMatch = line.match(/(?:\[[0-9:]+\]\s+)?(?:\[[^\]]+\]:\s+)?(\S+)\s+joined\s+the\s+game/i);
        if (joinMatch) { onlineSet.add(joinMatch[1]); continue; }
        const leaveMatch = line.match(/(?:\[[0-9:]+\]\s+)?(?:\[[^\]]+\]:\s+)?(\S+)\s+left\s+the\s+game/i);
        if (leaveMatch) { onlineSet.delete(leaveMatch[1]); continue; }
        const kickMatch = line.match(/(?:\[[0-9:]+\]\s+)?(?:\[[^\]]+\]:\s+)?(\S+)\s+was\s+kicked/i);
        if (kickMatch) { onlineSet.delete(kickMatch[1]); continue; }
    }
    return Array.from(onlineSet);
}

// ─── Minimal NBT reader for health + food ────────────────────────────────────
// Reads only the Float tags named "Health" and the Int tag named "foodLevel"
// from a gzipped NBT playerdata .dat file without any external library.

async function readPlayerVitals(datPath) {
    try {
        const compressed = await fsp.readFile(datPath);
        const buf = await new Promise((resolve, reject) => {
            zlib.gunzip(compressed, (err, result) => err ? reject(err) : resolve(result));
        });

        let health = null;
        let food   = null;
        let i      = 0;

        // NBT tag type IDs
        const TAG_END       = 0;
        const TAG_BYTE      = 1;
        const TAG_SHORT     = 2;
        const TAG_INT       = 3;
        const TAG_LONG      = 4;
        const TAG_FLOAT     = 5;
        const TAG_DOUBLE    = 6;
        const TAG_BYTE_ARR  = 7;
        const TAG_STRING    = 8;
        const TAG_LIST      = 9;
        const TAG_COMPOUND  = 10;
        const TAG_INT_ARR   = 11;
        const TAG_LONG_ARR  = 12;

        const readName = () => {
            const len = buf.readUInt16BE(i); i += 2;
            const name = buf.slice(i, i + len).toString('utf8'); i += len;
            return name;
        };

        const skipPayload = (type) => {
            if (type === TAG_BYTE)     { i += 1; }
            else if (type === TAG_SHORT)    { i += 2; }
            else if (type === TAG_INT)      { i += 4; }
            else if (type === TAG_LONG)     { i += 8; }
            else if (type === TAG_FLOAT)    { i += 4; }
            else if (type === TAG_DOUBLE)   { i += 8; }
            else if (type === TAG_BYTE_ARR) { const len = buf.readInt32BE(i); i += 4 + len; }
            else if (type === TAG_STRING)   { const len = buf.readUInt16BE(i); i += 2 + len; }
            else if (type === TAG_LIST) {
                const elType = buf[i++];
                const count  = buf.readInt32BE(i); i += 4;
                for (let n = 0; n < count; n++) skipPayload(elType);
            }
            else if (type === TAG_COMPOUND) { readCompound(); }
            else if (type === TAG_INT_ARR)  { const len = buf.readInt32BE(i); i += 4 + len * 4; }
            else if (type === TAG_LONG_ARR) { const len = buf.readInt32BE(i); i += 4 + len * 8; }
        };

        const readCompound = () => {
            while (i < buf.length) {
                const type = buf[i++];
                if (type === TAG_END) break;
                const name = readName();
                if (type === TAG_FLOAT && name === 'Health') {
                    health = buf.readFloatBE(i); i += 4;
                } else if (type === TAG_INT && name === 'foodLevel') {
                    food = buf.readInt32BE(i); i += 4;
                } else {
                    skipPayload(type);
                }
                if (health !== null && food !== null) break;
            }
        };

        // Root tag: TAG_Compound (10) + 2-byte name length + name bytes
        i++; // skip root type byte (always 10)
        const rootNameLen = buf.readUInt16BE(i); i += 2 + rootNameLen;
        readCompound();

        return { health, food };
    } catch (e) {
        return { health: null, food: null };
    }
}

// ─── Online players ───────────────────────────────────────────────────────────

router.get('/online', authenticateToken, checkPermission('server.players.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const status = await executionManager.getStatus(serverId.toString());
        if (status !== 'online') return res.json({ count: 0, players: [] });
        const names = getOnlinePlayerNames(serverId);
        res.json({ count: names.length, players: names });
    } catch (e) {
        logger.error(`[playerRoutes] GET /online error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Player list (from playerdata dir) ───────────────────────────────────────

router.get('/list', authenticateToken, checkPermission('server.players.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const playerdataDir = path.join(serverDir, 'world', 'playerdata');
        const usercache = loadUsercache(serverDir);
        let players = [];
        if (fs.existsSync(playerdataDir)) {
            const files = fs.readdirSync(playerdataDir).filter(f => f.endsWith('.dat'));
            players = files.map(f => {
                const uuid = f.replace('.dat', '');
                const username = resolveUsername(usercache, uuid) || uuid;
                return { uuid, username };
            });
        }
        res.json(players);
    } catch (e) {
        logger.error(`[playerRoutes] List players error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Player stats (from server-generated stats JSON) ─────────────────────────

router.get('/:uuid', authenticateToken, checkPermission('server.players.read'), async (req, res) => {
    const { uuid } = req.params;
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);

        const usercache = loadUsercache(serverDir);
        const username = resolveUsername(usercache, uuid);

        const dashed = uuid.includes('-') ? uuid
            : uuid.replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, '$1-$2-$3-$4-$5');

        const UUID_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

        // Read server-generated stats JSON
        const statsFile    = path.join(serverDir, 'world', 'stats', `${dashed}.json`);
        const statsFileAlt = path.join(serverDir, 'world', 'stats', `${uuid}.json`);
        let stats = {};
        if (UUID_FILE_RE.test(path.basename(statsFile))) {
            try { stats = JSON.parse(await fsp.readFile(statsFile, 'utf8')); } catch (e) {
                if (e.code !== 'ENOENT') logger.warn(`[playerRoutes] Failed to read player stats:`, e);
                if (UUID_FILE_RE.test(path.basename(statsFileAlt))) {
                    try { stats = JSON.parse(await fsp.readFile(statsFileAlt, 'utf8')); } catch (_) {}
                }
            }
        }

        // Read advancements JSON
        const advFile = path.join(serverDir, 'world', 'advancements', `${dashed}.json`);
        let advancements = {};
        try { advancements = JSON.parse(await fsp.readFile(advFile, 'utf8')); } catch (_) {}

        // Read live health + food from playerdata .dat (NBT binary)
        const datFile    = path.join(serverDir, 'world', 'playerdata', `${dashed}.dat`);
        const datFileAlt = path.join(serverDir, 'world', 'playerdata', `${uuid}.dat`);
        let vitals = { health: null, food: null };
        if (fs.existsSync(datFile))    vitals = await readPlayerVitals(datFile);
        else if (fs.existsSync(datFileAlt)) vitals = await readPlayerVitals(datFileAlt);

        res.json({
            uuid,
            username: username || uuid,
            stats,
            advancements,
            health: vitals.health !== null ? Math.round(vitals.health * 10) / 10 : null,
            food:   vitals.food,
        });
    } catch (e) {
        logger.error(`[playerRoutes] Get player stats error (Server: ${req.params.serverId}, Player: ${uuid}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Admin commands ───────────────────────────────────────────────────────────

router.post('/:uuid/command', authenticateToken, checkPermission('server.players.manage'), async (req, res) => {
    const { serverId, uuid } = req.params;
    const { action, value } = req.body;
    let server, serverDir, username;
    try {
        server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        serverDir = getServerDir(server);
        const usercache = loadUsercache(serverDir);
        username = resolveUsername(usercache, uuid);
    } catch (e) {
        logger.error(`[playerRoutes] command pre-check error (Server: ${serverId}, Player: ${uuid}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
    if (!username) return sendError(res, E.PLAYER_USERNAME_UNRESOLVABLE, 400);

    const allowedActions = [
        'kick', 'ban', 'pardon', 'mute', 'unmute',
        'op', 'deop',
        'gamemode',
        'xp', 'give', 'effect', 'clear',
        'teleport', 'heal', 'feed', 'starve', 'kill',
        'wipe'
    ];
    if (!allowedActions.includes(action)) return sendError(res, E.PLAYER_ACTION_INVALID, 400);

    // Sanitize inputs to prevent newline-based command injection.
    const sanitizeArg = (s) => String(s || '').replace(/[\r\n\0]/g, '').trim();
    const safeUsername = sanitizeArg(username);
    const safeValue    = sanitizeArg(value);

    // Actions that require the server to be online
    const requiresOnline = ['kick','ban','pardon','mute','unmute','op','deop','gamemode','xp','give','effect','clear','teleport','heal','feed','starve','kill'];
    if (requiresOnline.includes(action)) {
        const status = await executionManager.getStatus(serverId.toString());
        if (status !== 'online') {
            return sendError(res, E.PLAYER_SERVER_OFFLINE, 400);
        }
    }

    if (action === 'wipe') {
        try {
            const wipeStatus = await executionManager.getStatus(serverId.toString());
            if (wipeStatus === 'online') {
                return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
            }
            const dashed = uuid.includes('-') ? uuid
                : uuid.replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, '$1-$2-$3-$4-$5');
            const pDat   = path.join(serverDir, 'world', 'playerdata', `${uuid}.dat`);
            const pStats = path.join(serverDir, 'world', 'stats', `${dashed}.json`);
            const pAdv   = path.join(serverDir, 'world', 'advancements', `${dashed}.json`);
            if (fs.existsSync(pDat))   fs.unlinkSync(pDat);
            if (fs.existsSync(pStats)) fs.unlinkSync(pStats);
            if (fs.existsSync(pAdv))   fs.unlinkSync(pAdv);
            return res.json({ message: `Wiped all player data files for ${username} successfully.` });
        } catch (e) {
            logger.error(`[playerRoutes] Wipe player data error (Server: ${serverId}, Player: ${uuid}):`, e);
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    }

    let command;
    switch (action) {
        case 'kick':     command = `kick ${safeUsername} ${safeValue || 'Kicked by panel'}`; break;
        case 'ban':      command = `ban ${safeUsername} ${safeValue || 'Banned by panel'}`; break;
        case 'pardon':   command = `pardon ${safeUsername}`; break;
        // mute/unmute use the standard /mute & /unmute commands (requires a mute plugin or Adventure mode)
        case 'mute':     command = `mute ${safeUsername} ${safeValue || ''}`; break;
        case 'unmute':   command = `unmute ${safeUsername}`; break;
        case 'op':       command = `op ${safeUsername}`; break;
        case 'deop':     command = `deop ${safeUsername}`; break;
        case 'gamemode':
            if (!safeValue) return sendError(res, E.BAD_REQUEST, 400, 'Gamemode value required');
            command = `gamemode ${safeValue} ${safeUsername}`;
            break;
        case 'xp':
            if (!safeValue) return sendError(res, E.BAD_REQUEST, 400, 'XP value required');
            command = `xp add ${safeUsername} ${safeValue}`;
            break;
        case 'give':
            if (!safeValue) return sendError(res, E.BAD_REQUEST, 400, 'Item value required');
            command = `give ${safeUsername} ${safeValue}`;
            break;
        case 'effect':
            if (!safeValue) return sendError(res, E.BAD_REQUEST, 400, 'Effect value required');
            command = `effect give ${safeUsername} ${safeValue}`;
            break;
        case 'clear':    command = `clear ${safeUsername}`; break;
        case 'teleport':
            if (!safeValue) return sendError(res, E.BAD_REQUEST, 400, 'Teleport destination required');
            command = `tp ${safeUsername} ${safeValue}`;
            break;
        case 'heal':     command = `effect give ${safeUsername} minecraft:regeneration 3 255`; break;
        case 'feed':     command = `effect give ${safeUsername} minecraft:saturation 3 255`; break;
        case 'starve':   command = `effect give ${safeUsername} minecraft:hunger 30 255`; break;
        case 'kill':     command = `kill ${safeUsername}`; break;
        default:
            return sendError(res, E.PLAYER_ACTION_INVALID, 400);
    }

    try {
        const mode = server.execution_mode || 'native';
        if (mode === 'docker') {
            const dockerService = require('../core/dockerService');
            await dockerService.sendStdin(serverId.toString(), command);
        } else {
            processManager.sendCommand(serverId.toString(), command);
        }
        res.json({ message: `Command executed: /${command}`, command });
    } catch (e) {
        logger.error(`[playerRoutes] Send player command error (Server: ${serverId}, Player: ${uuid}, Action: ${action}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── UUID resolution helpers ──────────────────────────────────────────────────

function getOfflineUUID(username) {
    const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

async function resolvePlayerUUID(username) {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        if (response.ok) {
            const data = await response.json();
            if (data && data.id) {
                const raw = data.id;
                return `${raw.substring(0, 8)}-${raw.substring(8, 12)}-${raw.substring(12, 16)}-${raw.substring(16, 20)}-${raw.substring(20)}`;
            }
        }
    } catch (e) {
        logger.warn(`[playerRoutes] Mojang API lookup failed for ${username}:`, e.message);
    }
    return getOfflineUUID(username);
}

// ─── Player lists (whitelist / ops / bans) ────────────────────────────────────

const listFileMap = {
    'whitelist': 'whitelist.json', 'ops': 'ops.json',
    'banned-players': 'banned-players.json', 'banned-ips': 'banned-ips.json'
};

router.get('/lists/:listName', authenticateToken, checkPermission('server.players.read'), async (req, res) => {
    const { serverId, listName } = req.params;
    const filename = listFileMap[listName];
    if (!filename) return sendError(res, E.PLAYER_LIST_INVALID, 400);
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const filePath = path.join(getServerDir(server), filename);
        if (!fs.existsSync(filePath)) return res.json([]);
        const raw = fs.readFileSync(filePath, 'utf8');
        res.json(JSON.parse(raw || '[]'));
    } catch (e) {
        logger.error(`[playerRoutes] GET /lists/${req.params.listName} error:`, e);
        res.json([]);
    }
});

router.post('/lists/:listName', authenticateToken, checkPermission('server.players.manage'), async (req, res) => {
    const { serverId, listName } = req.params;
    const { target, reason, level } = req.body;
    if (!target) return sendError(res, E.BAD_REQUEST, 400, 'Target name or IP is required');
    const filename = listFileMap[listName];
    if (!filename) return sendError(res, E.PLAYER_LIST_INVALID, 400);

    const server = await getServer(serverId);
    if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
    const serverDir = getServerDir(server);
    const isOnline = (await executionManager.getStatus(serverId.toString())) === 'online';
    const mode = server.execution_mode || 'native';

    const sendCmd = async (cmd) => {
        if (mode === 'docker') {
            const dockerService = require('../core/dockerService');
            await dockerService.sendStdin(serverId.toString(), cmd);
        } else {
            processManager.sendCommand(serverId.toString(), cmd);
        }
    };

    try {
        if (isOnline) {
            let command = '';
            if (listName === 'whitelist')       command = `whitelist add ${target}`;
            else if (listName === 'ops')         command = `op ${target}`;
            else if (listName === 'banned-players') command = `ban ${target} ${reason || 'Banned by panel'}`;
            else if (listName === 'banned-ips')  command = `ban-ip ${target} ${reason || 'Banned by panel'}`;
            await sendCmd(command);
            return res.json({ message: `Sent command to online server: /${command}` });
        } else {
            const filePath = path.join(serverDir, filename);
            let list = [];
            if (fs.existsSync(filePath)) { try { list = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]'); } catch (_) {} }

            if (listName === 'banned-ips') {
                if (list.some(item => item.ip === target)) return sendError(res, E.BAD_REQUEST, 400, 'IP is already banned');
                list.push({ ip: target, created: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' +0000', source: 'Admin', expires: 'forever', reason: reason || 'Banned by panel' });
            } else {
                const uuid = await resolvePlayerUUID(target);
                if (list.some(item => item.uuid === uuid || (item.name && item.name.toLowerCase() === target.toLowerCase()))) {
                    return sendError(res, E.BAD_REQUEST, 400, 'Player is already in this list');
                }
                if (listName === 'whitelist') list.push({ uuid, name: target });
                else if (listName === 'ops') list.push({ uuid, name: target, level: level !== undefined ? parseInt(level) : 4, bypassesPlayerLimit: false });
                else if (listName === 'banned-players') list.push({ uuid, name: target, created: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' +0000', source: 'Admin', expires: 'forever', reason: reason || 'Banned by panel' });
            }

            fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
            return res.json({ message: `Successfully added ${target} to ${listName} offline.` });
        }
    } catch (e) {
        logger.error(`[playerRoutes] POST /lists/${listName} error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

router.delete('/lists/:listName/:target', authenticateToken, checkPermission('server.players.manage'), validate(Joi.object({
    listName: Joi.string().valid('whitelist','ops','banned-players','banned-ips').required(),
    target: Joi.string().required()
})), async (req, res) => {
    const { serverId, listName, target } = req.params;
    const filename = listFileMap[listName];
    if (!filename) return sendError(res, E.PLAYER_LIST_INVALID, 400);

    const server = await getServer(serverId);
    if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
    const serverDir = getServerDir(server);
    const isOnline = (await executionManager.getStatus(serverId.toString())) === 'online';
    const mode = server.execution_mode || 'native';

    const sendCmd = async (cmd) => {
        if (mode === 'docker') {
            const dockerService = require('../core/dockerService');
            await dockerService.sendStdin(serverId.toString(), cmd);
        } else {
            processManager.sendCommand(serverId.toString(), cmd);
        }
    };

    try {
        if (isOnline) {
            let command = '';
            if (listName === 'whitelist')           command = `whitelist remove ${target}`;
            else if (listName === 'ops')             command = `deop ${target}`;
            else if (listName === 'banned-players')  command = `pardon ${target}`;
            else if (listName === 'banned-ips')      command = `pardon-ip ${target}`;
            await sendCmd(command);
            return res.json({ message: `Sent command to online server: /${command}` });
        } else {
            const filePath = path.join(serverDir, filename);
            if (!fs.existsSync(filePath)) return sendError(res, E.NOT_FOUND, 404);
            let list = [];
            try { list = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]'); } catch (_) {}

            let filteredList = [];
            if (listName === 'banned-ips') filteredList = list.filter(item => item.ip !== target);
            else filteredList = list.filter(item => !(item.name && item.name.toLowerCase() === target.toLowerCase()) && item.uuid !== target);

            if (list.length === filteredList.length) return sendError(res, E.NOT_FOUND, 404);
            await fsp.writeFile(filePath, JSON.stringify(filteredList, null, 2), 'utf8');
            return res.json({ message: `Successfully removed ${target} from ${listName} offline.` });
        }
    } catch (e) {
        logger.error(`[playerRoutes] DELETE /lists/${listName} error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

module.exports = router;
