import express = require('express');
import auth = require('../core/auth');
import permissions = require('../core/permissions');
import { dbAll, dbGet } from '../db/database';
import * as store from '../core/mcp/store';
import { z } from 'zod';
import { registry } from '../core/mcp/registry';
import CONFIG = require('../config');

const router = express.Router();
router.use(auth.authenticateToken, permissions.checkGlobalPermission('mcp.manage'));
router.use(async (req, res, next) => {
    // Agent/internal principals cannot administer identities, even through an inherited rank.
    const user = await dbGet('SELECT id FROM users WHERE id=?', [req.user.id]);
    if (!user || req.user.internal === true || req.user.role === 'mcp') return res.status(403).json({ error: 'Interactive panel account required' });
    res.setHeader('Cache-Control', 'no-store');
    next();
});
const endpoint = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler => (req, res) => {
    void fn(req, res).catch(error => res.status(error instanceof z.ZodError ? 400 : 409).json({ error: error instanceof z.ZodError ? 'Invalid MCP configuration' : 'MCP management request could not be completed' }));
};
router.get('/identities', endpoint(async (_req, res) => res.json(await store.identities())));
router.post('/identities', endpoint(async (req, res) => res.status(201).json(await store.createIdentity(req.body, String(req.user.id)))));
router.put('/identities/:id', endpoint(async (req, res) => res.json(await store.updateIdentity(String(req.params.id), req.body, String(req.user.id)))));
router.post('/identities/:id/rotate', endpoint(async (req, res) => res.json(await store.rotateKey(String(req.params.id), String(req.user.id)))));
router.post('/identities/:id/revoke', endpoint(async (req, res) => res.json(await store.rotateKey(String(req.params.id), String(req.user.id), true))));
router.get('/approvals', endpoint(async (req, res) => res.json(await store.approvals(typeof req.query.identityId === 'string' ? req.query.identityId : undefined))));
router.post('/approvals/:id/decision', endpoint(async (req, res) => {
    const { approved } = z.object({ approved: z.boolean() }).strict().parse(req.body);
    await store.decide(String(req.params.id), approved, String(req.user.id));
    res.json({ ok: true });
}));
router.get('/activity', endpoint(async (req, res) => {
    const id = typeof req.query.identityId === 'string' ? req.query.identityId : undefined;
    res.json(await dbAll(`SELECT * FROM mcp_audit ${id ? 'WHERE identity_id=?' : ''} ORDER BY id DESC LIMIT 200`, id ? [id] : []));
}));
router.get('/settings', endpoint(async (_req, res) => res.json(await store.settings())));
router.put('/settings', endpoint(async (req, res) => {
    const config = await store.saveSettings(req.body);
    await store.audit(null, String(req.user.id), 'settings.updated');
    res.json(config);
}));
router.get('/setup', endpoint(async (req, res) => {
    const config = await store.settings();
    const origin = config.publicUrl || new URL(`${req.protocol}://${req.get('host')}`).origin;
    res.json({ endpointPath: CONFIG.BASE_PATH.slice(0, -1) + config.endpoint, publicUrl: origin,
        tools: registry.map(t => ({ name: t.name, permission: t.permission, risk: t.risk })), skillPath: 'agent-skills/minepanel/SKILL.md' });
}));
export = router;
