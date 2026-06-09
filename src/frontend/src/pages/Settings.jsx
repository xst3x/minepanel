import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { toast, showConfirm } from '../components/Toast.jsx';
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
          defaultRankId: defaultRankId ? Number(defaultRankId) : null
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
      {/* Back button â€” same as old frontend */}
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

          {/* Network & Ports â€” exact same card as old frontend, combined */}
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
              Your accent color â€” saved to your account and applied instantly everywhere.
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
              <select
                value={defaultRankId}
                onChange={e => setDefaultRankId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '13.5px', outline: 'none' }}
              >
                <option value="">â€” No rank â€”</option>
                {ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

        </div>
      )}

      {/* Color Well Modal */}
      {showColorWell && (
        <ColorWell
          onClose={() => setShowColorWell(false)}
          onApply={(hsl, label) => {
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

// â”€â”€ Color Well (custom color picker) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ColorWell({ onClose, onApply }) {
  const canvasRef = useRef(null);
  const cursorRef = useRef(null);
  const [brightness, setBrightness] = useState(50);
  const [wheelH, setWheelH] = useState(0);
  const [wheelS, setWheelS] = useState(0);
  const [hex, setHex] = useState('#6366f1');
  const [rgb, setRgb] = useState({ r: 99, g: 102, b: 241 });
  const [colorName, setColorName] = useState('');
  const dragging = useRef(false);
  const hRef = useRef(0);
  const sRef = useRef(0);

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }
  function toHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function hexToRgb(h) {
    const c = h.replace('#', '');
    if (c.length !== 6) return null;
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let angle = 0; angle < 360; angle++) {
      const startAngle = (angle - 0.5) * Math.PI / 180;
      const endAngle = (angle + 1.5) * Math.PI / 180;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `hsl(${angle},0%,50%)`);
      grad.addColorStop(1, `hsl(${angle},100%,50%)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.15);
    radGrad.addColorStop(0, 'rgba(128,128,128,1)');
    radGrad.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = radGrad; ctx.fill();
  }, []);

  const syncFromHSL = useCallback((h, s, l) => {
    const [r, g, b] = hslToRgb(h, s, l);
    setRgb({ r, g, b });
    setHex(toHex(r, g, b));
    const canvas = canvasRef.current;
    if (canvas && cursorRef.current) {
      const cx = canvas.width / 2;
      const rad = h * Math.PI / 180;
      const dist = (s / 100) * (cx - 4);
      cursorRef.current.style.left = (cx + Math.cos(rad) * dist) + 'px';
      cursorRef.current.style.top  = (cx + Math.sin(rad) * dist) + 'px';
    }
  }, []);

  useEffect(() => { syncFromHSL(wheelH, wheelS, brightness); }, [wheelH, wheelS, brightness]);

  function pickWheel(x, y) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const dx = x - cx, dy = y - cx;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), cx - 4);
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const sat = dist / (cx - 4) * 100;
    hRef.current = angle;
    sRef.current = sat;
    setWheelH(angle);
    setWheelS(sat);
  }

  function onMouseDown(e) {
    dragging.current = true;
    const rc = canvasRef.current.getBoundingClientRect();
    pickWheel(e.clientX - rc.left, e.clientY - rc.top);
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return;
      const rc = canvasRef.current?.getBoundingClientRect();
      if (rc) pickWheel(e.clientX - rc.left, e.clientY - rc.top);
    }
    function onUp() { dragging.current = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const [r2, g2, b2] = hslToRgb(wheelH, wheelS, 10);
  const [r3, g3, b3] = hslToRgb(wheelH, wheelS, 90);
  const trackGrad = `linear-gradient(to right, ${toHex(r2,g2,b2)}, ${toHex(r3,g3,b3)})`;
  const previewColor = toHex(...hslToRgb(wheelH, wheelS, brightness));
  const hslValue = `hsl(${Math.round(wheelH)},${Math.round(wheelS)}%,${Math.round(brightness)}%)`;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Custom Accent Color</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto' }}>
            <canvas ref={canvasRef} width={200} height={200}
              style={{ borderRadius: '50%', cursor: 'crosshair', display: 'block' }}
              onMouseDown={onMouseDown} />
            <div ref={cursorRef} style={{
              position: 'absolute', width: 14, height: 14,
              borderRadius: '50%', border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
              transform: 'translate(-50%,-50%)',
              pointerEvents: 'none', left: 100, top: 100,
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>Brightness</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: trackGrad, position: 'relative' }}>
              <input type="range" min={10} max={90} value={brightness}
                onChange={e => setBrightness(Number(e.target.value))}
                style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', height: '100%' }} />
              <div style={{
                position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)',
                left: `${(brightness - 10) / 80 * 100}%`,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff', border: '2px solid rgba(0,0,0,0.3)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)', pointerEvents: 'none',
              }} />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }}>{brightness}%</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            {['r','g','b'].map(ch => (
              <div key={ch} style={{ flex: 1 }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>{ch}</label>
                <input type="number" min={0} max={255} value={rgb[ch]}
                  onChange={e => {
                    const newRgb = { ...rgb, [ch]: Math.max(0, Math.min(255, parseInt(e.target.value) || 0)) };
                    setRgb(newRgb);
                    setHex(toHex(newRgb.r, newRgb.g, newRgb.b));
                    const [h, s, l] = rgbToHsl(newRgb.r, newRgb.g, newRgb.b);
                    setWheelH(h); setWheelS(s); setBrightness(l);
                  }}
                  style={{ width: '100%', textAlign: 'center' }} />
              </div>
            ))}
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>HEX</label>
              <input type="text" value={hex} maxLength={7}
                onChange={e => {
                  const val = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
                  setHex(val);
                  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    const parsed = hexToRgb(val);
                    if (parsed) {
                      setRgb({ r: parsed[0], g: parsed[1], b: parsed[2] });
                      const [h, s, l] = rgbToHsl(...parsed);
                      setWheelH(h); setWheelS(s); setBrightness(l);
                    }
                  }
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: previewColor, flexShrink: 0, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Name this colorâ€¦" maxLength={24}
              value={colorName} onChange={e => setColorName(e.target.value)}
              style={{ flex: 1 }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn outline" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onApply(hslValue, colorName.trim() || 'Custom')}>Apply</button>
        </div>
      </div>
    </div>
  );
}
