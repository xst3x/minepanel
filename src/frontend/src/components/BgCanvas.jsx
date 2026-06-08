import { useEffect, useRef } from 'react';

// Geometric floating shapes background — ported from legacy vanilla JS
// Triangles, hexagons and quads drift and rotate, connected by faint lines
export default function BgCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animId;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function getAccentHsl() {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent').trim();
      const m = raw.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
      if (m) return [+m[1], +m[2], +m[3]];
      // hex fallback
      const hexM = raw.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if (hexM) {
        let r = parseInt(hexM[1], 16) / 255;
        let g = parseInt(hexM[2], 16) / 255;
        let b = parseInt(hexM[3], 16) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const l = (mx + mn) / 2;
        if (mx === mn) return [0, 0, l * 100];
        const d = mx - mn;
        const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        let h;
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (mx === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
        return [h * 360, s * 100, l * 100];
      }
      return [149, 100, 47];
    }

    const shapes = [];

    function makeShapes() {
      shapes.length = 0;
      const [H, S, L] = getAccentHsl();
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const N = Math.floor((canvas.width * canvas.height) / 28000) + 8;
      for (let i = 0; i < N; i++) {
        shapes.push({
          type: ['tri', 'hex', 'quad'][Math.floor(Math.random() * 3)],
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: 25 + Math.random() * 85,
          h: H + (Math.random() - 0.5) * 55,
          s: Math.min(100, S + (Math.random() - 0.5) * 20),
          l: isLight
            ? Math.max(15, Math.min(55, L + (Math.random() - 0.5) * 30))  // mai întunecat în light
            : Math.max(15, Math.min(80, L + (Math.random() - 0.5) * 30)),
          a: isLight
            ? 0.18 + Math.random() * 0.14   // light mode: 0.18–0.32 (vizibile dar nu agresive)
            : 0.25 + Math.random() * 0.25,  // dark mode:  0.25–0.50
          rot: Math.random() * Math.PI * 2,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          vr: (Math.random() - 0.5) * 0.004,
        });
      }
    }

    function poly(x, y, r, sides, rot, h, s, l, a) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2;
        i === 0
          ? ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
          : ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fillStyle   = `hsla(${h},${s}%,${l}%,${a})`;
      ctx.strokeStyle = `hsla(${h},${s}%,${l + 18}%,${a * 1.5})`;
      ctx.lineWidth   = 1;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    makeShapes();

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const [H, S, L] = getAccentHsl();

      for (const s of shapes) {
        s.x += s.vx; s.y += s.vy; s.rot += s.vr;
        if (s.x < -120)                   s.x = canvas.width + 120;
        if (s.x > canvas.width + 120)     s.x = -120;
        if (s.y < -120)                   s.y = canvas.height + 120;
        if (s.y > canvas.height + 120)    s.y = -120;
        const sides = s.type === 'tri' ? 3 : s.type === 'hex' ? 6 : 4;
        poly(s.x, s.y, s.size, sides, s.rot, s.h, s.s, s.l, s.a);
      }

      // faint connecting lines between nearby shapes
      for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
          const a = shapes[i], b = shapes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 140) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `hsla(${H},${S}%,${L + 20}%,${(1 - d / 140) * 0.07})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    // Re-generate shapes when accent colour / theme changes
    const observer = new MutationObserver(makeShapes);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });
    document.addEventListener('accentChanged', makeShapes);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      observer.disconnect();
      document.removeEventListener('accentChanged', makeShapes);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="content-bg-canvas"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
