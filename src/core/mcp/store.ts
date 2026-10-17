import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'crypto';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { dbRun, dbGet, dbAll } from '../../db/database';
import permissions = require('../permissions');

export const mcpEvents = new EventEmitter();
export const settingsSchema = z.object({
    enabled: z.boolean().default(false), endpoint: z.string().regex(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/).default('/mcp'),
    publicUrl: z.union([z.literal(''), z.url().refine(v => { const url = new URL(v); return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password; }, 'Use only an HTTPS origin, without a path or credentials')]).default(''),
    allowedOrigins: z.array(z.url()).max(20).default([]),
    requestsPerMinute: z.number().int().min(1).max(10000).default(300),
    identityRequestsPerMinute: z.number().int().min(1).max(1000).default(60),
    maxConcurrent: z.number().int().min(1).max(32).default(4),
    maxPendingApprovals: z.number().int().min(1).max(1000).default(100),
    requestTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
    approvalExpirationMs: z.number().int().min(10000).max(86400000).default(300000),
    maxRequestBytes: z.number().int().min(1024).max(1048576).default(262144)
}).strict();
export type McpSettings = z.infer<typeof settingsSchema>;
const knownPermissions = new Set([...permissions.AVAILABLE_PERMISSIONS.filter(p => p.key !== 'mcp.manage').map(p => p.key), 'server.create', 'server.plugins.install']);
export const identitySchema = z.object({
    name: z.string().trim().min(1).max(100), description: z.string().max(1000).default(''),
    rankId: z.number().int().positive().nullable(),
    overrides: z.record(z.string().refine(p => knownPermissions.has(p), 'Unknown permission'), z.boolean()).default({}),
    allowedServers: z.array(z.string().regex(/^\d+$/)).max(1000).default([]),
    approvalMode: z.enum(['full', 'dangerous', 'everything']).default('dangerous'),
    requestsPerMinute: z.number().int().min(1).max(1000).default(60), enabled: z.boolean().default(true)
}).strict();
export type IdentityInput = z.infer<typeof identitySchema>;
export type Identity = IdentityInput & { id: string; keyVersion: number; createdAt: number; lastUsedAt: number | null };
type IdentityRow = { id: string; name: string; description: string; rank_id: number | null; overrides: string; allowed_servers: string;
    approval_mode: Identity['approvalMode']; requests_per_minute: number; enabled: number; key_version: number; created_at: number; last_used_at: number | null; key_hash: string };
function decode(row: IdentityRow): Identity {
    return { id: row.id, name: row.name, description: row.description, rankId: row.rank_id, overrides: JSON.parse(row.overrides),
        allowedServers: JSON.parse(row.allowed_servers), approvalMode: row.approval_mode, requestsPerMinute: row.requests_per_minute,
        enabled: !!row.enabled, keyVersion: row.key_version, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}
const hash = (key: string) => createHash('sha256').update(key).digest();
export async function settings(): Promise<McpSettings> {
    const row = await dbGet('SELECT value FROM mcp_settings WHERE id = 1');
    return settingsSchema.parse(row ? JSON.parse(row.value) : {});
}
export async function saveSettings(input: unknown) {
    const value = settingsSchema.parse(input);
    if (/^\/(api|ws|health|metrics|avatars|index\.html|servers|server|panel|settings|users|ranks|docs|profile|login|accounts|discord|mcp-servers)(\/|$)/.test(value.endpoint)) throw new Error('Reserved endpoint');
    await dbRun('INSERT INTO mcp_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', [JSON.stringify(value)]);
    mcpEvents.emit('changed');
    return value;
}
export async function identities(): Promise<Identity[]> { return (await dbAll('SELECT * FROM mcp_identities ORDER BY created_at DESC')).map(decode); }
export async function identity(id: string): Promise<Identity | null> {
    const row = await dbGet('SELECT * FROM mcp_identities WHERE id = ?', [id]);
    return row ? decode(row) : null;
}
async function validateReferences(input: IdentityInput) {
    if (input.rankId && !await dbGet('SELECT id FROM ranks WHERE id = ?', [input.rankId])) throw new Error('Rank not found');
    for (const server of input.allowedServers) if (!await dbGet('SELECT id FROM servers WHERE id = ?', [server])) throw new Error('Server not found');
}
export async function createIdentity(input: unknown, actor: string) {
    const value = identitySchema.parse(input);
    await validateReferences(value);
    const id = randomUUID();
    const key = `mp_mcp_${id}_${randomBytes(32).toString('base64url')}`;
    await dbRun(`INSERT INTO mcp_identities(id,name,description,key_hash,rank_id,overrides,allowed_servers,approval_mode,requests_per_minute,enabled,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [id, value.name, value.description, hash(key).toString('hex'), value.rankId, JSON.stringify(value.overrides),
        JSON.stringify(value.allowedServers), value.approvalMode, value.requestsPerMinute, Number(value.enabled), Date.now()]);
    await audit(id, actor, 'identity.created');
    return { identity: await identity(id), key };
}
export async function updateIdentity(id: string, input: unknown, actor: string) {
    const value = identitySchema.parse(input);
    await validateReferences(value);
    if (!await identity(id)) throw new Error('Identity not found');
    await dbRun(`UPDATE mcp_identities SET name=?,description=?,rank_id=?,overrides=?,allowed_servers=?,approval_mode=?,requests_per_minute=?,enabled=? WHERE id=?`,
        [value.name, value.description, value.rankId, JSON.stringify(value.overrides), JSON.stringify(value.allowedServers), value.approvalMode,
            value.requestsPerMinute, Number(value.enabled), id]);
    if (!value.enabled) await dbRun("UPDATE mcp_approvals SET status='denied' WHERE identity_id=? AND status IN ('pending','approved')", [id]);
    await audit(id, actor, 'identity.updated');
    mcpEvents.emit('changed');
    return identity(id);
}
export async function rotateKey(id: string, actor: string, revoke = false) {
    if (!await identity(id)) throw new Error('Identity not found');
    const key = `mp_mcp_${id}_${randomBytes(32).toString('base64url')}`;
    await dbRun('UPDATE mcp_identities SET key_hash=?,key_version=key_version+1,enabled=CASE WHEN ? THEN 0 ELSE enabled END WHERE id=?', [hash(key).toString('hex'), Number(revoke), id]);
    await dbRun("UPDATE mcp_approvals SET status='denied' WHERE identity_id=? AND status IN ('pending','approved')", [id]);
    await audit(id, actor, revoke ? 'key.revoked' : 'key.rotated');
    mcpEvents.emit('changed');
    return revoke ? { revoked: true } : { key };
}
export async function authenticate(key: string): Promise<Identity | null> {
    const match = /^mp_mcp_([a-f0-9-]{36})_[A-Za-z0-9_-]{43}$/.exec(key);
    if (!match) return null;
    const row: IdentityRow = await dbGet('SELECT * FROM mcp_identities WHERE id = ?', [match[1]]);
    const expected = Buffer.from(row?.key_hash || '0'.repeat(64), 'hex');
    if (expected.length !== 32 || !timingSafeEqual(hash(key), expected) || !row?.enabled) return null;
    await dbRun('UPDATE mcp_identities SET last_used_at=? WHERE id=?', [Date.now(), row.id]);
    return decode(row);
}
export async function audit(id: string | null, actor: string, event: string, tool?: string, approvalId?: string, serverId?: string) {
    // Deliberately no arguments, results or credential material in audit records.
    await dbRun('INSERT INTO mcp_audit(identity_id,actor,event,tool,approval_id,server_id,created_at) VALUES(?,?,?,?,?,?,?)',
        [id, actor, event, tool || null, approvalId || null, serverId || null, Date.now()]);
}
export async function expireApprovals() {
    const rows = await dbAll("SELECT id,identity_id,tool,server_id FROM mcp_approvals WHERE status IN ('pending','approved') AND expires_at<=?", [Date.now()]);
    for (const row of rows) {
        const expired = await dbRun("UPDATE mcp_approvals SET status='expired' WHERE id=? AND status IN ('pending','approved') AND expires_at<=?", [row.id, Date.now()]);
        if (expired.changes) await audit(row.identity_id, 'system', 'approval.expired', row.tool, row.id, row.server_id);
    }
}
export async function approvals(id?: string) {
    await expireApprovals();
    const limit = Math.max(200, (await settings()).maxPendingApprovals);
    return dbAll(`SELECT a.*, i.name AS identity_name FROM mcp_approvals a JOIN mcp_identities i ON i.id=a.identity_id ${id ? 'WHERE identity_id=?' : ''}
        ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`, id ? [id, limit] : [limit]);
}
export async function decide(id: string, approved: boolean, actor: string) {
    await expireApprovals();
    const result = await dbRun(`UPDATE mcp_approvals SET status=?,decided_by=?,decided_at=? WHERE id=? AND status='pending'
        AND EXISTS(SELECT 1 FROM mcp_identities i WHERE i.id=mcp_approvals.identity_id AND i.enabled=1 AND i.key_version=mcp_approvals.key_version)`,
        [approved ? 'approved' : 'denied', actor, Date.now(), id]);
    if (!result.changes) throw new Error('Request is no longer pending');
    const row = await dbGet('SELECT identity_id,tool,server_id FROM mcp_approvals WHERE id=?', [id]);
    await audit(row.identity_id, actor, approved ? 'approval.approved' : 'approval.denied', row.tool, id, row.server_id);
    mcpEvents.emit('changed');
}
