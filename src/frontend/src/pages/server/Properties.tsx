import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.ts';
import { toast, showConfirm } from '../../components/Toast.tsx';
import Select from '../../components/Select.tsx';
import ColorWell from '../../components/ColorWell.tsx';
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
  const [pickedCustomColor, setPickedCustomColor] = useState('');
  const [showColorWell, setShowColorWell] = useState(false);
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
    let bold = false;
    let italic = false;
    let underline = false;
    let strikethrough = false;
    let obfuscated = false;

    const getSpanOpen = (color, b, it, u, s, ob) => {
      let styles = `color: ${color};`;
      if (b) styles += ' font-weight: bold;';
      if (it) styles += ' font-style: italic;';
      let dec = '';
      if (u) dec += ' underline';
      if (s) dec += ' line-through';
      if (dec) styles += ` text-decoration:${dec};`;
      const className = ob ? 'class="motd-obfuscated"' : '';
      return `<span style="${styles}" ${className}>`;
    };

    let currentSpanContent = '';

    const closeAndStartNew = (newColor, newB, newIt, newU, newS, newOb) => {
      if (currentSpanContent) {
        html += getSpanOpen(currentColor, bold, italic, underline, strikethrough, obfuscated) + currentSpanContent + '</span>';
        currentSpanContent = '';
      }
      currentColor = newColor;
      bold = newB;
      italic = newIt;
      underline = newU;
      strikethrough = newS;
      obfuscated = newOb;
    };

    while (i < text.length) {
      if (text[i] === '&' && i + 1 < text.length) {
        // Hex color: &#RRGGBB
        if (text[i + 1] === '#' && i + 7 < text.length) {
          const hexCode = text.substring(i + 2, i + 8);
          if (/^[0-9a-fA-F]{6}$/.test(hexCode)) {
            closeAndStartNew('#' + hexCode, bold, italic, underline, strikethrough, obfuscated);
            i += 8;
            continue;
          }
        }

        const code = text[i + 1].toLowerCase();
        if (code === 'r') {
          closeAndStartNew('#aaa', false, false, false, false, false);
          i += 2;
        } else if (colorMap[code]) {
          closeAndStartNew(colorMap[code], false, false, false, false, false);
          i += 2;
        } else if (code === 'l') {
          closeAndStartNew(currentColor, true, italic, underline, strikethrough, obfuscated);
          i += 2;
        } else if (code === 'o') {
          closeAndStartNew(currentColor, bold, true, underline, strikethrough, obfuscated);
          i += 2;
        } else if (code === 'n') {
          closeAndStartNew(currentColor, bold, italic, true, strikethrough, obfuscated);
          i += 2;
        } else if (code === 'm') {
          closeAndStartNew(currentColor, bold, italic, underline, true, obfuscated);
          i += 2;
        } else if (code === 'k') {
          closeAndStartNew(currentColor, bold, italic, underline, strikethrough, true);
          i += 2;
        } else {
          currentSpanContent += text[i];
          i++;
        }
      } else {
        currentSpanContent += text[i];
        i++;
      }
    }

    if (currentSpanContent) {
      html += getSpanOpen(currentColor, bold, italic, underline, strikethrough, obfuscated) + currentSpanContent + '</span>';
    }

    return html;
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
      if (activeCat === 'world') {
        return CATEGORIES[activeCat]?.includes(k) && k !== 'motd' && !['level-type', 'level-seed', 'generator-settings', 'generate-structures'].includes(k);
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

            {/* Custom MOTD Editor Refinement */}
            {activeCat === 'gameplay' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <span className="prop-label" style={{ fontWeight: 600 }}>Message of the Day (MOTD)</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Compact formatting toolbar */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {/* Compact Color Palette */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginRight: '6px' }}>
                      {MC_COLORS.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          title={`&${c.code} - ${c.name}`}
                          onClick={() => insertTextAtCursor(`&${c.code}`)}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: c.hex,
                            border: '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            fontWeight: 'bold',
                            color: ['0','1','2','3','4','5','8'].includes(c.code) ? '#fff' : '#000',
                            transition: 'transform 0.1s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {c.code}
                        </button>
                      ))}
                      
                      {/* Custom color button */}
                      <button
                        type="button"
                        title="Custom Color"
                        onClick={() => {
                          setShowColorWell(true);
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: pickedCustomColor || 'linear-gradient(135deg, #ff2400, #e81d1d, #e8b01d, #1de840, #1ddde8, #2b1de8, #dd1de8)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: '#fff',
                          textShadow: '0px 0px 2px rgba(0,0,0,0.8)',
                          transition: 'transform 0.1s ease',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        +
                      </button>
                    </div>

                    <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 4px' }} />

                    {/* Compact style buttons */}
                    {MC_FORMATS.map(f => (
                      <button
                        key={f.code}
                        type="button"
                        title={f.title}
                        className="btn outline small"
                        style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px', minWidth: '24px' }}
                        dangerouslySetInnerHTML={{ __html: f.label }}
                        onClick={() => insertTextAtCursor(`&${f.code}`)}
                      />
                    ))}

                    <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 4px' }} />

                    <button
                      type="button"
                      className="btn outline small"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px' }}
                      onClick={() => setMotdVal(prev => prev.replace(/&[0-9a-fk-or]/gi, ''))}
                    >
                      Clear Codes
                    </button>
                    <button
                      type="button"
                      className="btn outline small"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px' }}
                      onClick={() => setMotdVal(properties.motd || '')}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className={`btn ${showSpecialChars ? 'primary' : 'outline'} small`}
                      style={{ padding: '2px 8px', fontSize: '0.75rem', height: '24px' }}
                      onClick={() => setShowSpecialChars(!showSpecialChars)}
                    >
                      Chars {showSpecialChars ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Special Chars Panel */}
                  {showSpecialChars && (
                    <div style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '6px',
                      maxHeight: '100px',
                      overflowY: 'auto'
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {SPECIAL_CHARS.map(ch => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => insertTextAtCursor(ch)}
                            style={{
                              width: '24px',
                              height: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.85rem',
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

                  {/* Input Textarea with character counter inside wrapper */}
                  <div style={{ position: 'relative' }}>
                    <textarea
                      ref={motdTextareaRef}
                      rows={2}
                      spellCheck="false"
                      placeholder="e.g. &aWelcome to &6My Server!"
                      value={motdVal}
                      onChange={(e) => setMotdVal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px 24px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--text)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        resize: 'vertical',
                        outline: 'none',
                        lineHeight: 1.4
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '6px',
                      right: '12px',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      pointerEvents: 'none'
                    }}>
                      {motdVal.length} chars
                    </div>
                  </div>

                  {/* Compact Live Preview inspired by Minecraft list */}
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginTop: '4px' }}>
                    MULTIPLAYER PREVIEW
                  </div>
                  <div className="motd-live-preview-box">
                    <div className="motd-preview-icon-container">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt="Server Icon"
                          className="motd-preview-icon-img"
                        />
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                      )}
                    </div>
                    <div className="motd-preview-text-col">
                      <div className="motd-preview-top-row">
                        <span className="motd-preview-server-title">
                          {properties['level-name'] || 'Minecraft Server'}
                        </span>
                        <div className="motd-preview-status-group">
                          <span className="motd-preview-players">
                            0 / {properties['max-players'] || '20'}
                          </span>
                          <div className="motd-preview-ping" title="0ms latency">
                            <span className="motd-preview-ping-bar"></span>
                            <span className="motd-preview-ping-bar"></span>
                            <span className="motd-preview-ping-bar"></span>
                            <span className="motd-preview-ping-bar"></span>
                            <span className="motd-preview-ping-bar"></span>
                          </div>
                        </div>
                      </div>
                      <div
                        className="motd-preview-rendered-body"
                        dangerouslySetInnerHTML={{ __html: motdPreviewHtml || '<span style="color:#aaa">A Minecraft Server</span>' }}
                      />
                    </div>
                  </div>

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
                      background: pickedCustomColor || '#6366f1',
                      border: '2px solid var(--border)',
                      boxShadow: 'var(--shadow-sm)',
                      flexShrink: 0
                    }}
                  />
                  <button
                    className="btn primary"
                    onClick={() => setShowColorWell(true)}
                  >
                    Open Color Picker
                  </button>
                  {pickedCustomColor && (
                    <button
                      className="btn outline"
                      onClick={() => setPickedCustomColor('')}
                    >
                      Reset
                    </button>
                  )}
                </div>
                {pickedCustomColor && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {pickedCustomColor.toUpperCase()}
                  </p>
                )}
              </div>
            )}

            {/* Custom World Generator Configuration */}
            {activeCat === 'world' && (() => {
              const GENERATOR_TYPES = [
                { id: 'minecraft:normal', label: 'Normal', desc: 'Standard Minecraft terrain generation.' },
                { id: 'minecraft:flat', label: 'Flat', desc: 'A completely flat world, useful for creative builds.' },
                { id: 'minecraft:large_biomes', label: 'Large Biomes', desc: 'Standard terrain but biomes are much larger.' },
                { id: 'minecraft:amplified', label: 'Amplified', desc: 'Massive mountains and deep valleys.' },
                { id: 'minecraft:single_biome_surface', label: 'Single Biome', desc: 'A world consisting entirely of one biome.' }
              ];
              const activeType = properties['level-type'] || 'minecraft:normal';
              const isKnown = GENERATOR_TYPES.some(g => g.id === activeType);

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                  <div>
                    <span className="prop-label" style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>World Generator Type (level-type)</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Select the generator style for this world. Data-driven to support future types.</span>
                  </div>

                  {/* Compact selector grid */}
                  <div className="generator-selector-grid">
                    {GENERATOR_TYPES.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        className={`generator-type-btn ${activeType === g.id ? 'active' : ''}`}
                        onClick={() => handlePropChange('level-type', g.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handlePropChange('level-type', g.id);
                          }
                        }}
                      >
                        <span className="generator-type-label">{g.label}</span>
                        <span className="generator-type-desc">{g.desc}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`generator-type-btn ${!isKnown ? 'active' : ''}`}
                      onClick={() => {
                        if (isKnown) {
                          handlePropChange('level-type', 'custom');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (isKnown) {
                            handlePropChange('level-type', 'custom');
                          }
                        }
                      }}
                    >
                      <span className="generator-type-label">Custom</span>
                      <span className="generator-type-desc">Specify a custom or modded world type manually.</span>
                    </button>
                  </div>

                  {/* Conditional Text Input for Custom Generator Key */}
                  {(!isKnown || activeType === 'custom') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Custom Generator Key</span>
                      <input
                        type="text"
                        value={activeType === 'custom' ? '' : activeType}
                        onChange={(e) => handlePropChange('level-type', e.target.value)}
                        placeholder="e.g. minecraft:flat"
                        style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)' }}
                      />
                    </div>
                  )}

                  {/* Conditional UI: generator-settings */}
                  {(activeType === 'minecraft:flat' || !isKnown) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', padding: '12px', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Flat Generator Layer Configurations (generator-settings)</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Configure flat layers or structures (e.g. layers of dirt, stone, bedrock).</span>
                      <input
                        type="text"
                        value={properties['generator-settings'] || ''}
                        onChange={(e) => handlePropChange('generator-settings', e.target.value)}
                        placeholder="e.g. 3;minecraft:bedrock,2*minecraft:dirt,minecraft:grass_block;1;village"
                        style={{ width: '100%', padding: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  )}

                  {/* World Seed */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <span className="prop-label" style={{ fontWeight: 600 }}>World Seed (level-seed)</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>A seed for reproducible world generation. Leave blank for random.</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={properties['level-seed'] || ''}
                        onChange={(e) => handlePropChange('level-seed', e.target.value)}
                        style={{ flex: 1, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
                        placeholder="Random seed"
                      />
                      <button
                        type="button"
                        className="btn outline"
                        onClick={() => {
                          const randomSeed = Math.floor(Math.random() * 20000000000000) - 10000000000000;
                          handlePropChange('level-seed', String(randomSeed));
                          toast('Seed rolled: ' + randomSeed, 'info');
                        }}
                      >
                        Roll Seed
                      </button>
                    </div>
                  </div>

                  {/* Generate Structures */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <div>
                      <span className="prop-label" style={{ fontWeight: 600, display: 'block' }}>Generate Structures</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Generate villages, dungeons, and mineshafts.</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={properties['generate-structures'] === 'true'}
                        onChange={(e) => handlePropChange('generate-structures', e.checked ? 'true' : 'false')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                </div>
              );
            })()}

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
      {/* Color Well Modal */}
      {showColorWell && (
        <ColorWell
          onClose={() => setShowColorWell(false)}
          onApply={(hex) => {
            setPickedCustomColor(hex);
            insertTextAtCursor(`&#${hex.replace('#', '')}`);
            setShowColorWell(false);
            toast(`Custom color: ${hex}`, 'success');
          }}
        />
      )}

    </div>
  );
}
