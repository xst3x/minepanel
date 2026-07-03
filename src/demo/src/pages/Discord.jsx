import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { toast, showConfirm } from '../components/Toast.jsx';
import { showRestrictionWarning } from '../components/DemoBanner.jsx';
import '../styles/pages/Discord.css';

export default function Discord() {
  const navigate = useNavigate();
  const [bots, setBots] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showEditor, setShowEditor] = useState(false);
  const [editingBot, setEditingBot] = useState(null);
  const [botToken, setBotToken] = useState('');
  const [guildId, setGuildId] = useState('');
  const [selectedServerIds, setSelectedServerIds] = useState([]);

  useEffect(() => { loadBots(); }, []);

  const loadBots = async () => {
    setLoading(true);
    try {
      const list = await api('/api/discord/bots');
      setBots(list || []);
      const srvs = await api('/api/discord/bots/servers');
      setServers(srvs || []);
    } catch (err) {
      toast('Failed to load Discord bots: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    showRestrictionWarning('discord.bot.create');
  };

  const handleOpenEdit = (bot) => {
    showRestrictionWarning('discord.bot.edit');
  };

  const handleToggleBot = async (bot, checked) => {
    toast('Bot toggle is disabled in demo mode.', 'info');
  };

  const handleDeleteBot = async (bot) => {
    showRestrictionWarning('discord.bot.delete');
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
      <button className="back-btn" onClick={() => navigate('/panel')} style={{ marginBottom: '1rem' }}>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Servers
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Discord Integration</h2>
        <button className="btn primary" onClick={handleOpenCreate}>+ Add Bot</button>
      </div>

      {loading ? (
        <p className="text-muted">Loading Discord bots...</p>
      ) : bots.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>No Discord bots configured yet.</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>Bot management is read-only in demo mode.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {bots.map(bot => {
            const onlineColor = bot.online ? '#22c55e' : '#ef4444';
            const enabledLabel = bot.enabled ? 'Enabled' : 'Disabled';
            const serverCount = (bot.serverIds || []).length;

            return (
              <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', border: '2px solid var(--border-color)', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: 'var(--text-muted)' }}>
                      🤖
                    </div>
                    <span style={{ position: 'absolute', bottom: '1px', right: '1px', width: '12px', height: '12px', borderRadius: '50%', background: onlineColor, border: '2px solid var(--bg-card)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bot.username || 'Unknown Bot'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Guild: <code style={{ fontFamily: 'var(--font-mono)' }}>{bot.guildId}</code></div>
                  </div>
                  <span className={`status-badge ${bot.enabled ? (bot.online ? 'online' : 'offline') : 'offline'}`} style={{ flexShrink: 0 }}>{enabledLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span>{serverCount} server{serverCount !== 1 ? 's' : ''}</span>
                  <span>Added {getTimeAgo(bot.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button className="btn outline small" onClick={handleOpenEdit}>View</button>
                  <button className="btn danger small" onClick={handleDeleteBot}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
