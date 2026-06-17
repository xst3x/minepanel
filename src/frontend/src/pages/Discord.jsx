import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Discord() {
  const [bots, setBots] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Editor Modal State
  const [showEditor, setShowEditor] = useState(false);
  const [editingBot, setEditingBot] = useState(null); // null means creating a new bot

  // Editor Form States
  const [botToken, setBotToken] = useState('');
  const [guildId, setGuildId] = useState('');
  const [selectedServerIds, setSelectedServerIds] = useState([]);

  // Token validation state
  const [validating, setValidating] = useState(false);
  const [validatedBot, setValidatedBot] = useState(null);

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    setLoading(true);
    try {
      const list = await api('/api/discord/bots');
      setBots(list || []);
      
      const srvs = await api('/api/discord/bots/servers');
      setServers(srvs || []);
    } catch (err) {
      alert('Failed to load Discord bots: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingBot(null);
    setBotToken('');
    setGuildId('');
    setSelectedServerIds([]);
    setValidatedBot(null);
    setShowEditor(true);
  };

  const handleOpenEdit = (bot) => {
    setEditingBot(bot);
    setBotToken('');
    setGuildId(bot.guildId || '');
    setSelectedServerIds(bot.serverIds || []);
    setValidatedBot(null);
    setShowEditor(true);
  };

  const handleToggleBot = async (bot, checked) => {
    try {
      await api(`/api/discord/bots/${bot.id}/toggle`, {
        method: 'POST',
        body: { enabled: checked }
      });
      alert(`Bot ${checked ? 'enabled' : 'disabled'}`);
      // Refresh list after brief delay
      setTimeout(loadBots, 1500);
    } catch (err) {
      alert('Failed to toggle bot status: ' + err.message);
      loadBots(); // reload list
    }
  };

  const handleDeleteBot = async (bot) => {
    if (!confirm(`Delete bot "${bot.username || 'Bot'}"? This will remove all its Discord channels and roles.`)) return;
    try {
      await api(`/api/discord/bots/${bot.id}`, { method: 'DELETE' });
      alert('Bot deleted.');
      loadBots();
    } catch (err) {
      alert('Failed to delete bot: ' + err.message);
    }
  };

  const handleValidateToken = async () => {
    if (!botToken) return alert('Paste a bot token first');
    setValidating(true);
    setValidatedBot(null);
    try {
      const res = await api('/api/discord/bots/validate-token', {
        method: 'POST',
        body: { botToken }
      });
      if (res.valid && res.bot) {
        setValidatedBot(res.bot);
        alert('Token is valid!');
      } else {
        alert('Invalid bot token: ' + (res.error || 'Check server logs'));
      }
    } catch (err) {
      alert('Validation failed: ' + err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleSaveBot = async () => {
    if (!guildId) return alert('Guild ID is required');
    if (!/^\d{17,20}$/.test(guildId)) return alert('Guild ID must be a numeric ID (17-20 digits)');
    if (!editingBot && !botToken) return alert('Bot token is required for new bots');

    setActionLoading(true);
    try {
      if (editingBot) {
        // Edit existing bot
        const payload = { guildId, serverIds: selectedServerIds };
        if (botToken) {
          payload.botToken = botToken;
        }
        await api(`/api/discord/bots/${editingBot.id}`, {
          method: 'PUT',
          body: payload
        });
        alert('Bot updated successfully.');
      } else {
        // Create new bot
        await api('/api/discord/bots', {
          method: 'POST',
          body: { botToken, guildId, serverIds: selectedServerIds }
        });
        alert('Bot added and started!');
      }
      setShowEditor(false);
      loadBots();
    } catch (err) {
      alert('Failed to save bot: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleServerCheckboxChange = (serverId, checked) => {
    if (checked) {
      setSelectedServerIds(prev => [...prev, serverId]);
    } else {
      setSelectedServerIds(prev => prev.filter(id => id !== serverId));
    }
  };

  const getTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Discord Integration</h2>
        <button className="btn primary" onClick={handleOpenCreate}>+ Add Bot</button>
      </div>

      {loading ? (
        <p className="text-muted">Loading Discord bots...</p>
      ) : bots.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" strokeWidth="1.25" style={{ opacity: 0.3, marginBottom: '1rem', display: 'block', marginInline: 'auto' }}>
            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.36-.687.772-1.341 1.225-1.962a.077.077 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z" />
          </svg>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>No Discord bots configured yet.</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>Click <strong>Add Bot</strong> to connect your first Discord bot.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {bots.map(bot => {
            const onlineColor = bot.online ? '#22c55e' : '#ef4444';
            const onlineLabel = bot.online ? 'Online' : 'Offline';
            const enabledLabel = bot.enabled ? 'Enabled' : 'Disabled';
            const serverCount = (bot.serverIds || []).length;

            return (
              <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={bot.avatar || ''}
                      alt=""
                      style={{ width: '52px', height: '52px', borderRadius: '50%', border: '2px solid var(--border-color)', background: 'var(--bg-input)' }}
                      onError={(e) => {
                        e.target.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 52 52'><rect width='52' height='52' fill='%23333'><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='20' fill='%23aaa'>${(bot.username || '?')[0].toUpperCase()}</text></rect></svg>`;
                      }}
                    />
                    <span
                      style={{ position: 'absolute', bottom: '1px', right: '1px', width: '12px', height: '12px', borderRadius: '50%', background: onlineColor, border: '2px solid var(--bg-card)' }}
                      title={onlineLabel}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {bot.username || 'Unknown Bot'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Guild: <code style={{ fontFamily: 'var(--font-mono)' }}>{bot.guildId}</code>
                    </div>
                  </div>
                  <span className={`status-badge ${bot.enabled ? (bot.online ? 'online' : 'offline') : 'offline'}`} style={{ flexShrink: 0 }}>
                    {enabledLabel}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" strokeWidth="1.75">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                    </svg>
                    {serverCount} server{serverCount !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="1.75">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Added {getTimeAgo(bot.createdAt)}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={!!bot.enabled}
                        onChange={(e) => handleToggleBot(bot, e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{bot.enabled ? 'Running' : 'Stopped'}</span>
                  </label>
                  <button className="btn outline small" onClick={() => handleOpenEdit(bot)}>
                    Edit
                  </button>
                  <button className="btn danger small" onClick={() => handleDeleteBot(bot)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BOT EDITOR MODAL */}
      {showEditor && (
        <div className="modal-overlay active" onClick={() => setShowEditor(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingBot ? 'Edit Discord Bot' : 'Add Discord Bot'}</h3>
              <button className="close-btn" onClick={() => setShowEditor(false)}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <div className="form-group">
                <label>Bot Token</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={editingBot ? ' (leave blank to keep current)' : 'Bot Token'}
                    style={{ flex: 1 }}
                  />
                  <button className="btn outline" onClick={handleValidateToken} disabled={validating || !botToken}>
                    {validating ? 'Checking...' : 'Validate'}
                  </button>
                </div>
              </div>

              {validatedBot && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                  <img
                    src={validatedBot.avatar || ''}
                    alt=""
                    style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                    onError={(e) => {
                      e.target.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23333'><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%23aaa'>Bot</text></rect></svg>`;
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
                      {validatedBot.username}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified Bot Details</div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Guild (Server) ID</label>
                <input
                  type="text"
                  value={guildId}
                  onChange={(e) => setGuildId(e.target.value)}
                  placeholder="e.g. 102938475620192837"
                />
              </div>

              <div className="form-group">
                <label>Link to Minecraft Servers</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', padding: '0.25rem' }}>
                  {servers.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>No Minecraft servers found. Create one first.</p>
                  ) : (
                    servers.map(sv => {
                      const isChecked = selectedServerIds.includes(sv.id);
                      return (
                        <label key={sv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.875rem', background: 'var(--bg-input)' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleServerCheckboxChange(sv.id, e.target.checked)}
                          />
                          <span style={{ flex: 1, color: 'var(--text)' }}>{sv.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sv.software} {sv.version}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button className="btn outline" onClick={() => setShowEditor(false)}>Cancel</button>
              <button className="btn primary" onClick={handleSaveBot} disabled={actionLoading}>
                {actionLoading ? 'Saving...' : 'Save Bot'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
