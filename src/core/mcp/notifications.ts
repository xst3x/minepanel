import type WebSocket from 'ws';
import jwt = require('jsonwebtoken');
import { dbGet } from '../../db/database';
import { mcpEvents, expireApprovals } from './store';
import permissions = require('../permissions');

/** Permission-controlled panel user channel. Credentials remain in its first auth message. */
export function attachMcpNotifications(ws: WebSocket) {
    let token = '';
    let closed = false;
    const deadline = setTimeout(() => ws.close(4002, 'Authentication timeout'), 5000);
    const send = async () => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
            const user = await dbGet('SELECT role,disabled,valid_tokens_from FROM users WHERE id=?', [decoded.id]);
            if (!user || decoded.internal === true || user.disabled || decoded.iat < Number(user.valid_tokens_from || 0) || !await permissions.hasPermission(decoded.id, null, 'mcp.manage')) throw new Error('Unauthorized');
            await expireApprovals();
            const count = await dbGet("SELECT COUNT(*) AS count FROM mcp_approvals WHERE status='pending'");
            if (!closed && ws.readyState === 1) ws.send(JSON.stringify({ type: 'mcp_changed', pending: count.count }));
        } catch (_) { ws.close(4003, 'Access denied'); }
    };
    ws.on('message', data => {
        if (token || data.toString().length > 8192) return;
        try {
            const auth = JSON.parse(data.toString());
            if (auth.type !== 'auth' || typeof auth.token !== 'string') throw new Error('Invalid auth');
            token = auth.token;
            clearTimeout(deadline);
            mcpEvents.on('changed', send);
            void send();
        } catch (_) { ws.close(4001, 'Authentication required'); }
    });
    const refresh = setInterval(() => { if (token) void send(); }, 15000);
    ws.on('close', () => { closed = true; clearTimeout(deadline); clearInterval(refresh); mcpEvents.removeListener('changed', send); });
}
