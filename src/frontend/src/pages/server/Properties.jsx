import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm } from '../../components/Toast.jsx';
import Select from '../../components/Select.jsx';

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

export default function ServerProperties() {
  const { serverId } = useOutletContext();

  const [properties, setProperties] = useState({});
  const [mode, setMode] = useState('visual'); // 'visual' | 'raw'
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
      // Build raw text from state properties
      let text = '';
      const finalProps = { ...properties, motd: motdVal };
      for (const [k, v] of Object.entries(finalProps)) {
        text += `${k}=${v}\n`;
      }
      setRawText(text);
      setMode('raw');
    } else {
      // Parse raw text back to properties state
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
      if (newProps.motd !== undefined) {
        setMotdVal(newProps.motd);
      }
      setMode('visual');
    }
  };

  // Save changes
  const handleSave = async () => {
    let payload = {};
    if (mode === 'raw') {
      const lines = rawText.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.substring(0, idx).trim();
          const v = trimmed.substring(idx + 1).trim();
          payload[k] = v;
        }
      });
    } else {
      payload = { ...properties, motd: motdVal };
    }

    try {
      await api(`/api/servers/${serverId}/properties`, {
        method: 'POST',
        body: payload
      });
      toast('Properties saved. Restart server to apply.', 'success');
      setProperties(payload);
      if (payload.motd !== undefined) {
        setMotdVal(payload.motd);
      }
    } catch (e) {
      toast('Failed to save properties: ' + e.message, 'error');
    }
  };

  // Update a single property
  const handlePropChange = (key, value) => {
    setProperties(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // MOTD Parser
  useEffect(() => {
    const parseMotd = (raw) => {
      const colorMap = {};
      MC_COLORS.forEach(c => colorMap[c.code] = c.hex);
      let html = '', curColor = '#aaaaaa', bold = false, italic = false, under = false, strike = false, obf = false;
      
      for (let i = 0; i < raw.length; i++) {
        if ((raw[i] === '&' || raw[i] === '§') && i + 1 < raw.length) {
          const c = raw[i + 1].toLowerCase();
          if (colorMap[c]) {
            curColor = colorMap[c];
            bold = italic = under = strike = obf = false;
          } else if (c === 'l') bold = true;
          else if (c === 'o') italic = true;
          else if (c === 'n') under = true;
          else if (c === 'm') strike = true;
          else if (c === 'k') obf = true;
          else if (c === 'r') {
            curColor = '#aaaaaa';
            bold = italic = under = strike = obf = false;
          }
          i++;
          continue;
        }
        let s = `color:${curColor};`;
        if (bold) s += 'font-weight:700;';
        if (italic) s += 'font-style:italic;';
        const td = [];
        if (under) td.push('underline');
        if (strike) td.push('line-through');
        if (td.length) s += `text-decoration:${td.join(' ')};`;
        
        const safe = raw[i] === '<' ? '&lt;' : raw[i] === '>' ? '&gt;' : raw[i] === '&' ? '&amp;' : raw[i];
        if (obf) {
          html += `<span class="mc-obf" style="${s}">?</span>`;
        } else {
          html += `<span style="${s}">${safe}</span>`;
        }
      }
      return html;
    };
    
    setMotdPreviewHtml(parseMotd(motdVal));
  }, [motdVal]);

  // Handle MOTD obfuscation animation
  useEffect(() => {
    const interval = setInterval(() => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      document.querySelectorAll('.mc-obf').forEach(el => {
        el.textContent = chars[Math.floor(Math.random() * chars.length)];
      });
    }, 80);
    return () => clearInterval(interval);
  }, [motdPreviewHtml]);

  // Insert formatting or special characters at cursor
  const insertTextAtCursor = (text) => {
    const ta = motdTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const newValue = value.slice(0, start) + text + value.slice(end);
    setMotdVal(newValue);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    }, 50);
  };

  // Icon upload
  const handleUploadPng = async (e) => {
    const file = e.target.files[0];
    if (!file || !window.serverIconHelper) return;
    try {
      toast('Uploading image...', 'info');
      const pngBlob = await window.serverIconHelper.processImage(file);
      const fd = new FormData();
      fd.append('icon', pngBlob, 'server-icon.png');
      await api(`/api/servers/${serverId}/properties/icon`, {
        method: 'POST',
        body: fd
      });
      window.serverIconHelper.invalidateIconCache(serverId);
      toast('Icon uploaded successfully!', 'success');
      loadIcon();
      
      // Update sidebar icons
      if (window.serverIconHelper.mountSidebarIcon) {
        document.querySelectorAll('.sidebar-server-item').forEach(btn => {
          if (btn.dataset.serverId === serverId) {
            const oldWrap = btn.querySelector('.sidebar-server-icon-wrap');
            if (oldWrap) oldWrap.remove();
            window.serverIconHelper.mountSidebarIcon(btn, serverId);
          }
        });
      }
    } catch (err) {
      toast('Failed to upload icon: ' + err.message, 'error');
    }
  };

  // Remove icon
  const handleRemoveIcon = async () => {
    if (!await showConfirm('Remove server icon?', 'Remove Icon')) return;
    try {
      await api(`/api/servers/${serverId}/properties/icon`, { method: 'DELETE' });
      if (window.serverIconHelper) {
        window.serverIconHelper.invalidateIconCache(serverId);
      }
      toast('Icon removed.', 'success');
      loadIcon();
    } catch (err) {
      toast('Failed to remove icon: ' + err.message, 'error');
    }
  };

  // Open item picker modal
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
      await api(`/api/servers/${serverId}/properties/icon`, {
        method: 'POST',
        body: fd
      });
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
    
    // Determine which keys belong to this category
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

            {/* Custom MOTD Editor (Always visible at the top of gameplay tab or as a special component) */}
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
                      {/* Use default minecraft item textures or text */}
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

    </div>
  );
}
