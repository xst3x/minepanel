import type { dbRun, dbAll } from '../database';

export const version = 27;
export const description = 'Grant MCP management permission to Owner, Admin and Manager ranks';
export async function up(run: typeof dbRun, _get: unknown, all: typeof dbAll) {
    const ranks = await all('SELECT id,global_permissions FROM ranks WHERE name IN (?,?,?)', ['Owner', 'Admin', 'Manager']);
    for (const rank of ranks) {
        const current: unknown = JSON.parse(rank.global_permissions || '[]');
        if (!Array.isArray(current) || current.some(p => typeof p !== 'string')) throw new Error('Invalid rank permission data');
        if (!current.includes('mcp.manage')) await run('UPDATE ranks SET global_permissions=? WHERE id=?', [JSON.stringify([...current, 'mcp.manage']), rank.id]);
    }
}
