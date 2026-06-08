import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { toast, showConfirm } from '../components/Toast.jsx';

export default function Ranks() {
  const [ranks, setRanks]       = useState([]);
  const [servers, setServers]   = useState([]);
  const [allPerms, setAllPerms] = useState([]);
  const [loading, setLoading]   = useState(true);

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const [dragIdx, setDragIdx]         = useState(null);
  const [dragOver, setDragOver]       = useState(null);
  const savingOrder = useRef(false);

  // Editor modal
  const [showEditor, setShowEditor]   = useState(false);
  const [editingRank, setEditingRank] = useState(null);
  const [rankName, setRankName]       = useState('');
  const [rankColor, setRankColor]     = useState('#3b82f6');
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
      setRanks(ranksData || []);
      setServers(serversData || []);
      setAllPerms(permsData || []);
    } catch (err) {
      toast('Failed to load ranks: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Drag-and-drop reorder ────────────────────────────────────────────────
  const onDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEnter = (idx) => setDragOver(idx);
  const onDragOver  = (e) => e.preventDefault();
  const onDrop = (e, dropIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) return;
    const next = [...ranks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    setRanks(next);
    setDragIdx(null);
    setDragOver(null);
  };
  const onDragEnd = () => { setDragIdx(null); setDragOver(null); };

  const saveOrder = async () => {
    if (savingOrder.current) return;
    savingOrder.current = true;
    try {
      await api('/api/ranks/reorder', { method: 'POST', body: { order: ranks.map(r => r.id) } });
      toast('Order saved!', 'success');
      setReorderMode(false);
    } catch (err) {
      toast('Failed to save order: ' + err.message, 'error');
    } finally {
      savingOrder.current = false;
    }
  };

  // ── Editor ────────────────────────────────────────────────────────────────
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
    if (!(await showConfirm(`Delete rank "${rank.name}"?`, 'Delete Rank'))) return;
    try {
      await api(`/api/ranks/${rank.id}/delete`, { method: 'POST' });
      toast('Rank deleted.', 'success');
      loadData();
    } catch (err) {
      toast('Failed to delete rank: ' + err.message, 'error');
    }
  };

  const handleSaveRank = async () => {
    if (!rankName) return toast('Rank name is required.', 'error');
    try {
      if (editingRank) {
        await api(`/api/ranks/${editingRank.id}`, {
          method: 'PUT',
          body: { name: rankName, color: rankColor, global: localGlobalPerms, servers: localServerPerms }
        });
        toast('Rank updated.', 'success');
      } else {
        const res = await api('/api/ranks/create', { method: 'POST', body: { name: rankName, color: rankColor } });
        await api(`/api/ranks/${res.rankId}`, {
          method: 'PUT',
          body: { name: rankName, color: rankColor, global: localGlobalPerms, servers: localServerPerms }
        });
        toast('Rank created.', 'success');
      }
      setShowEditor(false);
      loadData();
    } catch (err) {
      toast('Failed to save rank: ' + err.message, 'error');
    }
  };

  const toggleGlobalPerm = (key, checked) =>
    setLocalGlobalPerms(prev => checked ? [...prev, key] : prev.filter(k => k !== key));

  const toggleServerPerm = (serverId, key, checked) =>
    setLocalServerPerms(prev => {
      const cur = prev[serverId] || [];
      return { ...prev, [serverId]: checked ? [...cur, key] : cur.filter(k => k !== key) };
    });


  return (
    <div className="page" style={{ padding: '2.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Ranks Management</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {reorderMode ? (
            <>
              <button className="btn outline small" onClick={() => { setReorderMode(false); loadData(); }}>Cancel</button>
              <button className="btn primary small" onClick={saveOrder}>Save Order</button>
            </>
          ) : (
            <>
              <button className="btn outline small" onClick={() => setReorderMode(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
                Reorder
              </button>
              <button className="btn primary small" onClick={handleCreateClick}>+ Create Rank</button>
            </>
          )}
        </div>
      </div>

      {reorderMode && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', borderRadius: 'var(--radius)', background: 'var(--accent-subtle)', border: '1px solid var(--accent)', fontSize: '0.85rem', color: 'var(--accent)' }}>
          🔀 Drag and drop the rank cards to reorder them, then click <strong>Save Order</strong>.
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading ranks...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {ranks.map((r, idx) => {
            const globalCount = (r.global_permissions || []).length;
            let serverCount = 0;
            if (r.permissions) Object.values(r.permissions).forEach(arr => { if (Array.isArray(arr)) serverCount += arr.length; });
            const isAllGlobal = (r.global_permissions || []).includes('*') || (r.global_permissions || []).includes('root');
            const isDragging = dragIdx === idx;
            const isOver    = dragOver === idx;

            return (
              <RankCard
                key={r.id}
                rank={r}
                globalCount={globalCount}
                serverCount={serverCount}
                isAllGlobal={isAllGlobal}
                reorderMode={reorderMode}
                isDragging={isDragging}
                isOver={isOver}
                onDragStart={(e) => onDragStart(e, idx)}
                onDragEnter={() => onDragEnter(idx)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                onEdit={() => handleEditClick(r)}
                onDelete={() => handleDeleteRank(r)}
              />
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <div className="modal-overlay active" onClick={() => setShowEditor(false)}>
          <div className="modal large" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRank ? `Edit Rank — ${editingRank.name}` : 'Create Custom Rank'}</h3>
              <button className="close-btn" onClick={() => setShowEditor(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Rank Name</label>
                  <input type="text" value={rankName} onChange={e => setRankName(e.target.value)}
                    placeholder="e.g. Moderator" disabled={editingRank?.is_builtin} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Rank Color</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="color" value={rankColor} onChange={e => setRankColor(e.target.value)}
                      style={{ padding: 0, width: 40, height: 38, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'none' }} />
                    <input type="text" value={rankColor} onChange={e => setRankColor(e.target.value)} placeholder="#3b82f6" style={{ flex: 1 }} />
                  </div>
                </div>
              </div>

              <h4 style={{ marginBottom: '0.75rem' }}>Permissions Matrix</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: 8 }}>Permission</th>
                    <th style={{ padding: 8 }}>Global</th>
                    {servers.map(s => <th key={s.id} style={{ padding: 8 }}>{s.name}</th>)}
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
                          <tr key={`g-${p.group}`} style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={servers.length + 2} style={{ padding: '6px 8px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--accent)' }}>{p.group}</td>
                          </tr>
                        );
                      }
                      const isGlobal = localGlobalPerms.includes(p.key);
                      rows.push(
                        <tr key={p.key} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: 8 }}>
                            <div style={{ fontWeight: 600 }}>{p.label}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.key}</div>
                          </td>
                          <td style={{ padding: 8 }}>
                            <input type="checkbox" checked={isGlobal} onChange={e => toggleGlobalPerm(p.key, e.target.checked)} />
                          </td>
                          {servers.map(s => {
                            const isDisabled = p.globalOnly || p.key === 'account.manage' || p.key === 'panel.settings';
                            const isServer = (localServerPerms[s.id] || []).includes(p.key);
                            return (
                              <td key={s.id} style={{ padding: 8 }}>
                                {isDisabled
                                  ? <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>—</span>
                                  : <input type="checkbox" checked={isServer} onChange={e => toggleServerPerm(s.id, p.key, e.target.checked)} />
                                }
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

// ── Rank Card ────────────────────────────────────────────────────────────────
function RankCard({ rank: r, globalCount, serverCount, isAllGlobal, reorderMode, isDragging, isOver, onDragStart, onDragEnter, onDragOver, onDrop, onDragEnd, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);

  // Parse hex color to rgba for glow/bg effects
  const hexToRgb = (hex) => {
    const m = hex.replace('#','').match(/.{2}/g);
    return m ? m.map(h => parseInt(h,16)) : [99,102,241];
  };
  const [rc, gc, bc] = hexToRgb(r.color || '#3b82f6');

  const cardStyle = {
    background: hovered && !reorderMode
      ? `linear-gradient(135deg, rgba(${rc},${gc},${bc},0.08) 0%, var(--bg-card) 60%)`
      : 'var(--bg-card)',
    borderRadius: 'var(--radius)',
    border: hovered && !reorderMode
      ? `1px solid rgba(${rc},${gc},${bc},0.45)`
      : isDragging
        ? '1px dashed var(--accent)'
        : isOver
          ? `1px solid rgba(${rc},${gc},${bc},0.6)`
          : '1px solid var(--border-color)',
    borderLeft: `5px solid ${r.color || '#3b82f6'}`,
    padding: '1.1rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    cursor: reorderMode ? 'grab' : 'default',
    transition: 'all 0.18s ease',
    opacity: isDragging ? 0.4 : 1,
    boxShadow: hovered && !reorderMode
      ? `0 4px 20px rgba(${rc},${gc},${bc},0.18), 0 1px 4px rgba(0,0,0,0.2)`
      : '0 1px 4px rgba(0,0,0,0.15)',
    transform: isOver && !isDragging ? 'scale(1.01)' : 'none',
    userSelect: 'none',
  };

  return (
    <div
      style={cardStyle}
      draggable={reorderMode}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle */}
      {reorderMode && (
        <div style={{ color: 'var(--text-muted)', flexShrink: 0, cursor: 'grab', padding: '0 4px' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <circle cx="9" cy="6"  r="1.5"/><circle cx="15" cy="6"  r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
      )}

      {/* Color dot */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: r.color || '#3b82f6',
        boxShadow: hovered ? `0 0 12px rgba(${rc},${gc},${bc},0.55)` : 'none',
        transition: 'box-shadow 0.18s ease',
      }} />

      {/* Name + perms */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: r.color || 'var(--text-primary)' }}>
            {r.name}
          </span>
          {r.is_builtin && (
            <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.45rem', borderRadius: 4,
              background: `rgba(${rc},${gc},${bc},0.12)`, color: r.color, fontWeight: 600, letterSpacing: '0.04em' }}>
              BUILT-IN
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          {globalCount} global perm{globalCount !== 1 ? 's' : ''}
          {serverCount > 0 && ` · ${serverCount} server perm${serverCount !== 1 ? 's' : ''}`}
          {isAllGlobal && <span style={{ color: r.color, fontWeight: 600 }}> · ALL permissions</span>}
        </div>
      </div>

      {/* Actions */}
      {!reorderMode && (
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <button className="btn outline small" onClick={onEdit}
            style={{ borderColor: hovered ? `rgba(${rc},${gc},${bc},0.5)` : undefined,
                     color: hovered ? r.color : undefined, transition: 'all 0.15s' }}>
            Edit
          </button>
          {!r.is_builtin && (
            <button className="btn danger small" onClick={onDelete}>Delete</button>
          )}
        </div>
      )}
    </div>
  );
}
