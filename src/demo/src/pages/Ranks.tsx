import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { toast, showConfirm } from '../components/Toast.jsx';
import { showRestrictionWarning } from '../components/DemoBanner.jsx';
import '../styles/pages/Ranks.css';

export default function Ranks() {
  const navigate = useNavigate();
  const [ranks, setRanks]       = useState([]);
  const [servers, setServers]   = useState([]);
  const [allPerms, setAllPerms] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRank, setEditingRank] = useState(null);
  const [rankName, setRankName] = useState('');
  const [rankColor, setRankColor] = useState('#3b82f6');
  const [localGlobalPerms, setLocalGlobalPerms] = useState([]);
  const [localServerPerms, setLocalServerPerms] = useState({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ranksData, serversData, permsData] = await Promise.all([
        api('/api/ranks'),
        api('/api/servers'),
        api('/api/users/permissions'),
      ]);
      const sorted = (ranksData || []).slice().sort((a, b) => {
        const aOwner = a.name?.toLowerCase() === 'owner' || (a.is_builtin && (a.global_permissions || []).includes('*'));
        const bOwner = b.name?.toLowerCase() === 'owner' || (b.is_builtin && (b.global_permissions || []).includes('*'));
        if (aOwner && !bOwner) return -1;
        if (!aOwner && bOwner) return 1;
        return 0;
      });
      setRanks(sorted);
      setServers(serversData || []);
      setAllPerms(permsData || []);
    } catch (err) {
      toast('Failed to load ranks: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (rank) => {
    setEditingRank(rank);
    setRankName(rank.name);
    setRankColor(rank.color);
    setLocalGlobalPerms(rank.global_permissions || []);
    setLocalServerPerms(rank.permissions || {});
    setShowEditor(true);
  };

  const handleCreateClick = () => {
    showRestrictionWarning('server.create.max'); // reuse
  };

  const handleDeleteRank = async (rank) => {
    showRestrictionWarning('server.delete');
  };

  const handleSaveRank = async () => {
    showRestrictionWarning('settings.save');
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <button className="back-btn" onClick={() => navigate('/panel')} style={{ marginBottom: '1rem' }}>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Servers
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Ranks Management</h2>
        <button className="btn primary small" onClick={handleCreateClick}>+ Create Rank</button>
      </div>

      {loading ? (
        <p className="text-muted">Loading ranks...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {ranks.map((r, idx) => {
            const globalCount = (r.global_permissions || []).length;
            let serverCount = 0;
            if (r.permissions) Object.values(r.permissions).forEach(arr => { if (Array.isArray(arr)) serverCount += arr.length; });
            const isAllGlobal = (r.global_permissions || []).includes('*') || (r.global_permissions || []).includes('root');
            const [rc, gc, bc] = ((hex) => { const m = hex.replace('#','').match(/.{2}/g); return m ? m.map(h => parseInt(h,16)) : [99,102,241]; })(r.color || '#3b82f6');

            return (
              <div key={r.id} style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                borderLeft: `5px solid ${r.color || '#3b82f6'}`,
                padding: '1.1rem 1.25rem',
                display: 'flex', alignItems: 'center', gap: '1rem',
                transition: 'all 0.18s ease',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: r.color || '#3b82f6', boxShadow: `0 0 12px rgba(${rc},${gc},${bc},0.35)` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: r.color || 'var(--text-primary)' }}>{r.name}</span>
                    {r.is_builtin && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.45rem', borderRadius: 4, background: `rgba(${rc},${gc},${bc},0.12)`, color: r.color, fontWeight: 600, letterSpacing: '0.04em' }}>BUILT-IN</span>}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {globalCount} global perm{globalCount !== 1 ? 's' : ''}{serverCount > 0 && ` · ${serverCount} server perm${serverCount !== 1 ? 's' : ''}`}{isAllGlobal && <span style={{ color: r.color, fontWeight: 600 }}> · ALL permissions</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <button className="btn outline small" onClick={() => handleEditClick(r)}>View</button>
                  {!r.is_builtin && <button className="btn danger small" onClick={() => handleDeleteRank(r)}>Delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showEditor && (
        <div className="modal-overlay active" onClick={() => setShowEditor(false)}>
          <div className="modal large" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRank ? `View Rank — ${editingRank.name}` : 'Create Custom Rank'}</h3>
              <button className="close-btn" onClick={() => setShowEditor(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p>Rank editing is read-only in the demo version.</p>
              <p>Permissions are visible but cannot be modified.</p>
              <p>Download the full version at <a href="https://github.com/xst3x/minepanel" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>github.com/xst3x/minepanel</a></p>
            </div>
            <div className="modal-footer">
              <button className="btn primary" onClick={() => setShowEditor(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
