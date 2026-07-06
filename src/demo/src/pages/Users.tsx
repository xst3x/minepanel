import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { toast, showConfirm } from '../components/Toast.jsx';
import { showRestrictionWarning } from '../components/DemoBanner.jsx';
import '../styles/pages/Users.css';

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [isCallerManager, setIsCallerManager] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeModal, setActiveModal] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const handleToggleDisabled = async (user) => {
    showRestrictionWarning('user.delete');
  };

  const handleDeleteUser = async (user) => {
    showRestrictionWarning('user.delete');
  };

  const handleOpenInviteModal = async () => {
    showRestrictionWarning('user.invite_token');
  };

  const handleClearAllTokens = async () => {
    showRestrictionWarning('user.clear_tokens');
  };

  // Permissions Matrix - read-only view
  const handleOpenPermsModal = async (user) => {
    setSelectedUser(user);
    try {
      const [ranks, permissionsData, userPerms] = await Promise.all([
        api('/api/ranks'),
        api('/api/users/permissions'),
        api(`/api/users/${user.id}/permissions`)
      ]);
      toast('Permissions are read-only in demo mode.', 'info');
      setActiveModal('view-perms');
    } catch (err) {
      toast(err.message || 'Failed to load user permissions.', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const profile = await api('/api/users/me');
      setCurrentUserProfile(profile);
      const resData = await api('/api/users');
      setUsers(resData.users || []);
      setIsCallerManager(!!resData.isCallerManager);
      const srvs = await api('/api/servers');
      setServers(srvs || []);
    } catch (err) {
      toast('Failed to load users: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
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
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Users Management</h2>
        {isCallerManager && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn primary" onClick={() => showRestrictionWarning('user.create')}>+ Create User</button>
            <button className="btn outline" onClick={handleOpenInviteModal}>Invite Token</button>
            <button className="btn danger" onClick={handleClearAllTokens}>Clear All Tokens</button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted">Loading users...</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="list-header" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 2fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-secondary)' }}>
            <div>Username</div><div>Rank / Role</div><div>Status</div><div>Created At</div><div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          <div className="list-body">
            {users.length === 0 ? (
              <p className="text-muted" style={{ padding: '1.5rem', textAlign: 'center' }}>No users configured.</p>
            ) : (
              users.map(u => {
                const isSelf = Number(u.id) === Number(currentUserProfile?.id);
                const isDisabled = !!u.disabled;
                const rankHtml = u.rank_name ? (
                  <span className="rank-badge" style={{ background: `${u.rank_color}55`, color: u.rank_color, borderColor: `${u.rank_color}99`, border: '1px solid', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{u.rank_name}</span>
                ) : (
                  <span className="rank-badge" style={{ background: 'rgba(255,255,255,0.12)', color: 'var(--text-muted)', border: '1px solid var(--border-hover)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>{u.role.toUpperCase()}</span>
                );
                return (
                  <div key={u.id} className="list-item" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 2fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username}</div>
                    <div>{rankHtml}</div>
                    <div><label className="toggle-switch" style={{ opacity: 0.5, cursor: 'not-allowed' }}><input type="checkbox" checked={!isDisabled} disabled /><span className="toggle-slider"></span></label></div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</div>
                    <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                      <button className="btn outline small" onClick={() => showRestrictionWarning('user.change_name')}>Change Name</button>
                      <button className="btn outline small" onClick={() => showRestrictionWarning('user.change_password')}>Reset Pass</button>
                      <button className="btn outline small" onClick={() => handleOpenPermsModal(u)}>Permissions</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeModal === 'view-perms' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal large" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Permissions — {selectedUser?.username} (Read-Only)</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p>Permissions management is read-only in the demo version.</p>
              <p>Download the full version at <a href="https://github.com/xst3x/minepanel" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>github.com/xst3x/minepanel</a></p>
            </div>
            <div className="modal-footer">
              <button className="btn primary" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
