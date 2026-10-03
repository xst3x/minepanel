"use strict";
// ── Server API Key Authentication Middleware ──────────────────────────────
// Extracts Bearer token from Authorization header, looks up the key hash,
// verifies scopes, and attaches { apiKey, serverId } to req.
//
// Usage:
//   router.use(require('./middleware/apiKeyAuth'))
//   router.get('/info', apiKeyAuth('server.read'), handler)
//   router.post('/console', apiKeyAuth('server.console.write'), handler)
const argon2 = require("argon2");
const { dbGet, dbRun } = require('../db/database');
const { E, sendError } = require('../core/errors');
const logger = require("../core/utils/logger");
const audit = require("../core/utils/auditLog");
const { isIpAllowed } = require('../core/utils/ipAllowlist');
// Rate limiter state (simple in-memory bucket per key prefix)
const keyRateBuckets = {};
const RATE_LIMIT_MAX = 60; // requests per window
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
function checkRateLimit(keyPrefix) {
    const now = Date.now();
    const bucket = keyRateBuckets[keyPrefix];
    if (!bucket || now > bucket.resetAt) {
        keyRateBuckets[keyPrefix] = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
        return true;
    }
    bucket.count++;
    return bucket.count <= RATE_LIMIT_MAX;
}
// ── Available API scopes ─────────────────────────────────────────────────
const ALL_SCOPES = {
    'server.read': 'Read server information',
    'server.console.read': 'View console output',
    'server.console.write': 'Send console commands',
    'server.console.chat.view': 'View server chat',
    'server.console.chat.send': 'Send chat messages',
    'server.players.read': 'View online players',
    'server.performance.read': 'View performance metrics',
    'server.files.read': 'Read files',
    'server.files.write': 'Write/upload files',
    'server.files.delete': 'Delete files',
    'server.backups.read': 'View backups',
    'server.backups.write': 'Create/restore/delete backups',
    'server.power': 'Start/stop/restart/kill server',
    'server.everything': 'All scopes (wildcard)',
};
function hasScope(keyScopes, requiredScope) {
    if (keyScopes.includes('server.everything'))
        return true;
    return keyScopes.includes(requiredScope);
}
// ── Middleware factory ───────────────────────────────────────────────────
function apiKeyAuth(requiredScope) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
            if (!token) {
                audit.log(req, 'API_KEY_MISSING', {
                    detail: { serverId: req.params.serverId, reason: 'authorization_header_missing' }
                }).catch(() => { });
                return sendError(res, E.API_KEY_MISSING, 401);
            }
            const serverId = req.params.serverId;
            if (!serverId) {
                return sendError(res, E.BAD_REQUEST, 400, 'Server ID is required');
            }
            // Use first 8 chars as prefix for fast lookup
            const prefix = token.length >= 20 ? token.substring(0, 20) : token;
            // Rate limit by key prefix
            if (!checkRateLimit(prefix)) {
                audit.log(req, 'API_KEY_RATE_LIMITED', {
                    detail: { serverId, keyPrefix: prefix, reason: 'rate_limit_exceeded' }
                }).catch(() => { });
                return sendError(res, E.API_KEY_RATE_LIMITED, 429);
            }
            // Find all non-revoked, non-expired keys for this server
            const keys = await dbGet(`SELECT id, key_hash, key_prefix, scopes, expires_at, allowed_ips
         FROM server_api_keys 
         WHERE server_id = ? AND key_prefix = ? AND is_revoked = 0`, [serverId, prefix]);
            if (!keys) {
                audit.log(req, 'API_KEY_INVALID', {
                    detail: { serverId, keyPrefix: prefix, reason: 'key_not_found' }
                }).catch(() => { });
                return sendError(res, E.API_KEY_INVALID, 401);
            }
            // Check expiration
            if (keys.expires_at && new Date(keys.expires_at).getTime() < Date.now()) {
                audit.log(req, 'API_KEY_EXPIRED', {
                    detail: { serverId, keyPrefix: prefix, expires: keys.expires_at }
                }).catch(() => { });
                return sendError(res, E.API_KEY_EXPIRED, 401);
            }
            // Verify hash with argon2 constant-time comparison
            let isValid = false;
            try {
                isValid = await argon2.verify(keys.key_hash, token);
            }
            catch {
                audit.log(req, 'API_KEY_INVALID', {
                    detail: { serverId, keyPrefix: prefix, reason: 'hash_verify_error' }
                }).catch(() => { });
                return sendError(res, E.API_KEY_INVALID, 401);
            }
            if (!isValid) {
                audit.log(req, 'API_KEY_INVALID', {
                    detail: { serverId, keyPrefix: prefix, reason: 'hash_mismatch' }
                }).catch(() => { });
                return sendError(res, E.API_KEY_INVALID, 401);
            }
            // Parse scopes
            let keyScopes = ['server.read'];
            try {
                keyScopes = JSON.parse(keys.scopes || '["server.read"]');
                if (!Array.isArray(keyScopes))
                    keyScopes = ['server.read'];
            }
            catch { /* use default */ }
            // Check required scope
            if (!hasScope(keyScopes, requiredScope)) {
                audit.log(req, 'API_KEY_FORBIDDEN', {
                    detail: { serverId, keyPrefix: prefix, requiredScope, keyScopes }
                }).catch(() => { });
                return sendError(res, E.API_KEY_FORBIDDEN, 403, `Missing permission: ${requiredScope}`);
            }
            // Check IP allowlist (if set)
            let allowedIps = [];
            try {
                allowedIps = JSON.parse(keys.allowed_ips || '[]');
                if (!Array.isArray(allowedIps))
                    allowedIps = [];
            }
            catch {
                allowedIps = [];
            }
            if (allowedIps.length > 0) {
                const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
                if (!isIpAllowed(clientIp, allowedIps)) {
                    audit.log(req, 'API_KEY_IP_DENIED', {
                        detail: { serverId, keyPrefix: prefix, ip: clientIp }
                    }).catch(() => { });
                    return sendError(res, E.API_KEY_FORBIDDEN, 403, 'IP address not allowed by key restrictions');
                }
            }
            // Update last_used_at (fire-and-forget)
            dbRun('UPDATE server_api_keys SET last_used_at = ? WHERE id = ?', [
                new Date().toISOString(), keys.id
            ]).catch(() => { });
            // Attach to request
            req.apiKey = {
                id: keys.id,
                keyPrefix: prefix,
                scopes: keyScopes,
                serverId,
            };
            // Audit log
            audit.log(null, 'API_KEY_REQUEST', {
                detail: { serverId, scope: requiredScope, keyPrefix: prefix }
            }).catch(() => { });
            next();
        }
        catch (err) {
            logger.error('[apiKeyAuth] Error:', err);
            return sendError(res, E.INTERNAL_ERROR, 500);
        }
    };
}
module.exports = { apiKeyAuth, ALL_SCOPES, hasScope };
//# sourceMappingURL=apiKeyAuth.js.map