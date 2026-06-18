import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { toast } from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Password change form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  // Username change form states
  const [newUsername, setNewUsername] = useState('');
  const [confirmUsername, setConfirmUsername] = useState('');
  const [usernameUpdating, setUsernameUpdating] = useState(false);



  // 2FA states
  const [twoFaStatus, setTwoFaStatus] = useState({ configured: false, enabled: false });
  const [activeModal, setActiveModal] = useState(null); // 'setup' | 'disable' | 'backup-codes'
  const [actionLoading, setActionLoading] = useState(false);

  // Setup modal details
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupStep, setSetupStep] = useState('qr'); // 'qr' | 'backup'
  const [setupBackupCodes, setSetupBackupCodes] = useState([]);

  // Disable authenticator details
  const [disablePassword, setDisablePassword] = useState('');

  // View / Regenerate Backup codes details
  const [regenTotpCode, setRegenTotpCode] = useState('');
  const [regenStep, setRegenStep] = useState('input'); // 'input' | 'result'
  const [regenBackupCodes, setRegenBackupCodes] = useState([]);



  useEffect(() => {
    loadProfile();
    loadTwoFaStatus();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await api('/api/users/me');
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTwoFaStatus = async () => {
    try {
      const d = await api('/api/auth/2fa/status');
      setTwoFaStatus({ configured: !!d.configured, enabled: !!d.enabled });
    } catch (e) {
      console.warn('Failed to load 2FA status:', e.message);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) { toast('All fields are required', 'warning'); return; }
    if (newPassword !== confirmPassword) { toast("Passwords don't match", 'warning'); return; }

    setPasswordUpdating(true);
    try {
      await api('/api/users/me/password', {
        method: 'POST',
        body: { currentPassword, newPassword }
      });
      toast('Password updated successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast(err.message || 'Failed to update password', 'error');
    } finally {
      setPasswordUpdating(false);
    }
  };

  const handleUpdateUsername = async () => {
    if (!newUsername || !confirmUsername) {
      toast('All fields are required', 'warning');
      return;
    }
    if (newUsername !== confirmUsername) {
      toast("Usernames don't match", 'warning');
      return;
    }

    setUsernameUpdating(true);
    try {
      await api('/api/users/me/username', {
        method: 'POST',
        body: { newUsername }
      });
      toast('Username updated successfully!', 'success');
      setNewUsername('');
      setConfirmUsername('');
      await refresh();
      await loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to update username', 'error');
    } finally {
      setUsernameUpdating(false);
    }
  };





  // Open 2FA Setup
  const handleOpenSetup = async () => {
    try {
      const d = await api('/api/auth/2fa/setup');
      setQrCode(d.qrCode);
      setSecret(d.secret);
      setSetupCode('');
      setSetupStep('qr');
      setSetupBackupCodes([]);
      setActiveModal('setup');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleVerifySetupCode = async () => {
    if (!setupCode || setupCode.length !== 6) return toast('Enter the 6-digit code from your app', 'warning');
    setActionLoading(true);
    try {
      const d = await api('/api/auth/2fa/verify', {
        method: 'POST',
        body: { code: setupCode }
      });
      setSetupBackupCodes(d.backupCodes || []);
      setSetupStep('backup');
      setTwoFaStatus({ configured: true, enabled: twoFaStatus.enabled });
      toast('Authenticator configured successfully!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggle2FaEnforcement = async (checked) => {
    try {
      await api('/api/auth/2fa/toggle', {
        method: 'POST',
        body: { enable: checked }
      });
      setTwoFaStatus(prev => ({ ...prev, enabled: checked }));
      toast(checked ? '2FA login protection enabled.' : '2FA login protection disabled.', 'success');
    } catch (err) {
      toast('Failed to toggle 2FA: ' + err.message, 'error');
    }
  };

  const handleOpenDisable = () => {
    setDisablePassword('');
    setActiveModal('disable');
  };

  const handleConfirmDisable = async () => {
    if (!disablePassword) { toast('Password is required', 'warning'); return; }
    setActionLoading(true);
    try {
      await api('/api/auth/2fa/disable', {
        method: 'POST',
        body: { password: disablePassword }
      });
      toast('Authenticator removed.', 'success');
      setTwoFaStatus({ configured: false, enabled: false });
      setActiveModal(null);
    } catch (err) {
      toast('Failed to remove authenticator: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRegenCodes = () => {
    setRegenTotpCode('');
    setRegenStep('input');
    setRegenBackupCodes([]);
    setActiveModal('backup-codes');
  };

  const handleConfirmRegenCodes = async () => {
    if (!regenTotpCode) return toast('Enter your authenticator code', 'warning');
    setActionLoading(true);
    try {
      const d = await api('/api/auth/2fa/regenerate-backup-codes', {
        method: 'POST',
        body: { code: regenTotpCode }
      });
      setRegenBackupCodes(d.backupCodes || []);
      setRegenStep('result');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyCodes = (codes) => {
    navigator.clipboard.writeText(codes.join('\n'));
    toast('Codes copied to clipboard!', 'success');
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>My Account</h2>

      {loading ? (
        <p className="text-muted">Loading profile details...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          
          {/* Change Username Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>Change Username</h3>
              <span className="rank-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                Global Role: {profile?.role}
              </span>
            </div>
            
            <div className="form-group">
              <label>New Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="New username"
              />
            </div>
            <div className="form-group">
              <label>Confirm New Username</label>
              <input
                type="text"
                value={confirmUsername}
                onChange={e => setConfirmUsername(e.target.value)}
                placeholder="Confirm new username"
              />
            </div>
            <button className="btn primary full-width" onClick={handleUpdateUsername} disabled={usernameUpdating}>
              {usernameUpdating ? 'Updating...' : 'Update Username'}
            </button>
          </div>

          {/* Change Password Card */}
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: '1.25rem' }}>Change Password</h3>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Current password"
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New password"
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
              />
            </div>
            <button className="btn primary full-width" onClick={handleUpdatePassword} disabled={passwordUpdating}>
              {passwordUpdating ? 'Updating...' : 'Update Password'}
            </button>
          </div>

          {/* Two-Factor Authentication Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Two-Factor Authentication</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              MFA secures your account by requiring an authenticator code alongside your password when logging in.
            </p>

            {!twoFaStatus.configured ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#777' }} />
                  MFA is not set up
                </div>
                <button className="btn primary full-width" onClick={handleOpenSetup}>
                  Setup Authenticator App
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--green)', fontSize: '0.85rem', fontWeight: 600 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }} />
                  Authenticator Configured
                </div>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Enforce at Login</span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={twoFaStatus.enabled}
                      onChange={(e) => handleToggle2FaEnforcement(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <button className="btn outline small" onClick={handleOpenSetup}>Reconfigure</button>
                  <button className="btn outline small" onClick={handleOpenRegenCodes}>Backup Codes</button>
                </div>
                <button className="btn danger small full-width" onClick={handleOpenDisable}>
                  Remove Authenticator
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 2FA SETUP MODAL */}
      {activeModal === 'setup' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Setup Authenticator</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {setupStep === 'qr' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Scan this QR code with Google Authenticator, Authy, or any TOTP app:
                  </p>
                  {qrCode && <img src={qrCode} alt="QR Code" style={{ border: '4px solid white', borderRadius: '8px', width: '180px', height: '180px' }} />}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Manual entry code: <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{secret}</strong>
                  </div>
                  <div className="form-group" style={{ width: '100%', textAlign: 'left', marginTop: '0.5rem' }}>
                    <label>Verify Code from App</label>
                    <input
                      type="text"
                      value={setupCode}
                      onChange={e => setSetupCode(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      style={{ textAlign: 'center', letterSpacing: '0.25em', fontSize: '1.1rem' }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', background: 'rgba(234,179,8,0.1)', border: '1px solid #ca8a04', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#ca8a04', fontWeight: 600 }}>
                      Write down these backup codes. They can be used to recover access if you lose your authenticator.
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '1rem' }}>
                    {setupBackupCodes.map(code => (
                      <div key={code} style={{ padding: '0.4rem 0.6rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent)', textAlign: 'center' }}>
                        {code}
                      </div>
                    ))}
                  </div>
                  <button className="btn outline full-width" onClick={() => handleCopyCodes(setupBackupCodes)}>
                    Copy All Codes
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              {setupStep === 'qr' ? (
                <>
                  <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn primary" onClick={handleVerifySetupCode} disabled={actionLoading}>Verify &amp; Enable</button>
                </>
              ) : (
                <button className="btn primary full-width" onClick={() => setActiveModal(null)}>Done</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2FA DISABLE MODAL */}
      {activeModal === 'disable' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Remove Authenticator</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Enter your password to verify your identity and disable two-factor authentication.
              </p>
              <div className="form-group">
                <label>Account Password</label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn danger" onClick={handleConfirmDisable} disabled={actionLoading}>Remove Authenticator</button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW / REGENERATE BACKUP CODES MODAL */}
      {activeModal === 'backup-codes' && (
        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Backup Codes</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {regenStep === 'input' ? (
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Enter your current 6-digit authenticator code to generate a new set of backup codes. This will invalidate all existing codes.
                  </p>
                  <div className="form-group">
                    <label>Authenticator Code</label>
                    <input
                      type="text"
                      value={regenTotpCode}
                      onChange={e => setRegenTotpCode(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      style={{ textAlign: 'center', letterSpacing: '0.25em', fontSize: '1.1rem' }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', background: 'rgba(234,179,8,0.1)', border: '1px solid #ca8a04', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#ca8a04', fontWeight: 600 }}>
                      Old backup codes are now invalid. Save these new codes!
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '1rem' }}>
                    {regenBackupCodes.map(code => (
                      <div key={code} style={{ padding: '0.4rem 0.6rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent)', textAlign: 'center' }}>
                        {code}
                      </div>
                    ))}
                  </div>
                  <button className="btn outline full-width" onClick={() => handleCopyCodes(regenBackupCodes)}>
                    Copy All Codes
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              {regenStep === 'input' ? (
                <>
                  <button className="btn outline" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button className="btn primary" onClick={handleConfirmRegenCodes} disabled={actionLoading}>Generate New Codes</button>
                </>
              ) : (
                <button className="btn primary full-width" onClick={() => setActiveModal(null)}>Done</button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
