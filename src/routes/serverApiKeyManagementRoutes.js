"use strict";
// ── Server API Key Management Routes ──────────────────────────────────
// Used by the panel UI to create, list, revoke, and manage API keys.
// Mounted at /api/servers/:serverId/api-keys/*
// Protected by JWT auth + existing permissions.
const express = require("express");
const { dbGet, dbRun, dbAll } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const argon2 = require("argon2");
const crypto = require("crypto");
const logger = require("../core/utils/logger");
const { ALL_SCOPES } = require('../middleware/apiKeyAuth');
const router = express.Router({ mergeParams: true });
// All routes require authentication + server.properties.write permission
router.use(authenticateToken);
router.use(checkPermission('server.properties.write'));
// ── Generate a unique API key ─────────────────────────────────────────
// Format: mp_srv_<serverId>_<48 random hex chars>
function generateApiKey(serverId) {
    const random = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    return `mp_${serverId}_${random}`;
}
// ── GET / — List all API keys for the server ──────────────────────────
router.get('/', async (req, res) => {
    try {
        const { serverId } = req.params;
        const keys = await dbAll(`SELECT id, name, key_prefix, scopes, allowed_ips, expires_at, last_used_at, is_revoked, created_by, created_at
       FROM server_api_keys WHERE server_id = ? ORDER BY created_at DESC`, [serverId]);
        // Enrich with usage stats
        const result = (keys || []).map((k) => ({
            id: k.id,
            name: k.name,
            key_prefix: k.key_prefix + '...',
            scopes: JSON.parse(k.scopes || '["server.read"]'),
            allowed_ips: JSON.parse(k.allowed_ips || '[]'),
            expires_at: k.expires_at,
            last_used_at: k.last_used_at,
            is_revoked: !!k.is_revoked,
            created_by: k.created_by,
            created_at: k.created_at,
        }));
        res.json(result);
    }
    catch (e) {
        logger.error('[apiKeyMgmt] GET / error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ── POST / — Create a new API key ────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, scopes, expires_at } = req.body;
        const keyName = (name || 'Unnamed Key').trim();
        const keyScopes = Array.isArray(scopes) && scopes.length > 0
            ? scopes : ['server.read'];
        // Validate scopes
        const validScopes = Object.keys(ALL_SCOPES);
        for (const scope of keyScopes) {
            if (!validScopes.includes(scope)) {
                return sendError(res, E.VALIDATION_ERROR, 400, `Invalid scope: ${scope}`);
            }
        }
        // Generate the full API key
        const server = await dbGet('SELECT id FROM servers WHERE id = ?', [serverId]);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const rawKey = generateApiKey(Number(serverId));
        const keyPrefix = rawKey.substring(0, 20); // longer prefix avoids collisions
        // Hash the key with argon2
        const keyHash = await argon2.hash(rawKey, { type: argon2.argon2id });
        const { allowed_ips } = req.body;
        const keyAllowedIps = Array.isArray(allowed_ips) ? allowed_ips : [];
        const result = await dbRun(`INSERT INTO server_api_keys (server_id, name, key_hash, key_prefix, scopes, allowed_ips, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            serverId,
            keyName,
            keyHash,
            keyPrefix,
            JSON.stringify(keyScopes),
            JSON.stringify(keyAllowedIps),
            expires_at || null,
            req.user.id,
        ]);
        logger.info(`[apiKeyMgmt] API key created for server ${serverId}: ${keyName}`);
        // Return the full key only once
        res.status(201).json({
            id: result.lastID,
            name: keyName,
            key: rawKey, // Full key — shown only ONCE
            key_prefix: keyPrefix + '...',
            scopes: keyScopes,
            allowed_ips: keyAllowedIps,
            expires_at: expires_at || null,
            created_at: new Date().toISOString(),
        });
    }
    catch (e) {
        logger.error('[apiKeyMgmt] POST / error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ── PATCH /:keyId — Update API key (name, scopes) ────────────────────
router.patch('/:keyId', async (req, res) => {
    try {
        const { serverId, keyId } = req.params;
        const { name, scopes, allowed_ips } = req.body;
        const key = await dbGet('SELECT id FROM server_api_keys WHERE id = ? AND server_id = ?', [keyId, serverId]);
        if (!key)
            return sendError(res, E.NOT_FOUND, 404);
        const updates = [];
        const params = [];
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(String(name).trim() || 'Unnamed Key');
        }
        if (scopes !== undefined && Array.isArray(scopes)) {
            const validScopes = Object.keys(ALL_SCOPES);
            for (const scope of scopes) {
                if (!validScopes.includes(scope)) {
                    return sendError(res, E.VALIDATION_ERROR, 400, `Invalid scope: ${scope}`);
                }
            }
            updates.push('scopes = ?');
            params.push(JSON.stringify(scopes));
        }
        if (allowed_ips !== undefined && Array.isArray(allowed_ips)) {
            updates.push('allowed_ips = ?');
            params.push(JSON.stringify(allowed_ips));
        }
        if (updates.length === 0) {
            return sendError(res, E.BAD_REQUEST, 400, 'Nothing to update');
        }
        params.push(keyId);
        await dbRun(`UPDATE server_api_keys SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'API key updated' });
    }
    catch (e) {
        logger.error('[apiKeyMgmt] PATCH /:keyId error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ── DELETE /:keyId — Revoke (or permanently delete) an API key ────────
router.delete('/:keyId', async (req, res) => {
    try {
        const { serverId, keyId } = req.params;
        const key = await dbGet('SELECT id FROM server_api_keys WHERE id = ? AND server_id = ?', [keyId, serverId]);
        if (!key)
            return sendError(res, E.NOT_FOUND, 404);
        await dbRun('UPDATE server_api_keys SET is_revoked = 1 WHERE id = ?', [keyId]);
        logger.info(`[apiKeyMgmt] API key ${keyId} revoked for server ${serverId}`);
        res.json({ success: true, message: 'API key revoked' });
    }
    catch (e) {
        logger.error('[apiKeyMgmt] DELETE /:keyId error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ── GET /scopes — Return all available scopes with descriptions ───────
router.get('/scopes', async (req, res) => {
    const scopes = Object.entries(ALL_SCOPES).map(([key, desc]) => ({
        key,
        description: desc,
    }));
    res.json(scopes);
});
module.exports = router;
//# sourceMappingURL=serverApiKeyManagementRoutes.js.map