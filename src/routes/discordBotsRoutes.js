const express = require('express');
const router  = express.Router();
const discordManager = require('../core/discord/discordManager');
const { authenticateToken } = require('../core/auth');
const { dbAll } = require('../db/database');
const { checkGlobalPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');

// Any user with panel.settings permission (including admin) can access
const requirePanelSettings = [authenticateToken, checkGlobalPermission('panel.settings')];

// GET /api/discord/bots
router.get('/', requirePanelSettings, async (req, res) => {
    try { res.json(await discordManager.listBots()); }
    catch (e) { return sendError(res, E.INTERNAL_ERROR, 500, e.message); }
});

// GET /api/discord/bots/servers
router.get('/servers', requirePanelSettings, async (req, res) => {
    try { res.json(await dbAll('SELECT id, name, software, version FROM servers ORDER BY name')); }
    catch (e) { return sendError(res, E.INTERNAL_ERROR, 500, e.message); }
});

// POST /api/discord/bots/validate-token
router.post('/validate-token', requirePanelSettings, async (req, res) => {
    try {
        const { botToken } = req.body;
        if (!botToken) return sendError(res, E.DISCORD_TOKEN_REQUIRED, 400);
        res.json({ valid: true, bot: await discordManager.validateToken(botToken) });
    } catch (e) { return res.json({ valid: false, error: e.message }); }
});

// POST /api/discord/bots
router.post('/', requirePanelSettings, async (req, res) => {
    try {
        const { botToken, guildId, serverIds = [] } = req.body;
        if (!botToken || !guildId) return sendError(res, E.DISCORD_TOKEN_REQUIRED, 400);
        if (!/^\d{17,20}$/.test(guildId)) return sendError(res, E.DISCORD_GUILD_INVALID, 400);
        res.json(await discordManager.createBot(botToken, guildId, serverIds));
    } catch (e) { return sendError(res, E.DISCORD_CONNECT_FAILED, 400, e.message); }
});

// GET /api/discord/bots/:botId
router.get('/:botId', requirePanelSettings, async (req, res) => {
    try {
        const bot = await discordManager.getBot(req.params.botId);
        if (!bot) return sendError(res, E.BOT_NOT_FOUND, 404);
        res.json(bot);
    } catch (e) { return sendError(res, E.INTERNAL_ERROR, 500, e.message); }
});

// PUT /api/discord/bots/:botId
router.put('/:botId', requirePanelSettings, async (req, res) => {
    try {
        const { botToken, guildId, serverIds } = req.body;
        if (guildId && !/^\d{17,20}$/.test(guildId)) return sendError(res, E.DISCORD_GUILD_INVALID, 400);
        res.json(await discordManager.updateBot(req.params.botId, { botToken, guildId, serverIds }));
    } catch (e) { return sendError(res, E.DISCORD_CONNECT_FAILED, 400, e.message); }
});

// DELETE /api/discord/bots/:botId
router.delete('/:botId', requirePanelSettings, async (req, res) => {
    try { res.json(await discordManager.deleteBot(req.params.botId)); }
    catch (e) { return sendError(res, E.INTERNAL_ERROR, 500, e.message); }
});

// POST /api/discord/bots/:botId/toggle
router.post('/:botId/toggle', requirePanelSettings, async (req, res) => {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') return sendError(res, E.VALIDATION_ERROR, 400, '"enabled" (boolean) required');
        await discordManager.toggleBot(req.params.botId, enabled);
        res.json({ success: true, enabled });
    } catch (e) { return sendError(res, E.INTERNAL_ERROR, 500, e.message); }
});

module.exports = router;
