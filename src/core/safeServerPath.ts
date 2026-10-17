import fs = require('fs');
import path = require('path');

/** Shared by the file GUI and MCP. Reject links, including existing ancestors of new files. */
export function safeServerPath(serverDir: string, targetPath = ''): string {
    const root = path.resolve(serverDir);
    const requested = path.resolve(root, targetPath.replace(/^[/\\]+/, ''));
    const relative = path.relative(root, requested);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Access denied: Path is outside server directory');
    let current = root;
    if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error('Access denied: Symbolic links are not allowed');
    for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Access denied: Symbolic links are not allowed'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return requested;
}

export function assertSafeTree(root: string, target = '', budget = { entries: 10000, bytes: 64 * 1024 * 1024 }) {
    const absolute = safeServerPath(root, target);
    if (!fs.existsSync(absolute)) return;
    const visit = (entry: string) => {
        if (--budget.entries < 0) throw new Error('Access denied: Directory is too large for this operation');
        const stat = fs.lstatSync(entry);
        if (stat.isSymbolicLink()) throw new Error('Access denied: Symbolic links are not allowed');
        if (stat.isDirectory()) for (const name of fs.readdirSync(entry)) visit(path.join(entry, name));
        else if ((budget.bytes -= stat.size) < 0) throw new Error('Access denied: Content is too large for this operation');
    };
    visit(absolute);
}
