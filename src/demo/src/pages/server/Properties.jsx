import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm } from '../../components/Toast.jsx';
import Select from '../../components/Select.jsx';
import '../../styles/pages/server/Properties.css';

const MC_COLORS = [
  { code: '0', hex: '#000000', name: 'Black' },
  { code: '1', hex: '#0000AA', name: 'Dark Blue' },
  { code: '2', hex: '#00AA00', name: 'Dark Green' },
  { code: '3', hex: '#00AAAA', name: 'Dark Aqua' },
  { code: '4', hex: '#AA0000', name: 'Dark Red' },
  { code: '5', hex: '#AA00AA', name: 'Dark Purple' },
  { code: '6', hex: '#FFAA00', name: 'Gold' },
  { code: '7', hex: '#AAAAAA', name: 'Gray' },
  { code: '8', hex: '#555555', name: 'Dark Gray' },
  { code: '9', hex: '#5555FF', name: 'Blue' },
  { code: 'a', hex: '#55FF55', name: 'Green' },
  { code: 'b', hex: '#55FFFF', name: 'Aqua' },
  { code: 'c', hex: '#FF5555', name: 'Red' },
  { code: 'd', hex: '#FF55FF', name: 'Light Purple' },
  { code: 'e', hex: '#FFFF55', name: 'Yellow' },
  { code: 'f', hex: '#FFFFFF', name: 'White' },
];

const MC_FORMATS = [
  { code: 'l', label: '<strong>B</strong>', title: 'Bold (&l)' },
  { code: 'o', label: '<em>I</em>', title: 'Italic (&o)' },
  { code: 'n', label: '<u>U</u>', title: 'Underline (&n)' },
  { code: 'm', label: '<s>S</s>', title: 'Strikethrough (&m)' },
  { code: 'k', label: 'obf', title: 'Obfuscated (&k)' },
  { code: 'r', label: 'R', title: 'Reset (&r)' },
];

const SPECIAL_CHARS = '§¶©®™°±×÷←→↑↓↔★☆♠♣♥♦•▪▲▶◆●∞√∑πΔΩαβγλ☀⚡⚔⚙✓✘❤☮♩♪♫♬①②③④⑤⑥⑦⑧⑨⑩'.split('');

const CATEGORIES = {
  gameplay: ['difficulty', 'gamemode', 'hardcore', 'pvp', 'spawn-protection', 'spawn-npcs', 'spawn-animals', 'spawn-monsters', 'force-gamemode', 'allow-flight', 'player-idle-timeout', 'spawn-limits.monsters', 'spawn-limits.animals', 'view-distance'],
  performance: ['view-distance', 'simulation-distance', 'max-tick-time', 'network-compression-threshold', 'sync-chunk-writes', 'entity-broadcast-range-percentage', 'chunk-garbage-collector', 'max-auto-save-chunks-per-tick'],
  world: ['level-name', 'level-seed', 'level-type', 'generator-settings', 'generate-structures', 'allow-nether', 'enable-query', 'max-world-size', 'resource-pack', 'require-resource-pack'],
  network: ['server-ip', 'server-port', 'server-portv6', 'max-players', 'online-mode', 'prevent-proxy-connections', 'enable-rcon', 'rcon.port', 'rcon.password'],
  security: ['online-mode', 'prevent-proxy-connections', 'white-list', 'enforce-whitelist', 'hide-online-players']
};

const ENUM_PROPS = {
  'difficulty': ['peaceful', 'easy', 'normal', 'hard'],
  'gamemode': ['survival', 'creative', 'adventure', 'spectator'],
  'level-type': ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'],
  'default-game-mode': ['survival', 'creative', 'adventure', 'spectator'],
  'permission-level': ['1', '2', '3', '4'],
  'function-permission-level': ['1', '2', '3', '4'],
  'op-permission-level': ['1', '2', '3', '4'],
  'network-compression-threshold': ['-1', '64', '128', '256', '512'],
  'entity-broadcast-range-percentage': ['10', '25', '50', '75', '100', '125', '150', '175', '200'],
};

// Helper to normalize gamemode/difficulty for dropdown selection
const normalizeVal = (raw) => {
  const map = { '0': 'survival', '1': 'creative', '2': 'adventure', '3': 'spectator', 'false': 'peaceful', 'peaceful': 'peaceful', 'easy': 'easy', 'normal': 'normal', 'hard': 'hard' };
  return map[String(raw).toLowerCase()] || String(raw).toLowerCase();
};

// ── Color Picker Component ────────────────────────────────────────────────────
function CustomColorPicker({ onClose, onApply }) {
  const canvasRef = useRef(null);
  const cursorRef = useRef(null);
  const [brightness, setBrightness] = useState(50);
  const [wheelH, setWheelH] = useState(0);
  const [wheelS, setWheelS] = useState(0);
  const [hex, setHex] = useState('#6366f1');
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
  const trackGrad = `linear-gradient(to right, rgb(${r2},${g2},${b2}), rgb(${r3},${g3},${b3}))`;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pick a Custom Color</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {/* Color wheel */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <canvas
                ref={canvasRef}
                width={200}
                height={200}
                onMouseDown={onMouseDown}
                style={{ cursor: 'crosshair', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', display: 'block' }}
              />
              <div
                ref={cursorRef}
                style={{
                  position: 'absolute',
                  width: '12px',
                  height: '12px',
                  border: '2px solid white',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  marginTop: '-216px',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                  transform: 'translate(-6px, -6px)'
                }}
              />
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              {/* Brightness slider */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Brightness</label>
                <input
                  type="range"
                  min="0" max="100" value={brightness}
                  onChange={e => setBrightness(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Hex input */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Hex</label>
                <input
                  type="text"
                  value={hex}
                  onChange={e => {
                    setHex(e.target.value);
                    const rgb = hexToRgb(e.target.value);
                    if (rgb) {
                      const [h, s, l] = rgbToHsl(...rgb);
                      setWheelH(h);
                      setWheelS(s);
                      setBrightness(l);
                    }
                  }}
                  style={{ width: '100%', padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              {/* Color preview */}
              <div style={{
                width: '100%',
                height: '60px',
                background: hex,
                border: '2px dashed var(--border)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text)',
                textShadow: '0 0 2px rgba(0,0,0,0.5)'
              }}>
                {hex.toUpperCase()}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn outline" onClick={onClose}>Cancel</button>
                <button className="btn primary" onClick={() => onApply(hex)} style={{ flex: 1 }}>Apply Color</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServerProperties() {
  const { serverId } = useOutletContext();

  const [properties, setProperties] = useState({});
  const [mode, setMode] = useState('visual');
  const [activeCat, setActiveCat] = useState('gameplay');
  const [rawText, setRawText] = useState('');
  
  // Server Icon State
  const [iconUrl, setIconUrl] = useState(null);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [pickerItems, setPickerItems] = useState([]);
  const fileInputRef = useRef(null);

  // MOTD States
  const [motdVal, setMotdVal] = useState('');
  const [motdPreviewHtml, setMotdPreviewHtml] = useState('');
  const [showSpecialChars, setShowSpecialChars] = useState(false);
  const motdTextareaRef = useRef(null);

  // Custom Color States
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState('');

  useEffect(() => {
    loadProperties();
    loadIcon();
  }, [serverId]);

  const loadProperties = async () => {
    try {
      const data = await api(`/api/servers/${serverId}/properties`);
      setProperties(data || {});
      if (data && data.motd) {
        setMotdVal(data.motd);
      }
    } catch (e) {
      toast('Failed to load properties: ' + e.message, 'error');
    }
  };

  const loadIcon = async () => {
    if (window.serverIconHelper) {
      window.serverIconHelper.invalidateIconCache(serverId);
      const url = await window.serverIconHelper.fetchIconUrl(serverId);
      setIconUrl(url);
    }
  };

  // Switch to Raw / Visual Editor
  const handleToggleMode = () => {
    if (mode === 'visual') {
      let text = '';
      const finalProps = { ...properties, motd: motdVal };
      for (const [k, v] of Object.entries(finalProps)) {
        text += `${k}=${v}\n`;
      }
      setRawText(text);
      setMode('raw');
    } else {
      const lines = rawText.split('\n');
      const newProps = {};
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.substring(0, idx).trim();
          const v = trimmed.substring(idx + 1).trim();
          newProps[k] = v;
        }
      });
      setProperties(newProps);
      if (newProps.motd) setMotdVal(newProps.motd);
      setMode('visual');
    }
  };

  const handleSave = async () => {
    try {
      const finalProps = { ...properties, motd: motdVal };
      await api(`/api/servers/${serverId}/properties`, { method: 'POST', body: finalProps });
      toast('Properties saved successfully.', 'success');
    } catch (e) {
      toast('Failed to save properties: ' + e.message, 'error');
    }
  };

  const handleUploadPng = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('icon', file);
      await api(`/api/servers/${serverId}/properties/icon`, { method: 'POST', body: fd });
      window.serverIconHelper?.invalidateIconCache(serverId);
      toast('Icon updated successfully!', 'success');
      loadIcon();
    } catch (err) {
      toast('Failed to upload icon: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  const handleRemoveIcon = async () => {
    try {
      await api(`/api/servers/${serverId}/properties/icon`, { method: 'DELETE' });
      window.serverIconHelper?.invalidateIconCache(serverId);
      toast('Icon removed.', 'success');
      loadIcon();
    } catch (err) {
      toast('Failed to remove icon: ' + err.message, 'error');
    }
  };

  const insertTextAtCursor = (text) => {
    const textarea = motdTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const before = motdVal.substring(0, start);
    const after = motdVal.substring(end);
    const newVal = before + text + after;
    setMotdVal(newVal);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      textarea.focus();
    }, 0);
  };

  const renderMotdPreview = useCallback((text) => {
    const colorMap = MC_COLORS.reduce((acc, c) => { acc[c.code] = c.hex; return acc; }, {});
    let html = '';
    let i = 0;
    let currentColor = '#aaa';
    while (i < text.length) {
      if (text[i] === '&' && i + 1 < text.length) {
        const code = text[i + 1];
        if (code === 'r') {
          currentColor = '#aaa';
          i += 2;
        } else if (colorMap[code]) {
          currentColor = colorMap[code];
          i += 2;
        } else {
          html += text[i];
          i++;
        }
      } else {
        html += text[i];
        i++;
      }
    }
    return `<span style="color:${currentColor}">${html}</span>`;
  }, []);

  useEffect(() => {
    setMotdPreviewHtml(renderMotdPreview(motdVal));
  }, [motdVal, renderMotdPreview]);

  const handleOpenItemPicker = async () => {
    if (!window.serverIconHelper) return;
    setShowItemPicker(true);
    const presets = window.serverIconHelper.PRESET_ITEMS || [];
    setPickerItems(presets);
    if (window.players && window.players.assetsMapper) {
      await window.players.assetsMapper.init(serverId);
    }
  };

  const handleSelectPresetItem = async (itemId) => {
    if (!window.serverIconHelper) return;
    try {
      setShowItemPicker(false);
      toast('Rendering item icon...', 'info');
      const pngBlob = await window.serverIconHelper.renderItemToPngBlob(itemId, serverId);
      const fd = new FormData();
      fd.append('icon', pngBlob, 'server-icon.png');
      await api(`/api/servers/${serverId}/properties/icon`, { method: 'POST', body: fd });
      window.serverIconHelper.invalidateIconCache(serverId);
      toast('Icon updated successfully!', 'success');
      loadIcon();
    } catch (err) {
      toast('Failed to apply item icon: ' + err.message, 'error');
    }
  };

  // Render Visual inputs based on active Category
  const renderVisualProperties = () => {
    const list = [];
    const keys = Object.keys(properties).sort();
    
    const categoryKeys = keys.filter(k => {
      if (activeCat === 'other') {
        return !Object.values(CATEGORIES).some(arr => arr.includes(k)) && k !== 'motd';
      }
      return CATEGORIES[activeCat]?.includes(k) && k !== 'motd';
    });

    if (categoryKeys.length === 0) {
      return <p className="text-muted" style={{ gridColumn: '1 / -1' }}>No properties in this category.</p>;
    }

    return categoryKeys.map(k => {
      const v = properties[k];
      const isBool = v === 'true' || v === 'false';
      const enumOpts = ENUM_PROPS[k];

      let inputEl = null;

      if (isBool) {
        inputEl = (
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={v === 'true'}
              onChange={(e) => handlePropChange(k, e.target.checked ? 'true' : 'false')}
            />
            <span className="toggle-slider"></span>
          </label>
        );
      } else if (enumOpts) {
        const currentNorm = normalizeVal(v);
        inputEl = (
          <Select
            value={v}
            onChange={(e) => handlePropChange(k, e.target.value)}
            style={{ width: '180px' }}
          >
            {enumOpts.map(o => (
              <option key={o} value={o}>
                {o.replace('minecraft:', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </option>
            ))}
          </Select>
        );
      } else if (!isNaN(v) && v !== '') {
        inputEl = (
          <input
            type="number"
            value={v}
            onChange={(e) => handlePropChange(k, e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '6px 10px', width: '120px' }}
          />
        );
      } else {
        inputEl = (
          <input
            type="text"
            value={v}
            onChange={(e) => handlePropChange(k, e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '6px 10px', width: '100%', maxWidth: '300px' }}
          />
        );
      }

      return (
        <div className="prop-item" key={k}>
          <span className="prop-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{k}</span>
          <div className="prop-input">{inputEl}</div>
        </div>
      );
    });
  };

  const handlePropChange = (key, val) => {
    setProperties(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Server Icon Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Server Icon</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn outline small" onClick={() => fileInputRef.current?.click()}>Upload PNG</button>
            {iconUrl && <button className="btn danger small" onClick={handleRemoveIcon}>Remove</button>}
          </div>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleUploadPng}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            border: '2px dashed var(--border)',
            borderRadius: '8px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-input)',
            flexShrink: 0
          }}>
            {iconUrl ? (
              <img
                src={iconUrl}
                alt="Server Icon"
                style={{ width: '64px', height: '64px', imageRendering: 'pixelated' }}
              />
            ) : (
              <svg viewBox="0 0 24 24" width="28" height="28" stroke="var(--text-muted)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
          <div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--text)' }}>
              Displayed in the Minecraft server list and in the panel sidebar.
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Upload any image or pick a Minecraft item &mdash; both are saved as a 64&times;64 px PNG.
            </p>
          </div>
        </div>
      </div>

      {/* Properties Editor Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0 }}>Server Properties</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn outline small" onClick={handleToggleMode}>
              {mode === 'visual' ? 'Raw Editor' : 'Visual Editor'}
            </button>
            <button className="btn primary" onClick={handleSave}>Save Changes</button>
          </div>
        </div>

        {mode === 'visual' ? (
          <>
            {/* Visual Editor Categories Tabs */}
            <div className="sub-nav" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              {['gameplay', 'performance', 'world', 'network', 'security', 'other'].map(cat => (
                <button
                  key={cat}
                  className={`sub-nav-item${activeCat === cat ? ' active' : ''}`}
                  onClick={() => setActiveCat(cat)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Custom MOTD Editor */}
            {activeCat === 'gameplay' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <span className="prop-label" style={{ fontWeight: 600 }}>Message of the Day (MOTD)</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Colors */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {MC_COLORS.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        title={`&${c.code} - ${c.name}`}
                        onClick={() => insertTextAtCursor(`&${c.code}`)}
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: 'var(--radius-sm)',
                          background: c.hex,
                          border: '1px solid rgba(255,255,255,0.12)',
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          fontWeight: 700,
                          color: ['0','1','2','3','4','5','8'].includes(c.code) ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {c.code}
                      </button>
                    ))}
                    <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 2px' }} />
                  </div>

                  {/* Formats */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                    {MC_FORMATS.map(f => (
                      <button
                        key={f.code}
                        type="button"
                        title={f.title}
                        className="btn outline small"
                        style={{ minWidth: '30px' }}
                        dangerouslySetInnerHTML={{ __html: f.label }}
                        onClick={() => insertTextAtCursor(`&${f.code}`)}
                      />
                    ))}
                    <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 2px' }} />
                    <button
                      type="button"
                      className="btn outline small"
                      onClick={() => setMotdVal(prev => prev.replace(/&[0-9a-fk-or]/gi, ''))}
                    >
                      Clear codes
                    </button>
                  </div>

                  {/* Input Textarea */}
                  <textarea
                    ref={motdTextareaRef}
                    rows="2"
                    spellcheck="false"
                    placeholder="e.g. &aWelcome to &6My Server!"
                    value={motdVal}
                    onChange={(e) => setMotdVal(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      resize: 'vertical',
                      outline: 'none',
                      lineHeight: 1.5
                    }}
                  />

                  {/* Preview Box */}
                  <div
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '9px 14px',
                      minHeight: '36px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13.5px',
                      lineHeight: 1.5,
                      wordBreak: 'break-all',
                      color: '#aaa'
                    }}
                    dangerouslySetInnerHTML={{ __html: motdPreviewHtml || '<span style="color:#444">preview...</span>' }}
                  />

                  {/* Special Chars Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn outline small"
                      onClick={() => setShowSpecialChars(!showSpecialChars)}
                    >
                      Special chars {showSpecialChars ? '▲' : '▼'}
                    </button>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      Click a color or format to insert at cursor
                    </span>
                  </div>

                  {/* Special Chars Panel */}
                  {showSpecialChars && (
                    <div style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '8px',
                      maxHeight: '120px',
                      overflowY: 'auto'
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {SPECIAL_CHARS.map(ch => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => insertTextAtCursor(ch)}
                            style={{
                              width: '26px',
                              height: '26px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '14px',
                              background: 'none',
                              border: '1px solid transparent',
                              color: 'var(--text)',
                              padding: 0
                            }}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Custom Color Picker Section */}
            {activeCat === 'gameplay' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <span className="prop-label" style={{ fontWeight: 600 }}>Custom Color</span>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Pick a custom color for your server branding or panel theme (stored locally).
                </p>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: 'var(--radius)',
                      background: customColor || '#6366f1',
                      border: '2px solid var(--border)',
                      boxShadow: 'var(--shadow-sm)',
                      flexShrink: 0
                    }}
                  />
                  <button
                    className="btn primary"
                    onClick={() => setShowColorPicker(true)}
                  >
                    Open Color Picker
                  </button>
                  {customColor && (
                    <button
                      className="btn outline"
                      onClick={() => setCustomColor('')}
                    >
                      Reset
                    </button>
                  )}
                </div>
                {customColor && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {customColor.toUpperCase()}
                  </p>
                )}
              </div>
            )}

            {/* Properties List Grid */}
            <div className="props-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {renderVisualProperties()}
            </div>
          </>
        ) : (
          /* Raw Editor Mode */
          <div style={{ height: '450px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              spellcheck="false"
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--bg-input)',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                padding: '12px',
                border: 'none',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.6
              }}
            />
          </div>
        )}
      </div>

      {/* Preset Item Picker Modal */}
      {showItemPicker && (
        <div className="modal-overlay active" onClick={() => setShowItemPicker(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose Icon Item</h3>
              <button className="close-btn" onClick={() => setShowItemPicker(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {pickerItems.map(item => {
                  const resolvedId = window.serverIconHelper?.resolveItemId(item) || item;
                  return (
                    <button
                      key={item}
                      className="mc-slot has-item"
                      title={window.serverIconHelper?.formatItemLabel(resolvedId) || item}
                      onClick={() => handleSelectPresetItem(resolvedId)}
                      style={{
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-input)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontSize: '10px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
                        {resolvedId.substring(0, 5)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Color Picker Modal */}
      {showColorPicker && (
        <CustomColorPicker
          onClose={() => setShowColorPicker(false)}
          onApply={(hex) => {
            setCustomColor(hex);
            setShowColorPicker(false);
            toast(`Custom color set to ${hex}`, 'success');
          }}
        />
      )}

    </div>
  );
}
