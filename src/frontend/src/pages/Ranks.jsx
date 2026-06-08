import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function Ranks() {
  const [ranks, setRanks] = useState([]);
  const [servers, setServers] = useState([]);
  const [allPerms, setAllPerms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal / Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingRank, setEditingRank] = useState(null); // null means Creating new rank

  // Form states
  const [rankName, setRankName] = useState('');
  const [rankColor, setRankColor] = useState('#3b82f6');
  const [localGlobalPerms, setLocalGlobalPerms] = useState([]);
  const [localServerPerms, setLocalServerPerms] = useState({}); // { [serverId]: [perms] }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const ranksData = await api('/api/ranks');
      const serversData = await api('/api/servers');
      const permsData = await api('/api/users/permissions');
      
      setRanks(ranksData || []);
      setServers(serversData || []);
      setAllPerms(permsData || []);
    } catch (err) {
      alert('Failed to load ranks data: ' + err.message);
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
    setEditingRank(null);
    setRankName('');
    setRankColor('#3b82f6');
    setLocalGlobalPerms([]);
    setLocalServerPerms({});
    setShowEditor(true);
  };

  const handleDeleteRank = async (rank) => {
    if (!confirm(`Are you sure you want to delete the rank "${rank.name}"?`)) return;
    try {
      await api(`/api/ranks/${rank.id}/delete`, { method: 'POST' });
      alert('Rank deleted successfully.');
      loadData();
    } catch (err) {
      alert('Failed to delete rank: ' + err.message);
    }
  };

  const handleSaveRank = async () => {
    if (!rankName) return alert('Rank name is required.');

    try {
      if (editingRank) {
        // Update rank
        await api(`/api/ranks/${editingRank.id}`, {
          method: 'PUT',
          body: {
            name: rankName,
            color: rankColor,
            global: localGlobalPerms,
            servers: localServerPerms
          }
        });
        alert('Rank updated successfully.');
      } else {
        // Create rank
        const res = await api('/api/ranks/create', {
          method: 'POST',
          body: { name: rankName, color: rankColor }
        });
        
        // Immediately update perms
        await api(`/api/ranks/${res.rankId}`, {
          method: 'PUT',
          body: {
            name: rankName,
            color: rankColor,
            global: localGlobalPerms,
            servers: localServerPerms
          }
        });
        alert('Rank created successfully.');
      }
      setShowEditor(false);
      loadData();
    } catch (err) {
      alert('Failed to save rank: ' + err.message);
    }
  };

  const toggleGlobalPerm = (key, checked) => {
    if (checked) {
      setLocalGlobalPerms(prev => [...prev, key]);
    } else {
      setLocalGlobalPerms(prev => prev.filter(k => k !== key));
    }
  };

  const toggleServerPerm = (serverId, key, checked) => {
    setLocalServerPerms(prev => {
      const current = prev[serverId] || [];
      const updated = checked ? [...current, key] : current.filter(k => k !== key);
      return { ...prev, [serverId]: updated };
    });
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Ranks Management</h2>
        <button className="btn primary" onClick={handleCreateClick}>+ Create Rank</button>
      </div>

      {loading ? (
        <p className="text-muted">Loading ranks...</p>
      ) : (
        <div className="ranks-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {ranks.map(r => {
            const globalCount = (r.global_permissions || []).length;
            let serverCount = 0;
            if (r.permissions) {
              Object.values(r.permissions).forEach(arr => {
                if (Array.isArray(arr)) serverCount += arr.length;
              });
            }
            
            const isAllGlobal = (r.global_permissions || []).includes('*') || (r.global_permissions || []).includes('root');
            const allGlobalLabel = isAllGlobal ? 'ALL' : (r.global_permissions || []).join(', ');
            const permsLabel = `Global: ${allGlobalLabel || 'None'}`;

            return (
              <div
                key={r.id}
                className="rank-card"
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  borderTop: `4px solid ${r.color}`,
                  padding: '2.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  position: 'relative'
                }}
              >
                <h3 style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: r.color }}>{r.name}</span>
                  {r.is_builtin && (
                    <span className="status-badge" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                      Built-in
                    </span>
                  )}
                </h3>
                
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong>Scope:</strong> {globalCount} global, {serverCount} server perms
                  <div style={{ fontSize: '0.72rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0.25rem' }} title={permsLabel}>
                    {permsLabel}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                  <button className="btn outline small" onClick={() => handleEditClick(r)}>Edit</button>
                  {!r.is_builtin && (
                    <button className="btn danger small" onClick={() => handleDeleteRank(r)}>Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RANK EDITOR / MATRIX MODAL */}
      {showEditor && (
        <div className="modal-overlay active" onClick={() => setShowEditor(false)}>
          <div className="modal large" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRank ? `Edit Rank â€” ${editingRank.name}` : 'Create Custom Rank'}</h3>
              <button className="close-btn" onClick={() => setShowEditor(false)}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Rank Name</label>
                  <input
                    type="text"
                    value={rankName}
                    onChange={(e) => setRankName(e.target.value)}
                    placeholder="e.g. Moderator"
                    disabled={editingRank?.is_builtin}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Rank Color</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={rankColor}
                      onChange={(e) => setRankColor(e.target.value)}
                      style={{ padding: 0, width: '40px', height: '38px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'none' }}
                    />
                    <input
                      type="text"
                      value={rankColor}
                      onChange={(e) => setRankColor(e.target.value)}
                      placeholder="#3b82f6"
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              </div>

              {/* Permissions Matrix */}
              <h4 style={{ marginBottom: '0.75rem' }}>Permissions Matrix</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px' }}>Permission</th>
                    <th style={{ padding: '8px' }}>Global</th>
                    {servers.map(s => (
                      <th key={s.id} style={{ padding: '8px' }}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [];
                    let lastGroup = '';

                    allPerms.forEach(p => {
                      if (p.group !== lastGroup) {
                        lastGroup = p.group;
                        rows.push(
                          <tr key={`group-${p.group}`} style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={servers.length + 2} style={{ padding: '6px 8px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--accent)' }}>
                              {p.group}
                            </td>
                          </tr>
                        );
                      }

                      const isGlobalChecked = localGlobalPerms.includes(p.key);

                      rows.push(
                        <tr key={p.key} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px' }}>
                            <div style={{ fontWeight: '600' }}>{p.label}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.key}</div>
                          </td>
                          
                          {/* Global Checkbox */}
                          <td style={{ padding: '8px' }}>
                            <input
                              type="checkbox"
                              checked={isGlobalChecked}
                              onChange={(e) => toggleGlobalPerm(p.key, e.target.checked)}
                            />
                          </td>

                          {/* Server-specific checkboxes */}
                          {servers.map(s => {
                            const isServerChecked = (localServerPerms[s.id] || []).includes(p.key);
                            const isDisabledColumn = p.globalOnly || p.key === 'account.manage' || p.key === 'panel.settings';

                            return (
                              <td key={s.id} style={{ padding: '8px' }}>
                                {isDisabledColumn ? (
                                  <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>â€”</span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isServerChecked}
                                    onChange={(e) => toggleServerPerm(s.id, p.key, e.target.checked)}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button className="btn outline" onClick={() => setShowEditor(false)}>Cancel</button>
              <button className="btn primary" onClick={handleSaveRank}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
