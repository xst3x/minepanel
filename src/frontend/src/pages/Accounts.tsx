import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { showConfirm, toast } from '../components/Toast.tsx';
import '../styles/pages/Accounts.css';

function initials(name) {
  const clean = String(name || '?').trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export default function Accounts() {
  const { user, accounts, activeToken, switchAccount, removeAccount } = useAuth();
  const navigate = useNavigate();
  const [busyToken, setBusyToken] = useState(null);

  const handleAdd = () => {
    navigate('/login', { state: { addAccount: true } });
  };

  const handleSwitch = async (token) => {
    if (token === activeToken || busyToken) return;
    setBusyToken(token);
    const ok = await switchAccount(token);
    setBusyToken(null);
    if (ok) {
      toast('Switched account', 'success');
      navigate('/panel');
    } else {
      toast('That session has expired — please sign in again.', 'error');
    }
  };

  const handleRemove = async (account) => {
    const confirmed = await showConfirm(
      `Remove "${account.username}" from this device? You can add it again anytime.`,
      'Remove Account',
    );
    if (!confirmed) return;
    setBusyToken(account.token);
    await removeAccount(account.token);
    setBusyToken(null);
    toast(`Removed ${account.username}`, 'success');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Accounts</h2>
      </div>

      <div className="accounts-toolbar">
        <p className="text-muted accounts-subtitle">
          Switch between saved accounts in one click — no password needed.
        </p>
        <button className="btn primary small" onClick={handleAdd}>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="accounts-empty">
          <p className="text-muted" style={{ margin: 0 }}>
            No saved accounts yet. Add one to start switching.
          </p>
        </div>
      ) : (
        <div className="accounts-list">
          {accounts.map((account) => {
            const isActive = account.token === activeToken;
            const isBusy = busyToken === account.token;
            return (
              <div key={account.token} className={`account-card${isActive ? ' active' : ''}`}>
                <span className="account-avatar" aria-hidden="true">{initials(account.username)}</span>

                <div className="account-info">
                  <span className="account-name">
                    {account.username}
                    {isActive && <span className="account-badge">Current</span>}
                  </span>
                  <span className="account-sub">
                    {isActive ? 'Signed in on this device' : 'Saved session'}
                  </span>
                </div>

                <div className="account-actions">
                  {isActive ? (
                    <span className="account-current-tag">
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Active
                    </span>
                  ) : (
                    <button
                      className="btn primary small"
                      onClick={() => handleSwitch(account.token)}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Switching…' : 'Switch'}
                    </button>
                  )}
                  <button
                    className="icon-btn account-remove"
                    aria-label={`Remove ${account.username}`}
                    title={`Remove ${account.username}`}
                    onClick={() => handleRemove(account)}
                    disabled={isBusy}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
