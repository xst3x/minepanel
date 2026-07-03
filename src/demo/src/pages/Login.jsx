import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BgCanvas from '../components/BgCanvas.jsx';
import { showRestrictionWarning } from '../components/DemoBanner.jsx';
import '../styles/pages/Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const dest = loc.state?.from?.pathname || '/panel';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [screen, setScreen] = useState('login');
  const [fpUsername, setFpUsername] = useState('');
  const [fpErr, setFpErr] = useState('');

  // Auto-login as Admin with demo credentials
  useEffect(() => {
    const doAutoLogin = async () => {
      try {
        await login('Admin', 'admin');
        navigate(dest, { replace: true });
      } catch (e) {
        // If auto-login fails, show the login form
      }
    };
    doAutoLogin();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(username, password, need2fa ? twoFactorCode : undefined);
      navigate(dest, { replace: true });
    } catch (e) {
      if (e.data?.requires2FA || /2fa/i.test(e.message)) setNeed2fa(true);
      setErr(e.message || 'Login failed. Try username: "Admin", password: "admin"');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotCheck = async (e) => {
    e.preventDefault();
    showRestrictionWarning('password.reset');
    setFpErr('Password reset is disabled in demo mode.');
  };

  const resetForgot = () => {
    setScreen('login');
    setFpUsername('');
    setFpErr('');
  };

  const handleRegister = (e) => {
    e.preventDefault();
    showRestrictionWarning('user.register');
  };

  return (
    <div id="app">
      <BgCanvas />
      <div id="auth-view" className="view active">
        <div className="auth-blob blob-top-left" />
        <div className="auth-blob blob-bottom-right" />
        <div className="auth-blob blob-center" />

        <div className="auth-container">
          <div className="auth-box">
            <div className="auth-brand">
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--accent)" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/><path d="M2 7v10"/><path d="M12 12v10"/><path d="M22 7v10"/>
              </svg>
              <h1>MinePanel</h1>
            </div>

            {screen === 'login' && (<>
              <p className="subtitle">Demo Mode — Auto-login in progress...</p>
              <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '0.5rem', background: 'var(--warning)', borderRadius: 'var(--radius)', color: '#000', fontSize: '0.82rem', fontWeight: 600 }}>
                ⚠️ This is a limited demo version.{' '}
                <a href="https://github.com/xst3x/minepanel" target="_blank" rel="noopener noreferrer" style={{ color: '#000', textDecoration: 'underline' }}>
                  Download Full Version ↗
                </a>
              </div>
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

                <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '1.25rem' }}>
                  <button type="button" onClick={() => { setScreen('forgot_username'); setFpErr(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Forgot password?
                  </button>
                  <button type="button" onClick={() => setScreen('register')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Create account
                  </button>
                </div>
              </form>
            </>)}

            {screen === 'register' && (<>
              <p className="subtitle">Create your account using an invite token</p>
              <form onSubmit={handleRegister}>
                <div className="input-group">
                  <label htmlFor="reg-token">Invite Token</label>
                  <input id="reg-token" type="text" required autoComplete="off" placeholder="Paste your invite token" autoFocus />
                </div>
                <div className="input-group">
                  <label htmlFor="reg-username">Username</label>
                  <input id="reg-username" type="text" required autoComplete="off" placeholder="Choose a username" />
                </div>
                <div className="input-group">
                  <label htmlFor="reg-password">Password</label>
                  <input id="reg-password" type="password" required placeholder="Choose a password" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div className="input-group">
                  <label htmlFor="reg-confirm">Confirm Password</label>
                  <input id="reg-confirm" type="password" required placeholder="Confirm your password" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" className="btn primary full-width" style={{ marginBottom: '0.75rem' }}>
                  Create Account
                </button>
                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={() => setScreen('login')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Back to login
                  </button>
                </div>
              </form>
            </>)}

            {screen === 'forgot_username' && (<>
              <p className="subtitle">Reset your password</p>
              <form onSubmit={handleForgotCheck}>
                <div className="input-group">
                  <label>Username</label>
                  <input type="text" required autoComplete="off"
                    value={fpUsername} onChange={e => setFpUsername(e.target.value)}
                    placeholder="Enter your username" autoFocus />
                </div>
                {fpErr && <div className="form-error" style={{ color: 'var(--red)', marginBottom: '.75rem', fontSize: '.85rem' }}>{fpErr}</div>}
                <button type="submit" className="btn primary full-width" style={{ marginBottom: '0.75rem' }}>
                  Continue
                </button>
                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={resetForgot}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline' }}>
                    Back to login
                  </button>
                </div>
              </form>
            </>)}

          </div>
        </div>
      </div>
    </div>
  );
}
