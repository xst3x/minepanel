/**
 * Discord integration API routes.
 * Mounted at /api/servers/:serverId/discord
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const discordManager = require('../core/discord/discordManager');
const { authenticateToken } = require('../core/auth');
const { hasPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const logger = require('../core/utils/logger');

/**
 * Middleware: require authentication + server admin permission
 */
async function requireServerAdmin(req, res, next) {
    authenticateToken(req, res, async () => {
        try {
            const serverId = req.params.serverId;
            const canManage = await hasPermission(req.user.id, serverId, 'server.settings.edit');
            if (!canManage) {
                return sendError(res, E.FORBIDDEN, 403);
            }
            next();
        } catch (e) {
            logger.error(`[discordRoutes] requireServerAdmin error (Server: ${req.params.serverId}):`, e);
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    });
}

// ─── GET /api/servers/:serverId/discord/status ───
router.get('/status', requireServerAdmin, async (req, res) => {
    try {
        const status = await discordManager.getStatus(req.params.serverId);
        if (!status) {
            return res.json({ connected: false });
        }
        res.json({ connected: true, ...status });
    } catch (e) {
        logger.error(`[discordRoutes] GET /status error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── POST /api/servers/:serverId/discord/connect ───
router.post('/connect', requireServerAdmin, validate(V.discordConnect), async (req, res) => {
    try {
        const { botToken, guildId } = req.body;
        const result = await discordManager.connect(req.params.serverId, botToken, guildId);
        res.json(result);
    } catch (e) {
        logger.error(`[discordRoutes] POST /connect error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.DISCORD_CONNECT_FAILED, 400, e.message);
    }
});

// ─── POST /api/servers/:serverId/discord/disconnect ───
router.post('/disconnect', requireServerAdmin, async (req, res) => {
    try {
        const result = await discordManager.disconnect(req.params.serverId);
        res.json(result);
    } catch (e) {
        logger.error(`[discordRoutes] POST /disconnect error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── POST /api/servers/:serverId/discord/toggle ───
router.post('/toggle', requireServerAdmin, validate(V.discordToggle), async (req, res) => {
    try {
        const { enabled } = req.body;
        await discordManager.toggleEnabled(req.params.serverId, enabled);
        res.json({ success: true, enabled });
    } catch (e) {
        logger.error(`[discordRoutes] POST /toggle error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── POST /api/servers/:serverId/discord/validate-token ───
router.post('/validate-token', requireServerAdmin, validate(V.discordValidateToken), async (req, res) => {
    try {
        const { botToken } = req.body;
        const botUser = await discordManager.validateToken(botToken);
        res.json({ valid: true, bot: botUser });
    } catch (e) {
        return sendError(res, E.DISCORD_CONNECT_FAILED, 400, e.message);
    }
});

// ─── POST /api/servers/:serverId/discord/reprovision ───
router.post('/reprovision', requireServerAdmin, async (req, res) => {
    try {
        const result = await discordManager.reprovision(req.params.serverId);
        res.json(result);
    } catch (e) {
        logger.error(`[discordRoutes] POST /reprovision error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
