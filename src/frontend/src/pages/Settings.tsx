import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { toast, showConfirm } from '../components/Toast.tsx';
import Select from '../components/Select.tsx';
import ColorWell from '../components/ColorWell.tsx';
import '../styles/pages/Settings.css';
// Exact presets from old frontend
const ACCENT_PRESETS = [
  { id: 'emerald',       label: 'Emerald',       value: 'hsl(149,100%,47%)' },
  { id: 'midnight',      label: 'Midnight Blue',  value: 'hsl(230,60%,55%)'  },
  { id: 'sierra',        label: 'Sierra Blue',    value: 'hsl(190,85%,48%)'  },
  { id: 'pacific',       label: 'Pacific Blue',   value: 'hsl(210,78%,50%)'  },
  { id: 'alpine',        label: 'Alpine Green',   value: 'hsl(140,55%,38%)'  },
  { id: 'aquamarine',    label: 'Aquamarine',     value: 'hsl(160,60%,45%)'  },
  { id: 'lavender',      label: 'Lavender',       value: 'hsl(270,65%,60%)'  },
  { id: 'deeppurple',    label: 'Deep Purple',    value: 'hsl(280,70%,45%)'  },
  { id: 'babypink',      label: 'Baby Pink',      value: 'hsl(340,80%,60%)'  },
  { id: 'rosegold',      label: 'Rose Gold',      value: 'hsl(350,55%,65%)'  },
  { id: 'coral',         label: 'Coral',          value: 'hsl(10,90%,62%)'   },
  { id: 'tangerine',     label: 'Tangerine',      value: 'hsl(28,100%,55%)'  },
  { id: 'starlightgold', label: 'Starlight Gold', value: 'hsl(45,95%,55%)'   },
  { id: 'graphite',      label: 'Graphite',       value: 'hsl(220,8%,55%)'   },
  { id: 'starlight',     label: 'Starlight',      value: 'hsl(36,18%,82%)'   },
];

function applyAccent(hsl) {
  const r = document.documentElement;
  const m = hsl.match(/hsl\((\d+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
  if (m) {
    const [,h,s,l] = m;
    const lh = Math.min(100, parseFloat(l) + 8);
    r.style.setProperty('--accent', hsl);
    r.style.setProperty('--accent-hover', `hsl(${h},${s}%,${lh}%)`);
    r.style.setProperty('--accent-glow', `hsla(${h},${s}%,${l}%,0.15)`);
    r.style.setProperty('--accent-subtle', `hsla(${h},${s}%,${l}%,0.08)`);
    r.style.setProperty('--green', hsl);
  }
  localStorage.setItem('mp_accent', hsl);
}

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ranks, setRanks] = useState([]);

  const [selectedAccent, setSelectedAccent] = useState(
    localStorage.getItem('mp_accent') || 'hsl(149,100%,47%)'
  );
  const [showColorWell, setShowColorWell] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [rateLimit, setRateLimit] = useState(100);
  const [defaultRam, setDefaultRam] = useState(2048);
  const [defaultPort, setDefaultPort] = useState(25565);
  const [maxRam, setMaxRam] = useState(16384);
  const [ftpPort, setFtpPort] = useState(2121);
  const [ftpEnabled, setFtpEnabled] = useState(false);
  const [requireInviteToken, setRequireInviteToken] = useState(true);
  const [defaultRankId, setDefaultRankId] = useState('');
  const [defaultJavaPath, setDefaultJavaPath] = useState('java');
  const [systemPort, setSystemPort] = useState('');
  const [switchingPort, setSwitchingPort] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const s = await api('/api/system/settings');
      setLoginCooldown(s.loginCooldown ?? 60);
      setMaxAttempts(s.maxAttempts ?? 5);
      setRateLimit(s.rateLimit ?? 100);
      setDefaultRam(s.defaultRam ?? 2048);
      setDefaultPort(s.defaultPort ?? 25565);
      setMaxRam(s.maxRam ?? 16384);
      setFtpPort(s.ftpPort ?? 2121);
      setFtpEnabled(!!s.ftpEnabled);
      setRequireInviteToken(s.requireInviteTokenToCreateAccount !== false);
      setDefaultRankId(s.defaultRankId || '');
      setDefaultJavaPath(s.defaultJavaPath || 'java');
      const ranksData = await api('/api/ranks');
      setRanks(ranksData || []);
      setSystemPort(window.location.port || (window.location.protocol === 'https:' ? '443' : '80'));
    } catch (err) {
      toast('Failed to load settings: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await api('/api/system/settings', {
        method: 'POST',
        body: {
          loginCooldown: Number(loginCooldown),
          maxAttempts: Number(maxAttempts),
          rateLimit: Number(rateLimit),
          ftpPort: Number(ftpPort),
          ftpEnabled,
          defaultRam: Number(defaultRam),
          defaultPort: Number(defaultPort),
          maxRam: Number(maxRam),
          requireInviteTokenToCreateAccount: requireInviteToken,
          defaultRankId: defaultRankId ? Number(defaultRankId) : null,
          defaultJavaPath: defaultJavaPath.trim() || 'java'
        }
      });
      toast(res.message || 'System settings saved.', 'success');
      loadSettings();
    } catch (err) {
      toast('Failed to save settings: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePortChange = async () => {
    const newPort = parseInt(systemPort, 10);
    if (isNaN(newPort) || newPort < 1 || newPort > 65535) {
      return toast('Invalid port number. Must be between 1 and 65535.', 'error');
    }
    const currentPort = parseInt(window.location.port || (window.location.protocol === 'https:' ? '443' : '80'), 10);
    if (newPort === currentPort) return toast('The new port is the same as the current port.', 'warning');

    const ok = await showConfirm(`Are you sure you want to change the server port to ${newPort}? This will temporarily disconnect your current session and restart the panel process.`, 'Change Port');
    if (!ok) return;

    setSwitchingPort(true);
    try {
      await api('/api/system/change-port', { method: 'POST', body: { port: newPort } });
      toast('Applying changes and restarting server...', 'info');
      setTimeout(() => pollNewPort(newPort, currentPort), 1500);
    } catch (err) {
      toast('Failed to change port: ' + err.message, 'error');
      setSwitchingPort(false);
    }
  };

  const pollNewPort = (newPort, oldPort) => {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const testUrl = `${protocol}//${hostname}:${newPort}/api/system/health`;
    let attempt = 0;
    let delay = 500;
    function check() {
      attempt++;
      fetch(testUrl, { cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
          if (data?.booted === true) {
            toast('Server is back online! Redirecting...', 'success');
            setTimeout(() => {
              window.location.href = `${protocol}//${hostname}:${newPort}${window.location.pathname}${window.location.search}${window.location.hash}`;
            }, 1000);
          } else { throw new Error('Not fully booted'); }
        })
        .catch(() => {
          if (attempt > 30) {
            toast('New port connection timed out. Reconnection failed.', 'error');
            setSwitchingPort(false);
            return;
          }
          if (attempt <= 5) delay = 500;
          else if (attempt <= 20) delay = 1000;
          else delay = 2000;
          setTimeout(check, delay);
        });
    }
    check();
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      {/* Back button  same as old frontend */}
      <button className="back-btn" onClick={() => navigate('/panel')} style={{ marginBottom: '1rem' }}>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Servers
      </button>

      <div className="page-header">
        <h2>Panel Settings</h2>
        <button className="btn primary" onClick={handleSaveSettings} disabled={saving || loading}>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Loading settings...</p>
      ) : (
        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>

          {/* Security & Rate Limits */}
          <div className="card">
            <h3>Security &amp; Rate Limits</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Login Cooldown (seconds)</label>
              <input type="number" value={loginCooldown} onChange={e => setLoginCooldown(e.target.value)} placeholder="60" />
            </div>
            <div className="form-group">
              <label>Max Login Attempts</label>
              <input type="number" value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} placeholder="5" />
            </div>
            <div className="form-group">
              <label>API Rate Limit (requests/min)</label>
              <input type="number" value={rateLimit} onChange={e => setRateLimit(e.target.value)} placeholder="100" />
            </div>
          </div>

          {/* Network & Ports  exact same card as old frontend, combined */}
          <div className="card">
            <h3>Network &amp; Ports</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Server Port</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  value={systemPort}
                  onChange={e => setSystemPort(e.target.value)}
                  min="1" max="65535"
                  style={{ flex: 1 }}
                  placeholder="8082"
                  disabled={switchingPort}
                />
                <button
                  className="btn primary"
                  id="btn-apply-server-port"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={handlePortChange}
                  disabled={switchingPort || loading}
                >
                  {switchingPort ? 'Restarting...' : 'Apply Port Change'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>FTP Service Port</label>
              <input type="number" value={ftpPort} onChange={e => setFtpPort(e.target.value)} placeholder="2121" min="1" max="65535" />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <span>Enable Sandboxed FTP</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={ftpEnabled} onChange={e => setFtpEnabled(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </label>
            </div>
          </div>

          {/* Appearance */}
          <div className="card accent-appearance-card" style={{ minWidth: 0 }}>
            <h3>Appearance</h3>
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 1.25rem' }}>
              Your accent color  saved to your account and applied instantly everywhere.
            </p>
            <div className="accent-picker" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', gap: '10px 6px', marginBottom: '1rem' }}>
              {ACCENT_PRESETS.map(preset => {
                const isSelected = selectedAccent === preset.value;
                return (
                  <div key={preset.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                    <button
                      title={preset.label}
                      onClick={() => { setSelectedAccent(preset.value); applyAccent(preset.value); toast(`Accent: ${preset.label}`, 'success'); }}
                      style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: preset.value,
                        cursor: 'pointer', padding: 0,
                        border: isSelected ? '3px solid var(--text-primary)' : '3px solid transparent',
                        boxShadow: isSelected
                          ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${preset.value}`
                          : '0 2px 6px rgba(0,0,0,0.35)',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                        transition: 'all 0.18s cubic-bezier(0.34,1.4,0.64,1)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '0.62rem', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                      {preset.label}
                    </span>
                  </div>
                );
              })}
              {/* Custom color button */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                <button
                  title="Custom color"
                  onClick={() => setShowColorWell(true)}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'transparent',
                    cursor: 'pointer', padding: 0,
                    border: '2px dashed var(--border-hover)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                    transition: 'all 0.18s ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Custom</span>
              </div>
            </div>
            <p className="accent-selected-label" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Selected: <span id="accent-selected-name" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {ACCENT_PRESETS.find(p => p.value === selectedAccent)?.label || 'Custom'}
              </span>
            </p>
          </div>

          {/* System & Server Defaults */}
          <div className="card">
            <h3>System &amp; Server Defaults</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Default Server Creation RAM (MB)</label>
              <input type="number" value={defaultRam} onChange={e => setDefaultRam(e.target.value)} placeholder="2048" />
            </div>
            <div className="form-group">
              <label>Default Server Port</label>
              <input type="number" value={defaultPort} onChange={e => setDefaultPort(e.target.value)} placeholder="25565" />
            </div>
            <div className="form-group">
              <label>Max RAM allocation per Server (MB)</label>
              <input type="number" value={maxRam} onChange={e => setMaxRam(e.target.value)} placeholder="16384" />
            </div>
            <div className="form-group">
              <label>Default Java Path</label>
              <input type="text" value={defaultJavaPath} onChange={e => setDefaultJavaPath(e.target.value)} placeholder="java" />
              <p className="text-muted" style={{ fontSize: '0.79rem', margin: '0.5rem 0 0' }}>
                Used for new servers and any server without its own custom Java path set. Leave as "java" to use the system PATH (or the auto-managed Java runtime as fallback).
              </p>
            </div>
          </div>

          {/* Account Registration */}
          <div className="card">
            <h3>Account Registration</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Require Invite Token to Create Account</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={requireInviteToken} onChange={e => setRequireInviteToken(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </label>
              <p className="text-muted" style={{ fontSize: '0.79rem', margin: '0.5rem 0 0' }}>
                When enabled, users must have an invite token to register. When disabled, anyone can create an account (invite tokens still work).
              </p>
            </div>
            <div className="form-group" id="ps-default-rank-group" style={{ marginTop: '1.25rem' }}>
              <label>Default Rank for New Accounts</label>
              <p className="text-muted" style={{ fontSize: '0.79rem', margin: '0.25rem 0 0.5rem' }}>
                Applied when a user registers without an invite token.
              </p>
              <Select
                value={defaultRankId}
                onChange={e => setDefaultRankId(e.target.value)}
              >
                <option value=""> No rank </option>
                {ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
          </div>

        </div>
      )}

      {/* Color Well Modal */}
      {showColorWell && (
        <ColorWell
          onClose={() => setShowColorWell(false)}
          onApply={(hex, hsl, label) => {
            setSelectedAccent(hsl);
            applyAccent(hsl);
            setShowColorWell(false);
            toast(`Accent: ${label}`, 'success');
          }}
        />
      )}
    </div>
  );
}

