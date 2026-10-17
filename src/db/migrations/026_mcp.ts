import type { dbRun as run } from '../database';

// Existing installations may already reserve 24/25 for authorization/FK migrations.
// Idempotent creation also preserves installations that applied our earlier v24.
export const version = 26;
export const description = 'Native MCP identities, settings, approvals and audit';
export async function up(dbRun: typeof run) {
    await dbRun(`CREATE TABLE IF NOT EXISTS mcp_identities (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        key_hash TEXT NOT NULL, key_version INTEGER NOT NULL DEFAULT 1,
        rank_id INTEGER REFERENCES ranks(id) ON DELETE SET NULL,
        overrides TEXT NOT NULL DEFAULT '{}', allowed_servers TEXT NOT NULL DEFAULT '[]',
        approval_mode TEXT NOT NULL CHECK(approval_mode IN ('full','dangerous','everything')),
        requests_per_minute INTEGER NOT NULL DEFAULT 60, enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, last_used_at INTEGER
    )`);
    await dbRun(`CREATE TABLE IF NOT EXISTS mcp_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)`);
    await dbRun(`CREATE TABLE IF NOT EXISTS mcp_approvals (
        id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES mcp_identities(id),
        key_version INTEGER NOT NULL, tool TEXT NOT NULL, arguments TEXT NOT NULL,
        risk TEXT NOT NULL, server_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','expired','executing','completed','failed')),
        decided_by INTEGER REFERENCES users(id), decided_at INTEGER, result TEXT
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS mcp_approvals_status ON mcp_approvals(status, expires_at)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS mcp_approvals_identity ON mcp_approvals(identity_id, created_at)`);
    await dbRun(`CREATE TABLE IF NOT EXISTS mcp_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, identity_id TEXT REFERENCES mcp_identities(id),
        actor TEXT NOT NULL, event TEXT NOT NULL, tool TEXT, approval_id TEXT,
        server_id TEXT, created_at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '{}'
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS mcp_audit_identity ON mcp_audit(identity_id, created_at)`);
}
