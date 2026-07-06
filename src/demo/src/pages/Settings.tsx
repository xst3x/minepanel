import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { toast } from '../components/Toast.jsx';
import Select from '../components/Select.jsx';
import { showRestrictionWarning } from '../components/DemoBanner.jsx';
import '../styles/pages/Settings.css';

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

  const [selectedAccent, setSelectedAccent] = useState(localStorage.getItem('mp_accent') || 'hsl(149,100%,47%)');
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
    showRestrictionWarning('settings.save');
  };

  const handlePortChange = async () => {
    showRestrictionWarning('settings.port');
  };

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <button className="back-btn" onClick={() => navigate('/panel')} style={{ marginBottom: '1rem' }}>
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Servers
      </button>

      <div className="page-header">
        <h2>Panel Settings</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600, padding: '0.3rem 0.8rem', background: 'var(--warning)', color: '#000', borderRadius: 'var(--radius)' }}>
          ⚠️ Read-Only Demo
        </span>
      </div>

      {loading ? (
        <p className="text-muted">Loading settings...</p>
      ) : (
        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>

          <div className="card">
            <h3>Security &amp; Rate Limits</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}><label>Login Cooldown (seconds)</label><input type="number" value={loginCooldown} disabled style={{ opacity: 0.5 }} /></div>
            <div className="form-group"><label>Max Login Attempts</label><input type="number" value={maxAttempts} disabled style={{ opacity: 0.5 }} /></div>
            <div className="form-group"><label>API Rate Limit (requests/min)</label><input type="number" value={rateLimit} disabled style={{ opacity: 0.5 }} /></div>
          </div>

          <div className="card">
            <h3>Network &amp; Ports</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}><label>Server Port</label><input type="number" value={systemPort} disabled style={{ opacity: 0.5 }} /></div>
            <div className="form-group"><label>FTP Service Port</label><input type="number" value={ftpPort} disabled style={{ opacity: 0.5 }} /></div>
          </div>

          <div className="card accent-appearance-card" style={{ minWidth: 0 }}>
            <h3>Appearance</h3>
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 1.25rem' }}>Accent color — saved locally and applied instantly.</p>
            <div className="accent-picker" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', gap: '10px 6px', marginBottom: '1rem' }}>
              {ACCENT_PRESETS.map(preset => {
                const isSelected = selectedAccent === preset.value;
                return (
                  <div key={preset.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                    <button title={preset.label} onClick={() => { setSelectedAccent(preset.value); applyAccent(preset.value); toast(`Accent: ${preset.label}`, 'success'); }}
                      style={{ width: 44, height: 44, borderRadius: '50%', background: preset.value, cursor: 'pointer', padding: 0,
                        border: isSelected ? '3px solid var(--text-primary)' : '3px solid transparent',
                        boxShadow: isSelected ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${preset.value}` : '0 2px 6px rgba(0,0,0,0.35)',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.18s cubic-bezier(0.34,1.4,0.64,1)', flexShrink: 0 }} />
                  </div>
                );
              })}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                <button title="Custom color" onClick={() => setShowColorWell(true)}
                  style={{ width: 44, height: 44, borderRadius: '50%', background: 'transparent', cursor: 'pointer', padding: 0,
                    border: '2px dashed var(--border-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.18s ease', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>System &amp; Server Defaults</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}><label>Default RAM (MB)</label><input type="number" value={defaultRam} disabled style={{ opacity: 0.5 }} /></div>
            <div className="form-group"><label>Default Port</label><input type="number" value={defaultPort} disabled style={{ opacity: 0.5 }} /></div>
            <div className="form-group"><label>Max RAM per Server (MB)</label><input type="number" value={maxRam} disabled style={{ opacity: 0.5 }} /></div>
          </div>

          <div className="card">
            <h3>Account Registration</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Require Invite Token</span>
                <label className="toggle-switch"><input type="checkbox" checked={requireInviteToken} disabled /><span className="toggle-slider"></span></label>
              </label>
            </div>
          </div>

        </div>
      )}

      {showColorWell && (
        <ColorWell onClose={() => setShowColorWell(false)} onApply={(hsl, label) => { setSelectedAccent(hsl); applyAccent(hsl); setShowColorWell(false); toast(`Accent: ${label}`, 'success'); }} />
      )}
    </div>
  );
}

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

  function hslToRgb(h, s, l) { s/=100; l/=100; const k=n=>(n+h/30)%12; const a=s*Math.min(l,1-l); const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))); return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)]; }
  function rgbToHsl(r,g,b) { r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h=0,s=0,l=(mx+mn)/2; if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break}} return [Math.round(h*360),Math.round(s*100),Math.round(l*100)]; }
  function toHex(r,g,b) { return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
  function hexToRgb(h) { const c=h.replace('#',''); if(c.length!==6)return null; return [parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)]; }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let angle = 0; angle < 360; angle++) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `hsl(${angle},0%,50%)`);
      grad.addColorStop(1, `hsl(${angle},100%,50%)`);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, (angle-0.5)*Math.PI/180, (angle+1.5)*Math.PI/180); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
    }
    const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.15);
    radGrad.addColorStop(0, 'rgba(128,128,128,1)'); radGrad.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = radGrad; ctx.fill();
  }, []);

  const syncFromHSL = useCallback((h, s, l) => {
    const [r, g, b] = hslToRgb(h, s, l);
    setRgb({ r, g, b }); setHex(toHex(r, g, b));
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
    const canvas = canvasRef.current; if (!canvas) return;
    const cx = canvas.width / 2;
    const dx = x - cx, dy = y - cx;
    const dist = Math.min(Math.sqrt(dx*dx+dy*dy), cx-4);
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const sat = dist / (cx-4) * 100;
    setWheelH(angle); setWheelS(sat);
  }

  function onMouseDown(e) { dragging.current = true; const rc = canvasRef.current.getBoundingClientRect(); pickWheel(e.clientX-rc.left, e.clientY-rc.top); }
  useEffect(() => {
    function onMove(e) { if (!dragging.current) return; const rc = canvasRef.current?.getBoundingClientRect(); if (rc) pickWheel(e.clientX-rc.left, e.clientY-rc.top); }
    function onUp() { dragging.current = false; }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  const handleHexChange = (e) => {
    const val = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value;
    setHex(val);
    if (hexRegex.test(val)) {
      const parsed = hexToRgb(val);
      if (parsed) {
        setRgb({ r: parsed[0], g: parsed[1], b: parsed[2] });
        const [h, s, l] = rgbToHsl(...parsed);
        setWheelH(h);
        setWheelS(s);
        setBrightness(l);
      }
    }
  };

  const previewColor = toHex(...hslToRgb(wheelH, wheelS, brightness));
  const hslValue = `hsl(${Math.round(wheelH)},${Math.round(wheelS)}%,${Math.round(brightness)}%)`;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Custom Accent Color</h3><button className="close-btn" onClick={onClose}>&times;</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto' }}>
            <canvas ref={canvasRef} width={200} height={200} style={{ borderRadius: '50%', cursor: 'crosshair', display: 'block' }} onMouseDown={onMouseDown} />
            <div ref={cursorRef} style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)', transform: 'translate(-50%,-50%)', pointerEvents: 'none', left: 100, top: 100 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            {['r','g','b'].map(ch => (
              <div key={ch} style={{ flex: 1 }}><label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>{ch}</label>
                <input type="number" min={0} max={255} value={rgb[ch]} onChange={e => { const newRgb = {...rgb, [ch]: Math.max(0, Math.min(255, parseInt(e.target.value)||0))}; setRgb(newRgb); setHex(toHex(newRgb.r, newRgb.g, newRgb.b)); const [h,s,l] = rgbToHsl(newRgb.r,newRgb.g,newRgb.b); setWheelH(h); setWheelS(s); setBrightness(l); }} style={{ width: '100%', textAlign: 'center' }} /></div>
            ))}
            <div style={{ flex: 2 }}><label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>HEX</label>
              <input type="text" value={hex} maxLength={7} onChange={handleHexChange} /></div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius)', background: previewColor, flexShrink: 0, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Name this color" maxLength={24} value={colorName} onChange={e => setColorName(e.target.value)} style={{ flex: 1 }} />
          </div>
        </div>
        <div className="modal-footer"><button className="btn outline" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onApply(hslValue, colorName.trim()||'Custom')}>Apply</button></div>
      </div>
    </div>
  );
}
