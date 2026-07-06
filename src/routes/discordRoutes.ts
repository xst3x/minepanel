/**
 * Discord integration API routes.
 * Mounted at /api/servers/:serverId/discord
 */
import express = require('express')
const router = express.Router({ mergeParams: true });
import discordManager = require('../core/discord/discordManager')
import authModule = require('../core/auth')
const { authenticateToken } = authModule;
import permissionsModule = require('../core/permissions')
const { hasPermission } = permissionsModule;
import errorsModule = require('../core/errors')
const { E, sendError } = errorsModule;
import validationModule = require('../middleware/validation')
const { validate } = validationModule;
import V = require('../middleware/validators')
import logger = require('../core/utils/logger')

/**
 * Middleware: require authentication + server admin permission
 */
async function requireServerAdmin(req: any, res: any, next: any) {
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
router.get('/status', requireServerAdmin, async (req: any, res: any) => {
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
router.post('/connect', requireServerAdmin, validate(V.discordConnect), async (req: any, res: any) => {
    try {
        const { botToken, guildId } = req.body;
        const result = await discordManager.connect((req.params as any).serverId, botToken, guildId);
        res.json(result);
    } catch (e) {
        logger.error(`[discordRoutes] POST /connect error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.DISCORD_CONNECT_FAILED, 400, e.message);
    }
});

// ─── POST /api/servers/:serverId/discord/disconnect ───
router.post('/disconnect', requireServerAdmin, async (req: any, res: any) => {
    try {
        const result = await discordManager.disconnect(req.params.serverId);
        res.json(result);
    } catch (e) {
        logger.error(`[discordRoutes] POST /disconnect error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── POST /api/servers/:serverId/discord/toggle ───
router.post('/toggle', requireServerAdmin, validate(V.discordToggle), async (req: any, res: any) => {
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
router.post('/validate-token', requireServerAdmin, validate(V.discordValidateToken), async (req: any, res: any) => {
    try {
        const { botToken } = req.body;
        const botUser = await discordManager.validateToken(botToken);
        res.json({ valid: true, bot: botUser });
    } catch (e) {
        return sendError(res, E.DISCORD_CONNECT_FAILED, 400, e.message);
    }
});

// ─── POST /api/servers/:serverId/discord/reprovision ───
router.post('/reprovision', requireServerAdmin, async (req: any, res: any) => {
    try {
        const result = await discordManager.reprovision(req.params.serverId);
        res.json(result);
    } catch (e) {
        logger.error(`[discordRoutes] POST /reprovision error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

export = router;
