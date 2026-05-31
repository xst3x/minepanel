const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const Joi = require('joi');
const { validate } = require('../middleware/validation');
const path = require('path');
const nbt = require('prismarine-nbt');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const processManager = require('../core/processManager');
const { getServer, getServerDir } = require('../core/serverHelper');
const { E, sendError } = require('../core/errors');
const logger = require('../core/utils/logger');

const parseNbt = nbt.parse;
const router = express.Router({ mergeParams: true });

const { buildAssetsIndex } = require('../core/assetsResolver');

let assetsIndex = {};
try {
    assetsIndex = buildAssetsIndex();
} catch (e) {
    logger.error('[AssetsIndex] Failed to initialize assets index:', e);
}

router.get('/assets-index', authenticateToken, (req, res) => {
    res.json(assetsIndex);
});

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

router.get('/online', authenticateToken, checkPermission('server.players.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const status = processManager.getStatus(serverId.toString());
        if (status !== 'online') return res.json({ count: 0, players: [] });
        const names = getOnlinePlayerNames(serverId);
        res.json({ count: names.length, players: names });
    } catch (e) {
        logger.error(`[playerRoutes] GET /online error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

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

// ─── NBT helpers (unchanged) ─────────────────────────────────────────────────

const simplifyNbt = (tag) => {
    if (!tag) return null;
    if (tag.type !== undefined && tag.value !== undefined) return simplifyNbt(tag.value);
    if (Array.isArray(tag)) return tag.map(simplifyNbt);
    if (typeof tag === 'object') {
        const res = {};
        for (const [key, val] of Object.entries(tag)) res[key] = simplifyNbt(val);
        return res;
    }
    return tag;
};

const extractTextFromComponent = (component) => {
    if (!component) return '';
    if (typeof component === 'string') return component;
    if (Array.isArray(component)) return component.map(extractTextFromComponent).join('');
    let text = component.text || '';
    if (component.extra) text += extractTextFromComponent(component.extra);
    return text;
};

const parseJsonTextComponent = (rawText) => {
    if (!rawText) return '';
    if (typeof rawText !== 'string') return String(rawText);
    const trimmed = rawText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return extractTextFromComponent(JSON.parse(trimmed)); } catch (_) { return rawText; }
    }
    return rawText;
};

const parseItemTag = (rawTag) => {
    if (!rawTag) return null;
    const tag = simplifyNbt(rawTag);
    if (!tag) return null;
    const parsed = { customName: null, lore: [], enchantments: [], attributes: [], unbreakable: false, damage: 0 };
    if (tag.display) {
        if (tag.display.Name) parsed.customName = parseJsonTextComponent(tag.display.Name);
        if (Array.isArray(tag.display.Lore)) parsed.lore = tag.display.Lore.map(line => parseJsonTextComponent(line));
    }
    const enchantsList = tag.Enchantments || tag.StoredEnchantments || tag.ench;
    if (Array.isArray(enchantsList)) {
        parsed.enchantments = enchantsList.map(e => ({ id: e.id || '', lvl: e.lvl !== undefined ? e.lvl : 1 }));
    }
    if (Array.isArray(tag.AttributeModifiers)) {
        parsed.attributes = tag.AttributeModifiers.map(attr => ({
            name: attr.AttributeName || attr.name || '',
            amount: attr.Amount !== undefined ? attr.Amount : 0,
            operation: attr.Operation !== undefined ? attr.Operation : 0
        }));
    }
    if (tag.Unbreakable) parsed.unbreakable = !!tag.Unbreakable;
    if (tag.Damage !== undefined) parsed.damage = tag.Damage;
    return parsed;
};

const extractItems = (nbtList) => {
    if (!nbtList || !nbtList.value || !nbtList.value.value) return [];
    return nbtList.value.value.map(item => {
        const slot = (item.Slot && item.Slot.value !== undefined) ? item.Slot.value : -1;
        const id = (item.id && item.id.value !== undefined) ? item.id.value : 'unknown';
        const countVal = (item.Count && item.Count.value !== undefined) ? item.Count.value :
                         ((item.count && item.count.value !== undefined) ? item.count.value : 1);
        let rawTag = null;
        if (item.tag && item.tag.value) rawTag = item.tag.value;
        return { slot, id, count: countVal, tag: rawTag, simplified: simplifyNbt(item.tag), parsed: parseItemTag(item.tag) };
    });
};

const extractEffects = (effectsList) => {
    if (!effectsList || !effectsList.value || !effectsList.value.value) return [];
    return effectsList.value.value.map(eff => {
        const rawId = (eff.id && eff.id.value !== undefined) ? eff.id.value :
                      ((eff.Id && eff.Id.value !== undefined) ? eff.Id.value : -1);
        let id = typeof rawId === 'string' ? rawId : ('minecraft:' + rawId);
        const numericMap = {
            1: 'minecraft:speed', 2: 'minecraft:slowness', 3: 'minecraft:haste',
            4: 'minecraft:mining_fatigue', 5: 'minecraft:strength', 6: 'minecraft:instant_health',
            7: 'minecraft:instant_damage', 8: 'minecraft:jump_boost', 9: 'minecraft:nausea',
            10: 'minecraft:regeneration', 11: 'minecraft:resistance', 12: 'minecraft:fire_resistance',
            13: 'minecraft:water_breathing', 14: 'minecraft:invisibility', 15: 'minecraft:blindness',
            16: 'minecraft:night_vision', 17: 'minecraft:hunger', 18: 'minecraft:weakness',
            19: 'minecraft:poison', 20: 'minecraft:wither', 21: 'minecraft:health_boost',
            22: 'minecraft:absorption', 23: 'minecraft:saturation', 24: 'minecraft:glowing',
            25: 'minecraft:levitation', 26: 'minecraft:luck', 27: 'minecraft:unluck',
            28: 'minecraft:slow_falling', 29: 'minecraft:conduit_power', 30: 'minecraft:dolphins_grace',
            31: 'minecraft:bad_omen', 32: 'minecraft:hero_of_the_village', 33: 'minecraft:darkness'
        };
        if (typeof rawId === 'number' && numericMap[rawId]) id = numericMap[rawId];
        const amplifier = (eff.amplifier && eff.amplifier.value !== undefined) ? eff.amplifier.value :
                          ((eff.Amplifier && eff.Amplifier.value !== undefined) ? eff.Amplifier.value : 0);
        const duration = (eff.duration && eff.duration.value !== undefined) ? eff.duration.value :
                         ((eff.Duration && eff.Duration.value !== undefined) ? eff.Duration.value : 0);
        return { id, amplifier, duration };
    });
};

// ─── Get player NBT ───────────────────────────────────────────────────────────

router.get('/:uuid', authenticateToken, checkPermission('server.players.read'), async (req, res) => {
    const { uuid } = req.params;
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const playerFile = path.join(serverDir, 'world', 'playerdata', `${uuid}.dat`);

        const isOnline = processManager.getStatus(req.params.serverId.toString()) === 'online';
        if (isOnline) {
            try {
                processManager.sendCommand(req.params.serverId.toString(), 'save-all');
                await new Promise(resolve => setTimeout(resolve, 250));
            } catch (cmdErr) {
                logger.warn(`[playerRoutes] Dynamic save-all sync failed:`, cmdErr);
            }
        }

        if (!fs.existsSync(playerFile)) return sendError(res, E.PLAYER_NOT_FOUND, 404);

        const usercache = loadUsercache(serverDir);
        const username = resolveUsername(usercache, uuid);
        const fileBuffer = await fsp.readFile(playerFile);
        const result = await parseNbt(fileBuffer);
        const data = (result.parsed && result.parsed.value) ? result.parsed.value : (result.value || result);

        const health = (data.Health && data.Health.value !== undefined) ? data.Health.value : 20;
        const foodLevel = (data.foodLevel && data.foodLevel.value !== undefined) ? data.foodLevel.value : 20;
        const xpLevel = (data.XpLevel && data.XpLevel.value !== undefined) ? data.XpLevel.value : 0;
        const gameMode = (data.playerGameType && data.playerGameType.value !== undefined) ? data.playerGameType.value : 0;

        let posList = [0, 0, 0];
        if (data.Pos && data.Pos.value && data.Pos.value.value) {
            posList = data.Pos.value.value.map(v => (v && v.value !== undefined) ? v.value : v);
        } else if (data.Pos && data.Pos.value) {
            posList = data.Pos.value.map(v => (v && v.value !== undefined) ? v.value : v);
        }

        const rawInventory = extractItems(data.Inventory);
        const rawEnderChest = extractItems(data.EnderItems);

        const inventory = Array(27).fill(null);
        const hotbar = Array(9).fill(null);
        const armor = { helmet: null, chestplate: null, leggings: null, boots: null };
        let offhand = null;
        const enderChest = Array(27).fill(null);

        rawInventory.forEach(item => {
            const slot = item.slot;
            if (slot >= 0 && slot <= 8) hotbar[slot] = item;
            else if (slot >= 9 && slot <= 35) inventory[slot - 9] = item;
            else if (slot === 100) armor.boots = item;
            else if (slot === 101) armor.leggings = item;
            else if (slot === 102) armor.chestplate = item;
            else if (slot === 103) armor.helmet = item;
            else if (slot === -106 || slot === 106 || slot === 150) offhand = item;
        });

        rawEnderChest.forEach(item => {
            const slot = item.slot;
            if (slot >= 0 && slot <= 26) enderChest[slot] = item;
        });

        const dashed = uuid.includes('-') ? uuid : uuid.replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, '$1-$2-$3-$4-$5');
        const statsFile = path.join(serverDir, 'world', 'stats', `${dashed}.json`);
        const statsFileAlt = path.join(serverDir, 'world', 'stats', `${uuid}.json`);
        const UUID_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

        let stats = {};
        if (UUID_FILE_RE.test(path.basename(statsFile))) {
            try {
                stats = JSON.parse(await fsp.readFile(statsFile, 'utf8'));
            } catch (e) {
                if (e.code !== 'ENOENT') logger.warn(`[playerRoutes] Failed to read player stats:`, e);
                if (UUID_FILE_RE.test(path.basename(statsFileAlt))) {
                    try { stats = JSON.parse(await fsp.readFile(statsFileAlt, 'utf8')); } catch (_) {}
                }
            }
        }

        res.json({
            uuid, username: username || uuid, health, foodLevel, xpLevel, gameMode,
            position: { x: posList[0], y: posList[1], z: posList[2] },
            inventory, hotbar, armor, offhand, enderChest,
            activeEffects: extractEffects(data.ActiveEffects || data.active_effects),
            stats
        });
    } catch (e) {
        logger.error(`[playerRoutes] Get player NBT error (Server: ${req.params.serverId}, User: ${req.user.id}, Player: ${uuid}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

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

    const allowedActions = ['kick', 'ban', 'pardon', 'op', 'deop', 'gamemode', 'xp', 'give', 'effect', 'clear', 'wipe', 'teleport', 'heal', 'kill'];
    if (!allowedActions.includes(action)) return sendError(res, E.PLAYER_ACTION_INVALID, 400);

    if (action === 'wipe') {
        try {
            if (processManager.getStatus(serverId.toString()) === 'online') {
                return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
            }
            const pDat = path.join(serverDir, 'world', 'playerdata', `${uuid}.dat`);
            const pStats = path.join(serverDir, 'world', 'stats', `${uuid}.json`);
            const pAdv = path.join(serverDir, 'world', 'advancements', `${uuid}.json`);
            if (fs.existsSync(pDat)) fs.unlinkSync(pDat);
            if (fs.existsSync(pStats)) fs.unlinkSync(pStats);
            if (fs.existsSync(pAdv)) fs.unlinkSync(pAdv);
            return res.json({ message: `Wiped all player data files for ${username} successfully.` });
        } catch (e) {
            logger.error(`[playerRoutes] Wipe player data files error (Server: ${serverId}, User: ${req.user.id}, Player: ${uuid}):`, e);
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    }

    let command;
    switch (action) {
        case 'kick': command = `kick ${username} ${value || 'Kicked by panel'}`; break;
        case 'ban': command = `ban ${username} ${value || 'Banned by panel'}`; break;
        case 'pardon': command = `pardon ${username}`; break;
        case 'op': command = `op ${username}`; break;
        case 'deop': command = `deop ${username}`; break;
        case 'gamemode': if (!value) return sendError(res, E.BAD_REQUEST, 400, 'Gamemode value required'); command = `gamemode ${value} ${username}`; break;
        case 'xp': if (!value) return sendError(res, E.BAD_REQUEST, 400, 'XP value required'); command = `xp add ${username} ${value}`; break;
        case 'give': if (!value) return sendError(res, E.BAD_REQUEST, 400, 'Item/Give value required'); command = `give ${username} ${value}`; break;
        case 'effect': if (!value) return sendError(res, E.BAD_REQUEST, 400, 'Effect value required'); command = `effect give ${username} ${value}`; break;
        case 'clear': command = `clear ${username}`; break;
        case 'teleport': if (!value) return sendError(res, E.BAD_REQUEST, 400, 'Teleport destination required'); command = `tp ${username} ${value}`; break;
        case 'heal': command = `effect give ${username} minecraft:instant_health 1 255`; break;
        case 'kill': command = `kill ${username}`; break;
    }

    try {
        processManager.sendCommand(serverId.toString(), command);
        res.json({ message: `Command executed: /${command}`, command });
    } catch (e) {
        logger.error(`[playerRoutes] Send player command error (Server: ${serverId}, User: ${req.user.id}, Player: ${uuid}, Action: ${action}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── UUID helper ──────────────────────────────────────────────────────────────
const crypto = require('crypto');
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

// ─── Player lists ─────────────────────────────────────────────────────────────
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
        logger.error(`[playerRoutes] GET /lists/${listName} error:`, e);
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
    const isOnline = processManager.getStatus(serverId.toString()) === 'online';

    try {
        if (isOnline) {
            let command = '';
            if (listName === 'whitelist') command = `whitelist add ${target}`;
            else if (listName === 'ops') command = `op ${target}`;
            else if (listName === 'banned-players') command = `ban ${target} ${reason || 'Banned by panel'}`;
            else if (listName === 'banned-ips') command = `ban-ip ${target} ${reason || 'Banned by panel'}`;
            processManager.sendCommand(serverId.toString(), command);
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
    const isOnline = processManager.getStatus(serverId.toString()) === 'online';

    try {
        if (isOnline) {
            let command = '';
            if (listName === 'whitelist') command = `whitelist remove ${target}`;
            else if (listName === 'ops') command = `deop ${target}`;
            else if (listName === 'banned-players') command = `pardon ${target}`;
            else if (listName === 'banned-ips') command = `pardon-ip ${target}`;
            processManager.sendCommand(serverId.toString(), command);
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
