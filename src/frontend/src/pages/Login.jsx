import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import BgCanvas from '../components/BgCanvas.jsx';

// ── Screens: 'login' | 'forgot_username' | 'forgot_2fa' | 'forgot_no2fa' | 'forgot_done'
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const dest = loc.state?.from?.pathname || '/panel';

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Forgot password state
  const [screen, setScreen] = useState('login');
  const [fpUsername, setFpUsername] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpNewPass, setFpNewPass] = useState('');
  const [fpShowPass, setFpShowPass] = useState(false);
  const [fpErr, setFpErr] = useState('');
  const [fpBusy, setFpBusy] = useState(false);

  useEffect(() => {
    if (need2fa) document.getElementById('twofa')?.focus();
  }, [need2fa]);

  // ── Login submit
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(username, password, need2fa ? twoFactorCode : undefined);
      navigate(dest, { replace: true });
    } catch (e) {
      if (e.data?.requires2FA || /2fa/i.test(e.message)) setNeed2fa(true);
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  // ── Forgot: check if username has 2FA
  const handleForgotCheck = async (e) => {
    e.preventDefault();
    setFpErr('');
    setFpBusy(true);
    try {
      const res = await api('/api/auth/forgot-check', {
        method: 'POST',
        body: { username: fpUsername }
      });
      if (res.has2fa) {
        setScreen('forgot_2fa');
      } else {
        setScreen('forgot_no2fa');
      }
    } catch (e) {
      setFpErr(e.message || 'User not found');
    } finally {
      setFpBusy(false);
    }
  };

  // ── Forgot: reset with 2FA code
  const handleForgotReset = async (e) => {
    e.preventDefault();
    setFpErr('');
    setFpBusy(true);
    try {
      await api('/api/auth/password-reset-with-totp', {
        method: 'POST',
        body: { username: fpUsername, totpCode: fpCode, newPassword: fpNewPass }
      });
      setScreen('forgot_done');
    } catch (e) {
      setFpErr(e.message || 'Reset failed');
    } finally {
      setFpBusy(false);
    }
  };

  const resetForgot = () => {
    setScreen('login');
    setFpUsername('');
    setFpCode('');
    setFpNewPass('');
    setFpErr('');
    setFpShowPass(false);
  };

  const eyeBtn = (show, toggle) => (
    <button type="button" onClick={toggle} tabIndex={-1} style={{
      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0
    }}>
      {show ? (
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          <line x1="4" y1="4" x2="20" y2="20"/>
        </svg>
      )}
    </button>
  );

  return (
    <div id="app">
      <BgCanvas />
      <div id="auth-view" className="view active">
        <div className="auth-blob blob-top-left" />
        <div className="auth-blob blob-bottom-right" />
        <div className="auth-blob blob-center" />

        <div className="auth-container">
          <div className="auth-box">

            {/* Brand */}
            <div className="auth-brand">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--accent)" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
                <path d="M2 7v10"/><path d="M12 12v10"/><path d="M22 7v10"/>
              </svg>
              <h1>MinePanel</h1>
            </div>

            {/* ── LOGIN SCREEN ── */}
            {screen === 'login' && (<>
              <p className="subtitle">Enter your credentials to login to MinePanel</p>
              <form onSubmit={submit}>
                <div className="input-group">
                  <label htmlFor="username">Username</label>
                  <input id="username" type="text" required autoComplete="off"
                    value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="Enter your username" />
                </div>

                <div className="input-group">
                  <label htmlFor="password">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input id="password" type={showPassword ? 'text' : 'password'} required
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                    {eyeBtn(showPassword, () => setShowPassword(v => !v))}
                  </div>
                </div>

                {need2fa && (
                  <div className="input-group">
                    <label htmlFor="twofa">2FA Code</label>
                    <input id="twofa" type="text" inputMode="numeric" autoComplete="one-time-code"
                      value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)}
                      placeholder="6-digit code or backup code" />
                  </div>
                )}

                {err && <div className="form-error" style={{ color: 'var(--red)', marginBottom: '.75rem', fontSize: '.85rem' }}>{err}</div>}

                <button type="submit" disabled={busy} className="btn primary full-width" style={{ marginBottom: '0.75rem' }}>
                  {busy ? 'Signing in…' : 'Login'}
                </button>

                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={() => { setScreen('forgot_username'); setFpErr(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Forgot password?
                  </button>
                </div>
              </form>
            </>)}

            {/* ── FORGOT: enter username ── */}
            {screen === 'forgot_username' && (<>
              <p className="subtitle">Reset your password</p>
              <form onSubmit={handleForgotCheck}>
                <div className="input-group">
                  <label htmlFor="fp-username">Username</label>
                  <input id="fp-username" type="text" required autoComplete="off"
                    value={fpUsername} onChange={e => setFpUsername(e.target.value)}
                    placeholder="Enter your username" autoFocus />
                </div>

                {fpErr && <div className="form-error" style={{ color: 'var(--red)', marginBottom: '.75rem', fontSize: '.85rem' }}>{fpErr}</div>}

                <button type="submit" disabled={fpBusy} className="btn primary full-width" style={{ marginBottom: '0.75rem' }}>
                  {fpBusy ? 'Checking…' : 'Continue'}
                </button>
                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={resetForgot}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Back to login
                  </button>
                </div>
              </form>
            </>)}

            {/* ── FORGOT: has 2FA → enter code + new password ── */}
            {screen === 'forgot_2fa' && (<>
              <p className="subtitle">Enter your authenticator code to reset your password</p>
              <form onSubmit={handleForgotReset}>
                <div className="input-group">
                  <label>2FA Code</label>
                  <input type="text" inputMode="numeric" required autoComplete="one-time-code"
                    value={fpCode} onChange={e => setFpCode(e.target.value)}
                    placeholder="6-digit code or XXXXX-XXXXX backup code" autoFocus />
                </div>

                <div className="input-group">
                  <label>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={fpShowPass ? 'text' : 'password'} required
                      value={fpNewPass} onChange={e => setFpNewPass(e.target.value)}
                      placeholder="Choose a new password"
                      style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }} />
                    {eyeBtn(fpShowPass, () => setFpShowPass(v => !v))}
                  </div>
                </div>

                {fpErr && <div className="form-error" style={{ color: 'var(--red)', marginBottom: '.75rem', fontSize: '.85rem' }}>{fpErr}</div>}

                <button type="submit" disabled={fpBusy} className="btn primary full-width" style={{ marginBottom: '0.75rem' }}>
                  {fpBusy ? 'Resetting…' : 'Reset Password'}
                </button>
                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={resetForgot}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Back to login
                  </button>
                </div>
              </form>
            </>)}

            {/* ── FORGOT: no 2FA → can't self-reset ── */}
            {screen === 'forgot_no2fa' && (<>
              <p className="subtitle" style={{ marginBottom: '1.25rem' }}>Password reset unavailable</p>
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '1rem 1.1rem',
                fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6,
                marginBottom: '1.25rem'
              }}>
                <p style={{ margin: '0 0 0.6rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Your account doesn't have 2FA enabled.
                </p>
                <p style={{ margin: '0 0 0.5rem' }}>
                  Self-service password reset requires an authenticator app. Since yours isn't set up, you have two options:
                </p>
                <ul style={{ margin: '0.25rem 0 0 1.1rem', padding: 0 }}>
                  <li style={{ marginBottom: '0.3rem' }}>Ask an <strong style={{ color: 'var(--accent)' }}>Admin</strong> to reset your password from the Users page.</li>
                  <li>Reset it directly <strong style={{ color: 'var(--accent)' }}>in the database</strong> using a bcrypt hash.</li>
                </ul>
              </div>
              <button type="button" onClick={resetForgot} className="btn outline full-width">
                Back to login
              </button>
            </>)}

            {/* ── FORGOT: success ── */}
            {screen === 'forgot_done' && (<>
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 0.85rem'
                }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" stroke="#22c55e" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', margin: '0 0 0.35rem' }}>Password reset!</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                  You can now log in with your new password.
                </p>
              </div>
              <button type="button" onClick={resetForgot} className="btn primary full-width">
                Back to login
              </button>
            </>)}

          </div>
        </div>
      </div>
    </div>
  );
}
