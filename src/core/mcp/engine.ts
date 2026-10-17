import { randomUUID } from 'crypto';
import { dbRun, dbGet } from '../../db/database';
import permissions = require('../permissions');
import { registry, redact, type ToolDefinition } from './registry';
import { identity as loadIdentity, settings, audit, expireApprovals, mcpEvents, type Identity } from './store';

let concurrent = 0;
// Serialize approval admission (COUNT + INSERT); SQLite claims serialize execution across callers.
let admission: Promise<void> = Promise.resolve();
export async function authorize(identity: Identity, tool: ToolDefinition, args: Record<string, unknown>) {
    const current = await loadIdentity(identity.id);
    if (!current?.enabled || current.keyVersion !== identity.keyVersion || !(await settings()).enabled) throw new Error('Identity revoked or MCP disabled');
    const serverId = tool.server ? String(args.serverId) : null;
    if (serverId && !current.allowedServers.includes(serverId)) throw new Error('Server access denied');
    if (tool.name !== 'servers_list' && !await permissions.hasPermission(`mcp:${current.id}`, serverId, tool.permission)) throw new Error('Permission denied');
    return current;
}
export async function executeTool(identity: Identity, name: string, input: unknown) {
    const tool = registry.find(t => t.name === name);
    if (!tool) throw new Error('Unknown tool');
    const args = tool.schema.parse(input) as Record<string, unknown>;
    if (/mp_mcp_[a-f0-9-]{36}_[A-Za-z0-9_-]{43}/.test(JSON.stringify(args))) throw new Error('Do not include authentication keys in operation arguments');
    const current = await authorize(identity, tool, args);
    const config = await settings();
    const needsApproval = current.approvalMode === 'everything' || current.approvalMode === 'dangerous' && tool.risk === 'dangerous';
    const id = randomUUID();
    const insert = admission.then(async () => {
        await expireApprovals();
        if (needsApproval) {
            const row = await dbGet("SELECT COUNT(*) AS count FROM mcp_approvals WHERE status='pending'");
            if (row.count >= config.maxPendingApprovals) throw new Error('Approval queue is full');
        }
        await dbRun(`INSERT INTO mcp_approvals(id,identity_id,key_version,tool,arguments,risk,server_id,created_at,expires_at,status) VALUES(?,?,?,?,?,?,?,?,?,?)`,
            [id, identity.id, identity.keyVersion, name, JSON.stringify(args), tool.risk, tool.server ? args.serverId : null, Date.now(), Date.now() + config.approvalExpirationMs, needsApproval ? 'pending' : 'approved']);
    });
    admission = insert.then(() => {}, () => {});
    await insert;
    await audit(identity.id, `mcp:${identity.id}`, needsApproval ? 'approval.requested' : 'operation.requested', name, id, tool.server ? String(args.serverId) : undefined);
    if (needsApproval) {
        mcpEvents.emit('changed');
        return { status: 'pending', approvalId: id, resultUri: `minepanel://operations/${id}`, expiresAt: Date.now() + config.approvalExpirationMs,
            message: 'A MinePanel administrator must approve the exact arguments. Read resultUri to poll; approval_result is also available outside Approve Everything mode. Do not repeat this call.' };
    }
    return approvalResult(identity, id);
}

export async function approvalResult(identity: Identity, id: string): Promise<Record<string, unknown>> {
    await expireApprovals();
    const row = await dbGet('SELECT * FROM mcp_approvals WHERE id=? AND identity_id=?', [id, identity.id]);
    if (!row) throw new Error('Request not found');
    const tool = registry.find(t => t.name === row.tool);
    if (!tool || row.key_version !== identity.keyVersion) throw new Error('Request revoked');
    const args = tool.schema.parse(JSON.parse(row.arguments)) as Record<string, unknown>;
    const current = await authorize(identity, tool, args);
    if (row.status !== 'approved') return { status: row.status, approvalId: id, ...(row.result ? { result: JSON.parse(row.result) } : {}) };
    if (!row.decided_by && (current.approvalMode === 'everything' || current.approvalMode === 'dangerous' && tool.risk === 'dangerous')) {
        await dbRun("UPDATE mcp_approvals SET status='pending' WHERE id=? AND status='approved'", [id]);
        mcpEvents.emit('changed');
        return { status: 'pending', approvalId: id, message: 'The current approval policy requires human approval.' };
    }
    const config = await settings();
    if (concurrent >= config.maxConcurrent) return { status: 'approved', approvalId: id, message: 'Operation capacity reached; poll again later.' };
    // Reserve before the async claim so concurrent requests cannot oversubscribe.
    concurrent++;
    let claimed: { changes: number };
    try { claimed = await dbRun("UPDATE mcp_approvals SET status='executing' WHERE id=? AND status='approved' AND expires_at>?", [id, Date.now()]); }
    catch (error) { concurrent--; throw error; }
    if (!claimed.changes) { concurrent--; return { status: 'executing', approvalId: id }; }
    const execution = (async () => {
        try {
            await authorize(identity, tool, args);
            const result = redact(await tool.execute(identity, args));
            const serialized = JSON.stringify(result ?? null);
            const bounded = Buffer.byteLength(serialized) <= 1048576 ? result : { message: 'Result exceeded 1 MiB; use a narrower query.' };
            await dbRun("UPDATE mcp_approvals SET status='completed',result=? WHERE id=?", [JSON.stringify(bounded ?? null), id]);
            await audit(identity.id, `mcp:${identity.id}`, 'operation.completed', tool.name, id, tool.server ? String(args.serverId) : undefined);
            return { status: 'completed', approvalId: id, result: bounded };
        } catch (_) {
            await dbRun("UPDATE mcp_approvals SET status='failed',result=? WHERE id=?", [JSON.stringify({ error: 'Operation failed or access changed. Inspect MinePanel before retrying.' }), id]);
            await audit(identity.id, `mcp:${identity.id}`, 'operation.failed', tool.name, id);
            return { status: 'failed', approvalId: id, error: 'Operation failed or access changed. Inspect MinePanel before retrying.' };
        } finally { concurrent--; mcpEvents.emit('changed'); }
    })();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<Record<string, unknown>>(resolve => {
        timer = setTimeout(() => resolve({ status: 'executing', approvalId: id, message: 'Operation continues. Poll approval_result; do not retry the mutation.' }), config.requestTimeoutMs);
    });
    const result = await Promise.race([execution, timeout]);
    clearTimeout(timer);
    return result;
}

export async function recoverInterruptedOperations() {
    // Unknown side effects after a process crash must never be automatically replayed.
    await dbRun("UPDATE mcp_approvals SET status='failed',result=? WHERE status='executing'", [JSON.stringify({ error: 'Panel restarted during execution; inspect the resource before submitting a new operation.' })]);
    await expireApprovals();
}

export function startApprovalMaintenance() {
    const timer = setInterval(() => { void expireApprovals().catch(() => {}); }, 15000);
    timer.unref();
    return () => clearInterval(timer);
}
