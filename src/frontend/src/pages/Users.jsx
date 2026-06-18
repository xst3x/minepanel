import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { toast, showConfirm } from '../components/Toast.jsx';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [isCallerManager, setIsCallerManager] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  
  const [loading, setLoading] = useState(true);

  const EyeIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = ({ size = 16 }) => (
  <svg width={size} height={24} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.58 10.58A2 2 0 1 0 12 14a2 2 0 0 0-1.42-.59" />
    <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c7 0 10 8 10 8a18.45 18.45 0 0 1-3.22 4.5" />
    <path d="M6.1 6.1C3.6 8 2 12 2 12s3 8 10 8a10.94 10.94 0 0 0 4.12-.76" />
    <path d="M2 2l20 20" />
  </svg>
);  

  // Modals state
  const [activeModal, setActiveModal] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePw, setShowCreatePw] = useState(false);

  const [inviteRanks, setInviteRanks] = useState([]);
  const [selectedInviteRanks, setSelectedInviteRanks] = useState([]);
  const [generatedToken, setGeneratedToken] = useState('');

  // Self change name
  const [cnsCurrent, setCnsCurrent] = useState('');
  const [cnsNew, setCnsNew] = useState('');
  const [cnsConfirm, setCnsConfirm] = useState('');

  // Self change password
  const [cpsCurrent, setCpsCurrent] = useState('');
  const [cpsNew, setCpsNew] = useState('');
  const [cpsConfirm, setCpsConfirm] = useState('');
  const [showCpsCurrent, setShowCpsCurrent] = useState(false);
  const [showCpsNew, setShowCpsNew] = useState(false);
  const [showCpsConfirm, setShowCpsConfirm] = useState(false);

  // Admin change name
  const [cnaNew, setCnaNew] = useState('');
  const [cnaConfirm, setCnaConfirm] = useState('');

  // Admin reset password
  const [rpaNew, setRpaNew] = useState('');
  const [rpaConfirm, setRpaConfirm] = useState('');
  const [showRpaNew, setShowRpaNew] = useState(false);
  const [showRpaConfirm, setShowRpaConfirm] = useState(false);

  // Permission Matrix states
  const [ranksList, setRanksList] = useState([]);
  const [allPerms, setAllPerms] = useState([]);
  const [selectedRankId, setSelectedRankId] = useState(null);
  const [localGlobalPerms, setLocalGlobalPerms] = useState([]);
  const [localServerPerms, setLocalServerPerms] = useState({}); // { [serverId]: [perms] }

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

  const handleToggleDisabled = async (user) => {
    try {
      const res = await api(`/api/users/${user.id}/toggle-disabled`, { method: 'PATCH' });
      toast(res.message || 'User status updated.', 'success');
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to toggle user status.', 'error');
    }
  };

  const handleDeleteUser = async (user) => {
    if (!await showConfirm(`Delete user ${user.username}? This action is permanent.`, 'Delete User')) return;
    try {
      await api(`/api/users/${user.id}/delete`, { method: 'POST' });
      toast('User deleted.', 'success');
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to delete user.', 'error');
    }
  };

  // Create User
  const handleCreateUser = async () => {
    if (!createUsername || !createPassword) return toast('Username and password are required.', 'error');
    try {
      await api('/api/users/create', {
        method: 'POST',
        body: { username: createUsername, password: createPassword }
      });
      toast('User created successfully.', 'success');
      setActiveModal(null);
      setCreateUsername('');
      setCreatePassword('');
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to create user.', 'error');
    }
  };

  // Generate Invite Token
  const handleOpenInviteModal = async () => {
    try {
      const ranks = await api('/api/ranks');
      setInviteRanks(ranks || []);
      setSelectedInviteRanks([]);
      setGeneratedToken('');
      setActiveModal('invite');
    } catch (err) {
      toast(err.message || 'Failed to load ranks.', 'error');
    }
  };

  const handleGenerateToken = async () => {
    try {
      const res = await api('/api/users/generate-token', {
        method: 'POST',
        body: { permissions: [], ranks: selectedInviteRanks }
      });
      setGeneratedToken(res.token);
    } catch (err) {
      toast(err.message || 'Failed to generate token.', 'error');
    }
  };

  const handleClearAllTokens = async () => {
    if (!await showConfirm('Are you sure you want to clear ALL invite tokens? This will invalidate any existing registration tokens.', 'Clear All Tokens')) return;
    try {
      await api('/api/users/tokens/clear-all', { method: 'DELETE' });
      toast('All invite tokens cleared.', 'success');
    } catch (err) {
      toast(err.message || 'Failed to clear tokens.', 'error');
    }
  };

  // User details change confirm handlers
  const handleCnsConfirm = async () => {
    if (!cnsCurrent || !cnsNew || !cnsConfirm) return toast('All fields are required.', 'error');
    try {
      await api('/api/users/change-name', {
        method: 'POST',
        body: { currentName: cnsCurrent, newName: cnsNew, confirmNewName: cnsConfirm }
      });
      toast('Username updated successfully.', 'success');
      setActiveModal(null);
      setCnsCurrent(''); setCnsNew(''); setCnsConfirm('');
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to change username.', 'error');
    }
  };

  const handleCpsConfirm = async () => {
    if (!cpsCurrent || !cpsNew || !cpsConfirm) return toast('All fields are required.', 'error');
    try {
      await api('/api/users/change-password', {
        method: 'POST',
        body: { oldPassword: cpsCurrent, newPassword: cpsNew, newPasswordConfirm: cpsConfirm }
      });
      toast('Password updated successfully.', 'success');
      setActiveModal(null);
      setCpsCurrent(''); setCpsNew(''); setCpsConfirm('');
    } catch (err) {
      toast(err.message || 'Failed to change password.', 'error');
    }
  };

  const handleCnaConfirm = async () => {
    if (!cnaNew || !cnaConfirm) return toast('All fields are required.', 'error');
    try {
      await api(`/api/users/${selectedUser.id}/change-name`, {
        method: 'POST',
        body: { newName: cnaNew, confirmNewName: cnaConfirm }
      });
      toast('Username updated successfully.', 'success');
      setActiveModal(null);
      setCnaNew(''); setCnaConfirm('');
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to change username.', 'error');
    }
  };

  const handleRpaConfirm = async () => {
    if (!rpaNew || !rpaConfirm) return toast('All fields are required.', 'error');
    try {
      await api(`/api/users/${selectedUser.id}/change-password`, {
        method: 'POST',
        body: { newPassword: rpaNew, newPasswordConfirm: rpaConfirm }
      });
      toast('Password reset successfully.', 'success');
      setActiveModal(null);
      setRpaNew(''); setRpaConfirm('');
    } catch (err) {
      toast(err.message || 'Failed to reset password.', 'error');
    }
  };

  // Matrix edit open
  const handleOpenPermsModal = async (user) => {
    setSelectedUser(user);
    try {
      const [ranks, permissionsData, userPerms] = await Promise.all([
        api('/api/ranks'),
        api('/api/users/permissions'),
        api(`/api/users/${user.id}/permissions`)
      ]);
      setRanksList(ranks || []);
      setAllPerms(permissionsData || []);
      setSelectedRankId(userPerms.rank ? userPerms.rank.id : null);
      setLocalGlobalPerms(userPerms.global || []);
      setLocalServerPerms(userPerms.servers || {});
      setActiveModal('edit-perms');
    } catch (err) {
      toast(err.message || 'Failed to load user permissions.', 'error');
    }
  };

  const handleSavePerms = async () => {
    try {
      await api(`/api/users/${selectedUser.id}/rank`, { method: 'PUT', body: { rankId: selectedRankId } });
      await api(`/api/users/${selectedUser.id}/permissions`, { method: 'PUT', body: { global: localGlobalPerms, servers: localServerPerms } });
      toast('User permissions updated successfully.', 'success');
      setActiveModal(null);
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to save permissions.', 'error');
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

  const getInheritedGlobal = () => {
    if (selectedRankId === null) return [];
    const rank = ranksList.find(r => r.id === selectedRankId);
    return rank ? rank.global_permissions || [] : [];
  };

  const getInheritedServer = (serverId) => {
    const inheritedGlobal = getInheritedGlobal();
    if (inheritedGlobal.includes('*') || inheritedGlobal.includes('root')) {
      return ['*'];
    }
    if (selectedRankId === null) return [];
    const rank = ranksList.find(r => r.id === selectedRankId);
    return rank && rank.permissions ? rank.permissions[serverId] || [] : [];
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Users Management</h2>
        {isCallerManager && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn primary" onClick={() => setActiveModal('create')}>+ Create User</button>
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
            <div>Username</div>
            <div>Rank / Role</div>
            <div>Status</div>
            <div>Created At</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          
          <div className="list-body">
            {users.length === 0 ? (
              <p className="text-muted" style={{ padding: '1.5rem', textAlign: 'center' }}>No users configured.</p>
            ) : (
              users.map(u => {
                const isSelf = Number(u.id) === Number(currentUserProfile?.id);
                const isDisabled = !!u.disabled;

                const rankHtml = u.rank_name ? (
                  <span className="rank-badge" style={{ background: `${u.rank_color}55`, color: u.rank_color, borderColor: `${u.rank_color}99`, border: '1px solid', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    {u.rank_name}
                  </span>
                ) : (
                  <span className="rank-badge" style={{ background: 'rgba(255,255,255,0.12)', color: 'var(--text-muted)', border: '1px solid var(--border-hover)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                    {u.role.toUpperCase()}
                  </span>
                );

                return (
                  <div key={u.id} className="list-item" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 2fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username}</div>
                    <div>{rankHtml}</div>
                    <div>
                      {isSelf ? (
                        <label className="toggle-switch" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                          <input type="checkbox" checked disabled />
                          <span className="toggle-slider"></span>
                        </label>
                      ) : (
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={!isDisabled}
                            onChange={() => handleToggleDisabled(u)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                      {isSelf ? (
                        <>
                          <button className="btn outline small" onClick={() => { setCnsCurrent(u.username); setActiveModal('change-name-self'); }}>Change Name</button>
                          <button className="btn outline small" onClick={() => setActiveModal('change-password-self')}>Change Password</button>
                          {isCallerManager && (
                            <>
                              <button className="btn outline small" onClick={() => { setSelectedUser(u); setActiveModal('reset-password-admin'); }}>Reset Pass</button>
                              <button className="btn outline small" onClick={() => handleOpenPermsModal(u)}>Permissions</button>
                            </>
                          )}
                        </>
                      ) : isCallerManager ? (
                        <>
                          <button className="btn outline small" onClick={() => { setSelectedUser(u); setActiveModal('change-name-admin'); }}>Change Name</button>
                          <button className="btn outline small" onClick={() => { setSelectedUser(u); setActiveModal('reset-password-admin'); }}>Reset Pass</button>
                          <button className="btn outline small" onClick={() => handleOpenPermsModal(u)}>Permissions</button>
                          <button className="btn danger small" onClick={() => handleDeleteUser(u)}>Delete</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {activeModal === 'create' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create User</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Username</label>
                <input type="text" value={createUsername} onChange={e => setCreateUsername(e.target.value)} placeholder="New username" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showCreatePw ? 'text' : 'password'} value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="Password" style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowCreatePw(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 15 }}>{showCreatePw ? '<EyeOffIcon />' : '<EyeIcon />'}</button>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn primary" onClick={handleCreateUser}>Create User</button>
            </div>
          </div>
        </div>
      )}

      {/* INVITE TOKEN MODAL */}
      {activeModal === 'invite' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate Invite Token</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {!generatedToken ? (
                <>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Select ranks to associate with this registration link:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '1.25rem' }}>
                    {inviteRanks.map(r => {
                      const isSelected = selectedInviteRanks.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          className={`btn outline small${isSelected ? ' active' : ''}`}
                          onClick={() => {
                            setSelectedInviteRanks(prev => isSelected ? prev.filter(id => id !== r.id) : [...prev, r.id]);
                          }}
                          style={{
                            borderColor: r.color + '44',
                            color: r.color,
                            background: isSelected ? r.color + '22' : 'transparent'
                          }}
                        >
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Invite Token:</p>
                  <code style={{ fontSize: '0.9rem', wordBreak: 'break-all', display: 'block', color: 'var(--accent)', letterSpacing: '0.04em' }}>
                    {generatedToken}
                  </code>
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Share this token with the user. They enter it on the login page under "Create account".
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              {!generatedToken ? (
                <>
                  <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn primary" onClick={handleGenerateToken}>Generate</button>
                </>
              ) : (
                <>
                  <button className="btn outline" onClick={() => {
                    navigator.clipboard.writeText(generatedToken);
                    toast('Token copied!', 'success');
                  }}>Copy Token</button>
                  <button className="btn primary" onClick={() => setActiveModal(null)}>Done</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CHANGE NAME SELF MODAL */}
      {activeModal === 'change-name-self' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Username</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Username</label>
                <input type="text" value={cnsCurrent} disabled />
              </div>
              <div className="form-group">
                <label>New Username</label>
                <input type="text" value={cnsNew} onChange={e => setCnsNew(e.target.value)} placeholder="New username" />
              </div>
              <div className="form-group">
                <label>Confirm New Username</label>
                <input type="text" value={cnsConfirm} onChange={e => setCnsConfirm(e.target.value)} placeholder="Confirm username" />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn primary" onClick={handleCnsConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD SELF MODAL */}
      {activeModal === 'change-password-self' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Password</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showCpsCurrent ? 'text' : 'password'} value={cpsCurrent} onChange={e => setCpsCurrent(e.target.value)} placeholder="Current password" style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowCpsCurrent(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 15 }}>{showCpsCurrent ? '<EyeOffIcon />' : '<EyeIcon />'}</button>
                </div>
              </div>
              <div className="form-group">
                <label>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showCpsNew ? 'text' : 'password'} value={cpsNew} onChange={e => setCpsNew(e.target.value)} placeholder="New password" style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowCpsNew(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 15 }}>{showCpsNew ? '<EyeOffIcon />' : '<EyeIcon />'}</button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showCpsConfirm ? 'text' : 'password'} value={cpsConfirm} onChange={e => setCpsConfirm(e.target.value)} placeholder="Confirm new password" style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowCpsConfirm(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 15 }}>{showCpsConfirm ? '<EyeOffIcon />' : '<EyeIcon />'}</button>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn primary" onClick={handleCpsConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE NAME ADMIN MODAL */}
      {activeModal === 'change-name-admin' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Username (Admin)</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Editing user: <strong>{selectedUser?.username}</strong></p>
              <div className="form-group">
                <label>New Username</label>
                <input type="text" value={cnaNew} onChange={e => setCnaNew(e.target.value)} placeholder="New username" />
              </div>
              <div className="form-group">
                <label>Confirm New Username</label>
                <input type="text" value={cnaConfirm} onChange={e => setCnaConfirm(e.target.value)} placeholder="Confirm username" />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn primary" onClick={handleCnaConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD ADMIN MODAL */}
      {activeModal === 'reset-password-admin' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reset Password (Admin)</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Resetting password for: <strong>{selectedUser?.username}</strong></p>
              <div className="form-group">
                <label>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showRpaNew ? 'text' : 'password'} value={rpaNew} onChange={e => setRpaNew(e.target.value)} placeholder="New password" style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowRpaNew(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 15 }}>{showRpaNew ? '<EyeOffIcon />' : '<EyeIcon />'}</button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showRpaConfirm ? 'text' : 'password'} value={rpaConfirm} onChange={e => setRpaConfirm(e.target.value)} placeholder="Confirm password" style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowRpaConfirm(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 15 }}>{showRpaConfirm ? '<EyeOffIcon />' : '<EyeIcon />'}</button>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn primary" onClick={handleRpaConfirm}>Reset Password</button>
            </div>
          </div>
        </div>
      )}

      {/* PERMISSIONS MATRIX MODAL */}
      {activeModal === 'edit-perms' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal large" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Permissions Matrix  {selectedUser?.username}</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              
              {/* Ranks selection section */}
              <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Select User Rank</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1.5rem' }}>
                <div
                  onClick={() => setSelectedRankId(null)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    border: '2px solid',
                    borderColor: selectedRankId === null ? 'var(--accent)' : 'var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: selectedRankId === null ? 'var(--accent-subtle)' : 'transparent'
                  }}
                >
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#777' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>No Rank</span>
                </div>
                {ranksList.map(r => {
                  const isSelected = selectedRankId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRankId(r.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 'var(--radius)',
                        border: '2px solid',
                        borderColor: isSelected ? r.color : 'var(--border)',
                        color: r.color,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: isSelected ? `${r.color}18` : 'transparent'
                      }}
                    >
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: r.color }} />
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Permission Matrix Grid */}
              <h4 style={{ marginBottom: '0.75rem' }}>Detailed Permissions</h4>
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
                    
                    const inheritedGlobal = getInheritedGlobal();
                    const isGlobalAdmin = inheritedGlobal.includes('*') || inheritedGlobal.includes('root');

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

                      // Check global inheritance
                      const isGlobalInherited = isGlobalAdmin || inheritedGlobal.includes(p.key);
                      const isGlobalChecked = isGlobalInherited || localGlobalPerms.includes(p.key);

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
                              disabled={isGlobalInherited}
                              onChange={(e) => toggleGlobalPerm(p.key, e.target.checked)}
                              style={{ opacity: isGlobalInherited ? 0.5 : 1 }}
                            />
                          </td>

                          {/* Server-specific override checkboxes */}
                          {servers.map(s => {
                            const isGlobalOverride = isGlobalChecked;
                            const isServerInherited = isGlobalOverride || getInheritedServer(s.id).includes(p.key) || getInheritedServer(s.id).includes('*');
                            const isServerChecked = isServerInherited || (localServerPerms[s.id] || []).includes(p.key);

                            const isDisabledColumn = p.globalOnly || p.key === 'account.manage' || p.key === 'panel.settings';

                            return (
                              <td key={s.id} style={{ padding: '8px' }}>
                                {isDisabledColumn ? (
                                  <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}></span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isServerChecked}
                                    disabled={isServerInherited}
                                    onChange={(e) => toggleServerPerm(s.id, p.key, e.target.checked)}
                                    style={{ opacity: isServerInherited ? 0.5 : 1 }}
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
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn primary" onClick={handleSavePerms}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
