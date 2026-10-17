import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { createServerSocket, getToken, demoMode } from '../lib/api';
import { toast } from './Toast';
import { canManageMcp } from '../lib/mcp';

export default function McpNotifications() {
  const { user } = useAuth();
  const previous = useRef(0);
  const allowed = canManageMcp(user);
  useEffect(() => {
    if (demoMode || !allowed) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    const connect = () => {
      const url = new URL('/ws?channel=mcp', window.location.origin);
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = createServerSocket(url.toString());
      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: getToken() }));
      socket.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'mcp_changed') return;
          if (data.pending > previous.current) toast(`${data.pending} MCP approval request${data.pending === 1 ? '' : 's'} waiting. Open MCP Servers to review.`, 'info');
          previous.current = data.pending;
          window.dispatchEvent(new CustomEvent('mp:mcp-changed'));
        } catch { /* Ignore unrelated frames. */ }
      };
      socket.onclose = event => { if (!disposed && ![4001,4002,4003].includes(event.code)) retry = setTimeout(connect, 5000); };
    };
    connect();
    return () => { disposed = true; clearTimeout(retry); socket?.close(); };
  }, [user?.id, allowed]);
  return null;
}
