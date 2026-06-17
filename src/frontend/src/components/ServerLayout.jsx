import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { api, getToken } from '../lib/api.js';
import { toast, showConfirm } from './Toast.jsx';

const TAB_ICONS = {
  overview:   <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  console:    <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  players:    <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  files:      <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  content:    <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-4h3a2 2 0 0 0 2-2v-3h4v-3h-4V7a2 2 0 0 0-2-2h-3V1H8v4H5a2 2 0 0 0-2 2v3H1v3h3v3a2 2 0 0 0 2 2h3v4z"/></svg>,
  properties: <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  backups:    <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  logs:       <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  ftp:        <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  settings:   <svg className="tab-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

const tabs = [
  ['overview',   'Overview'],
  ['console',    'Console'],
  ['players',    'Players'],
  ['files',      'Files'],
  ['content',    'Content'],
  ['properties', 'Properties'],
  ['backups',    'Backups'],
  ['logs',       'Logs'],
  ['ftp',        'FTP'],
  ['settings',   'Settings'],
];

export default function ServerLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverInfo, setServerInfo] = useState(null);
  const [status, setStatus] = useState('offline');
  const [permissions, setPermissions] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [metrics, setMetrics] = useState({
    cpu: 0,
    ram: 0,
    maxRam: 2048,
    players: 0,
    maxPlayers: 20,
    temp: '--°C'
  });
  const [consoleLines, setConsoleLines] = useState([]);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // Fetch server details
  const fetchServerDetails = async () => {
    try {
      const info = await api(`/api/servers/${id}`);
      setServerInfo(info);
      setStatus(info.status || 'offline');
      if (info.ram_mb) {
        setMetrics(m => ({ ...m, maxRam: info.ram_mb }));
      }
    } catch (e) {
      console.error('Failed to fetch server details:', e.message);
    }
  };

  // Fetch permissions
  const fetchPermissions = async () => {
    try {
      const data = await api(`/api/servers/${id}/my-permissions`);
      setPermissions(data.permissions || []);
      setIsAdmin(!!data.admin);
    } catch (e) {
      setPermissions([]);
      setIsAdmin(false);
    }
  };

  const hasPerm = (perm) => {
    if (isAdmin) return true;
    return permissions.includes('*') || permissions.includes('root') || permissions.includes(perm);
  };

  // Lifecycle control functions
  const sendControl = async (action) => {
    try {
      if (action === 'kill') {
        if (!await showConfirm('Force-kill the server process? This may cause data loss.', 'Force Kill')) return;
      }
      setConsoleLines(lines => [...lines, `> [Panel] Sending ${action} command...\n`]);
      await api(`/api/servers/${id}/${action}`, { method: 'POST' });
    } catch (e) {
      toast(e.message || 'Command failed.', 'error');
    }
  };

  // WebSocket Connection
  const connectWS = () => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }

    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?serverId=${id}`;
    
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token }));
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'console') {
        setConsoleLines(prev => {
          const next = [...prev, msg.data];
          return next.slice(-2000); // Keep last 2000 lines max
        });
      } else if (msg.type === 'history') {
        setConsoleLines(msg.data || []);
      } else if (msg.type === 'clear_console') {
        setConsoleLines([]);
      } else if (msg.type === 'status') {
        setStatus(msg.data);
        // Notify the sidebar immediately so it can refresh server status
        window.dispatchEvent(new CustomEvent('mp:server-status-changed'));
      } else if (msg.type === 'stats') {
        const ramMb = Math.round(msg.data.ram / 1024 / 1024);
        setMetrics(m => ({
          ...m,
          cpu: Math.min(100, msg.data.cpu),
          ram: ramMb
        }));
      }
    };

    socket.onclose = () => {
      setStatus('offline');
      reconnectAttemptsRef.current++;
      const delay = Math.min(5000, 1000 * reconnectAttemptsRef.current);
      reconnectTimeoutRef.current = setTimeout(connectWS, delay);
    };

    socket.onerror = () => {
      socket.close();
    };
  };

  const sendConsoleCommand = (cmd) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', data: cmd }));
      setConsoleLines(prev => [...prev, `> ${cmd}\n`]);
    }
  };

  const clearConsoleLines = () => {
    setConsoleLines([]);
  };

  useEffect(() => {
    fetchServerDetails();
    fetchPermissions();
    connectWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [id]);

  // Pull temperature from document/system metrics if visible
  useEffect(() => {
    const checkTemp = () => {
      const sysTempEl = document.getElementById('sys-temp');
      if (sysTempEl) {
        setMetrics(m => ({ ...m, temp: sysTempEl.textContent }));
      }
    };
    checkTemp();
    const interval = setInterval(checkTemp, 5000);
    return () => clearInterval(interval);
  }, []);

  const currentHost = window.location.hostname;
  const serverAddress = serverInfo ? `${currentHost}:${serverInfo.port}` : '...';

  // Filter tabs by permissions
  const TAB_PERMS = {
    overview: null,
    console: 'server.console.read',
    files: 'server.files.read',
    content: 'server.plugins.read',
    players: 'server.players.read',
    properties: 'server.properties.read',
    backups: 'server.backups.read',
    logs: 'server.logs.read',
    settings: 'account.manage',
    ftp: 'server.ftp.access'
  };

  const isBedrock = serverInfo?.software?.toLowerCase() === 'bedrock';

  // Tabs not applicable to Bedrock servers (plugins/mods don't exist, players API is Java-only)
  const BEDROCK_HIDDEN_TABS = new Set(['content', 'players']);

  const visibleTabs = tabs.filter(([slug]) => {
    if (isBedrock && BEDROCK_HIDDEN_TABS.has(slug)) return false;
    const reqPerm = TAB_PERMS[slug];
    return reqPerm === null || hasPerm(reqPerm);
  });

  return (
    <div className="server-view">
      <div className="server-view-sticky">
        <button className="back-btn" onClick={() => navigate('/panel')}>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Servers
        </button>

        <div className="server-header-card">
          <div className="sh-info">
            <div className="sh-icon" id="sh-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--accent)" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
                <path d="M2 7v10" /><path d="M12 12v10" /><path d="M22 7v10" />
              </svg>
            </div>
            <div>
              <h2 id="sh-name">{serverInfo?.name || 'Server'}</h2>
              <p className="sh-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>
                  <span id="sh-software">{serverInfo?.software || 'Minecraft'}</span>{' '}
                  <span id="sh-version">{serverInfo?.version || ''}</span> &mdash;{' '}
                  <span id="sh-address">{serverAddress}</span>
                </span>
                <span className={`status-badge ${status}`} id="sh-status">
                  {status.toUpperCase()}
                </span>
              </p>
            </div>
          </div>
          <div className="sh-actions" style={{ flexWrap: 'nowrap', gap: '0.4rem' }}>
            {hasPerm('server.start') && <button className="btn success" onClick={() => sendControl('start')}>Start</button>}
            {hasPerm('server.stop') && <button className="btn danger" onClick={() => sendControl('stop')}>Stop</button>}
            {hasPerm('server.stop') && <button className="btn outline" onClick={() => sendControl('restart')}>Restart</button>}
            {hasPerm('server.stop') && <button className="btn danger" onClick={() => sendControl('kill')} title="Force-kill process">Kill</button>}
          </div>
        </div>

        <nav className="sub-nav">
          {visibleTabs.map(([slug, label]) => (
            <NavLink
              key={slug}
              to={slug}
              className={({ isActive }) => 'sub-nav-item' + (isActive ? ' active' : '')}
            >
              {TAB_ICONS[slug]}
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="server-tab-body">
        <Outlet context={{
          serverId: id,
          serverInfo,
          status,
          metrics,
          consoleLines,
          sendConsoleCommand,
          clearConsoleLines,
          permissions,
          isAdmin,
          hasPerm,
          reloadServerInfo: fetchServerDetails
        }} />
      </div>
    </div>
  );
}
