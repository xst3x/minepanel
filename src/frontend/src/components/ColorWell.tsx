import { useState, useEffect, useRef, useCallback } from 'react';

// Shared Color Well (custom color picker modal)
// Used by both Panel Settings (accent color) and Server Properties (MOTD custom color)
// onApply is called with (hex, hslValue, label) so callers can use whichever form they need.
export default function ColorWell({ onClose, onApply }) {
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
          <h3>Choose a color</h3>
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
            <input type="text" placeholder="Name this color" maxLength={24}
              value={colorName} onChange={e => setColorName(e.target.value)}
              style={{ flex: 1 }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn outline" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onApply(hex, hslValue, colorName.trim() || 'Custom')}>Apply</button>
        </div>
      </div>
    </div>
  );
}
