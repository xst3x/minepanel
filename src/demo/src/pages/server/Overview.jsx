import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast } from '../../components/Toast.jsx';
import '../../styles/pages/server/Overview.css';

export default function ServerOverview() {
  const { serverId, status, metrics, hasPerm } = useOutletContext();
  const navigate = useNavigate();

  const [backups, setBackups] = useState([]);
  const [ftpInfo, setFtpInfo] = useState(null);

  const canvasRef = useRef(null);
  const cpuHistoryRef = useRef([]);
  const ramHistoryRef = useRef([]);

  const loadBackups = async () => {
    try {
      const data = await api(`/api/servers/${serverId}/backups`);
      setBackups(data.slice(0, 5) || []);
    } catch (e) {}
  };

  const loadFtp = async () => {
    try {
      const data = await api(`/api/servers/${serverId}/ftp`);
      setFtpInfo(data);
    } catch (e) { setFtpInfo(null); }
  };

  const handleCreateBackup = async () => {
    try {
      await api(`/api/servers/${serverId}/backups/create`, { method: 'POST', body: { includes: 'all' } });
      toast('Backup created!', 'success');
      loadBackups();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  useEffect(() => {
    loadBackups();
    loadFtp();
  }, [serverId]);



  // Chart
  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00f076';

    const drawLine = (data, strokeAlpha, fillAlpha) => {
      if (data.length < 2) return;
      const pts = data.map((v, i) => ({ x: (i / 29) * w, y: h - (v / 100) * h * 0.88 - h * 0.06 }));
      const buildCurve = (c) => {
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const cx = (pts[i].x + pts[i+1].x) / 2;
          const cy = (pts[i].y + pts[i+1].y) / 2;
          c.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
        }
        c.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
      };
      ctx.save();
      ctx.beginPath(); buildCurve(ctx);
      ctx.lineTo(pts[pts.length-1].x, h); ctx.lineTo(pts[0].x, h); ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, accent); grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.globalAlpha = fillAlpha; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); buildCurve(ctx);
      ctx.globalAlpha = strokeAlpha; ctx.strokeStyle = accent;
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    };

    drawLine(ramHistoryRef.current, 0.35, 0.08);
    drawLine(cpuHistoryRef.current, 1, 0.18);

    const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#777';
    ctx.fillStyle = mutedColor; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    [['100%', 0.06], ['50%', 0.5], ['0%', 0.94]].forEach(([label, frac]) => {
      ctx.fillText(label, w - 2, frac * h + 4);
    });
  };

  useEffect(() => {
    if (metrics) {
      const ramPct = Math.min(100, (metrics.ram / metrics.maxRam) * 100);
      cpuHistoryRef.current.push(metrics.cpu);
      ramHistoryRef.current.push(ramPct);
      if (cpuHistoryRef.current.length > 30) { cpuHistoryRef.current.shift(); ramHistoryRef.current.shift(); }
      drawChart();
    }
  }, [metrics]);

  const currentHost = window.location.hostname;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Server Status — full width, 4 stats in a row ── */}
      <div className="card" style={{ width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Server Status</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            live
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: status === 'online' ? '#22c55e' : 'var(--text-muted)', marginLeft: 6, verticalAlign: 'middle', boxShadow: status === 'online' ? '0 0 6px rgba(34,197,94,0.7)' : 'none' }} />
          </span>
        </div>

        {/* 4 stat cards full width */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}
          className="ov-stats-row">
          {[
            { label: 'CPU USAGE', value: `${metrics.cpu.toFixed(1)}%`, icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg> },
            { label: 'MEMORY', value: `${metrics.ram} / ${metrics.maxRam} MB`, icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg> },
            { label: 'PLAYERS', value: `${metrics.players} / ${metrics.maxPlayers}`, icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
            { label: 'CPU TEMP', value: metrics.temp, icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg> },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)' }}>
                {icon}
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPU & RAM (last 30s)</span>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginRight: 4 }}/>CPU</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', opacity: 0.4, marginRight: 4 }}/>RAM</span>
            </div>
          </div>
          <canvas ref={canvasRef} height="80" style={{ width: '100%', display: 'block', borderRadius: 6 }} />
        </div>
      </div>

      {/* ── Bottom row: FTP ── */}
      {ftpInfo?.enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.25rem' }}>
          <div className="card">
            <h3 style={{ marginBottom: '0.85rem' }}>FTP Access</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              {[
                ['Host', currentHost === 'localhost' || currentHost === '127.0.0.1' ? '127.0.0.1' : currentHost],
                ['Port', ftpInfo.port || '2121'],
                ['Username', ftpInfo.username || 'admin'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>{v}</code>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Status</span>
                <span className="status-badge online" style={{ fontSize: '0.7rem' }}>ACTIVE</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
