import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.ts';
import { toast } from '../../components/Toast.tsx';
import Select from '../../components/Select.tsx';
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Tooltip, Filler
} from 'chart.js';
import '../../styles/pages/server/Overview.css';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler);

// ── Time range options (must match the backend RANGE_CONFIG in statsRoutes) ──
const RANGES = [
  ['5m',  'Last 5 Minutes'],
  ['15m', 'Last 15 Minutes'],
  ['30m', 'Last 30 Minutes'],
  ['1h',  'Last 1 Hour'],
  ['6h',  'Last 6 Hours'],
  ['12h', 'Last 12 Hours'],
  ['24h', 'Last 24 Hours'],
  ['7d',  'Last 7 Days'],
];
const RANGE_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
// Ranges where 500ms live WS points are meaningful (keep the array small).
const LIVE_APPEND_RANGES = new Set(['5m', '15m', '30m', '1h']);

const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const fmtUptime = (s) => {
  if (s == null) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
};

const fmtDateTime = (t) => {
  if (!t) return '—';
  return new Date(t).toLocaleString([], {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const fmtAxisTime = (v, range) => {
  const d = new Date(v);
  if (RANGE_MS[range] > 3 * 24 * 3600 * 1000) {
    return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function ServerOverview() {
  const { serverId, status, metrics, hasPerm } = useOutletContext();

  const [backups, setBackups] = useState([]);

  // Chart state
  const [range, setRange] = useState('1h');
  const [points, setPoints] = useState([]); // { t, cpu, ramPct, ramMb, tps, players }
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState({ cpu: true, ram: true, tps: true, players: true });
  const [timezone, setTimezone] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  // System-wide host CPU % — same source as the sidebar (/api/system/metrics).
  const [systemCpu, setSystemCpu] = useState(null);

  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const lastLiveRef = useRef(0);
  const lastRangeRef = useRef(range);
  const sessionStartRef = useRef(0);
  const prevStatusRef = useRef(status);

  const maxRamMb = metrics.maxRam || 2048;
  // Stable boolean (hasPerm is recreated every render in ServerLayout) —
  // must NOT be part of loadStats deps or the chart would refetch every 500ms.
  const canReadStats = hasPerm('server.stats.read');

  const loadBackups = async () => {
    try {
      const data = await api(`/api/servers/${serverId}/backups`);
      setBackups(data.slice(0, 5) || []);
    } catch (e) {}
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
  }, [serverId]);

  // System-wide CPU — reuse the exact same endpoint the sidebar reads so the
  // CPU Usage card always matches it (no new sampler or calculation).
  const loadSystemCpu = useCallback(async () => {
    try {
      const data = await api('/api/system/metrics');
      if (data?.cpu?.usage != null) setSystemCpu(Math.round(data.cpu.usage));
    } catch (_) { /* keep last value */ }
  }, []);

  useEffect(() => {
    loadSystemCpu();
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadSystemCpu();
    }, 5000);
    return () => clearInterval(iv);
  }, [loadSystemCpu]);

  // Uptime ticker (1s, purely client-side — zero extra traffic)
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Load historical data ──────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!canReadStats) { setLoading(false); return; }
    // While the server is offline/stopping/restarting the chart must stay
    // empty — no stale history. It repopulates as soon as the server is
    // back online.
    if (status !== 'online') {
      setPoints([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api(`/api/servers/${serverId}/stats?range=${range}`);
      if (res.timezone) setTimezone(res.timezone);
      // Guard: if the server left its online session while the fetch was in
      // flight (e.g. a 60s refresh when it stopped), the ref is reset to 0 —
      // discard the result instead of repopulating a stale/old-session graph.
      const sessionStart = sessionStartRef.current;
      if (!sessionStart) { setPoints([]); return; }
      // Only show samples from the CURRENT server session — history belonging
      // to previous starts must never be reconnected to a fresh graph.
      const pts = (res.data || [])
        .filter(d => d.t >= sessionStart)
        .map(d => ({
          t: d.t,
          cpu: d.cpu_percent,
          ramPct: Math.min(100, (d.ram_bytes / 1024 / 1024 / maxRamMb) * 100),
          ramMb: Math.round(d.ram_bytes / 1024 / 1024),
          tps: d.tps,
          players: d.players
        }));
      // Oldest → newest so the chart always renders left-to-right.
      pts.sort((a, b) => a.t - b.t);
      setPoints(pts);
    } catch (e) {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, range, canReadStats, maxRamMb, status]);

  useEffect(() => {
    lastLiveRef.current = 0;
    loadStats();
  }, [loadStats]);

  // ── Session boundary: clear on stop, brand-new graph per start ────────────
  // useLayoutEffect so the clear happens before paint — the old graph never
  // flashes on screen when the server stops or starts.
  useLayoutEffect(() => {
    const becameOnline = status === 'online' && prevStatusRef.current !== 'online';
    if (becameOnline) {
      // A new session begins. Prefer the server's own start time when it is
      // plausibly the CURRENT session (fresh within 5 min); otherwise start
      // from now, so the first received sample becomes the graph's beginning
      // and old-session history can never leak back in.
      const freshStart = metrics.startedAt && (Date.now() - metrics.startedAt) < 5 * 60 * 1000
        ? metrics.startedAt
        : Date.now();
      sessionStartRef.current = freshStart;
      setPoints([]);
      lastLiveRef.current = 0;
    } else if (status !== 'online') {
      // Stopped / stopping / restarting — the chart stays empty.
      sessionStartRef.current = 0;
      setPoints([]);
    }
    prevStatusRef.current = status;
  }, [status, metrics.startedAt]);

  // Periodic refresh for long ranges (live appends are disabled there).
  useEffect(() => {
    if (LIVE_APPEND_RANGES.has(range)) return;
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadStats();
    }, 60000);
    return () => clearInterval(iv);
  }, [range, loadStats]);

  // ── Live appends from WS metrics (500ms cadence, smooth sliding window) ────
  useEffect(() => {
    if (status !== 'online' || !LIVE_APPEND_RANGES.has(range)) return;
    const now = Date.now();
    if (now - lastLiveRef.current < 500) return;
    lastLiveRef.current = now;
    // Never draw a sample that predates the current session.
    if (now < (sessionStartRef.current || 0)) return;

    const pt = {
      t: now,
      cpu: metrics.cpu,
      ramPct: Math.min(100, (metrics.ram / maxRamMb) * 100),
      ramMb: metrics.ram,
      tps: metrics.tps,
      players: metrics.players
    };
    setPoints(prev => {
      const cutoff = now - RANGE_MS[range];
      const next = prev.filter(p => p.t >= cutoff);
      if (next.length && now - next[next.length - 1].t < 400) {
        next[next.length - 1] = pt;
      } else {
        next.push(pt);
      }
      // Keep strictly ascending so the live line always extends rightward.
      next.sort((a, b) => a.t - b.t);
      return next;
    });
  }, [metrics, status, range, maxRamMb]);

  // ── Chart lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const border = cssVar('--border', 'rgba(255,255,255,0.08)');
    const muted = cssVar('--text-muted', '#777');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)';

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          { label: 'CPU', data: [], yAxisID: 'y', borderColor: '', tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3.5, fill: false, spanGaps: true },
          { label: 'RAM', data: [], yAxisID: 'y', borderColor: '', tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3.5, fill: false, spanGaps: true },
          { label: 'TPS', data: [], yAxisID: 'y1', borderColor: '', tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3.5, fill: false, spanGaps: false },
          { label: 'Players', data: [], yAxisID: 'y2', borderColor: '', tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 3.5, fill: false, spanGaps: true }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 450, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(10, 12, 16, 0.95)',
            borderColor: border,
            borderWidth: 1,
            titleColor: cssVar('--text-primary', '#f2f2f2'),
            bodyColor: cssVar('--text-secondary', '#b0b0b0'),
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            titleFont: { family: "'Sora', sans-serif", size: 12, weight: 600 },
            bodyFont: { family: "'Fira Code', monospace", size: 11 },
            callbacks: {
              title: (items) => {
                const it = items[0];
                return it ? fmtDateTime(it.parsed.x) : '';
              },
              label: (ctx) => {
                const p = ctx.raw;
                if (!p) return '';
                if (ctx.datasetIndex === 0) return `CPU: ${(p.y ?? 0).toFixed(1)}%`;
                if (ctx.datasetIndex === 1) return `RAM: ${(p.y ?? 0).toFixed(1)}%  (${p.mb} MB)`;
                if (ctx.datasetIndex === 2) return `TPS: ${p.y != null ? p.y.toFixed(1) : '—'}`;
                return `Players: ${p.y ?? 0}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            reverse: false,
            grid: { color: gridColor },
            ticks: { color: muted, maxTicksLimit: 8, maxRotation: 0, callback: (v) => fmtAxisTime(v, range) },
            min: Date.now() - RANGE_MS[range],
            max: Date.now()
          },
          y: {
            position: 'left',
            min: 0,
            max: 100,
            grid: { color: gridColor },
            ticks: { color: muted, callback: (v) => `${v}%` },
            title: { display: true, text: 'Usage %', color: muted, font: { size: 10 } }
          },
          y1: {
            position: 'right',
            min: 0,
            max: 20,
            grid: { drawOnChartArea: false },
            ticks: { color: muted, precision: 1 },
            title: { display: true, text: 'TPS', color: muted, font: { size: 10 } }
          },
          y2: {
            position: 'right',
            offset: true,
            beginAtZero: true,
            suggestedMax: Math.max(5, metrics.maxPlayers || 20),
            grid: { drawOnChartArea: false },
            ticks: { color: muted, precision: 0 },
            title: { display: true, text: 'Players', color: muted, font: { size: 10 } }
          }
        }
      }
    });

    chartRef.current = chart;
    return () => { chart.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Push data into the chart whenever points / toggles / range change ─────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const accent = cssVar('--accent', '#00f076');
    const cpuColor = accent;
    const ramColor = '#5b8def';
    const tpsColor = '#f59e0b';
    const playersColor = '#a78bfa';

    const cpuData = points.map(p => ({ x: p.t, y: p.cpu }));
    const ramData = points.map(p => ({ x: p.t, y: p.ramPct, mb: p.ramMb }));
    const tpsData = points.map(p => ({ x: p.t, y: p.tps }));
    const playersData = points.map(p => ({ x: p.t, y: p.players }));

    chart.data.datasets[0].data = cpuData;
    chart.data.datasets[1].data = ramData;
    chart.data.datasets[2].data = tpsData;
    chart.data.datasets[3].data = playersData;

    chart.data.datasets[0].borderColor = cpuColor;
    chart.data.datasets[1].borderColor = ramColor;
    chart.data.datasets[2].borderColor = tpsColor;
    chart.data.datasets[3].borderColor = playersColor;

    chart.data.datasets[0].hidden = !enabled.cpu;
    chart.data.datasets[1].hidden = !enabled.ram;
    chart.data.datasets[2].hidden = !enabled.tps;
    chart.data.datasets[3].hidden = !enabled.players;

    // Keep the axis tick formatter in sync with the selected range (the chart
    // itself is created once, so this callback would otherwise stay stale).
    chart.options.scales.x.ticks.callback = (v) => fmtAxisTime(v, range);

    // Anchor the x-window:
    // - the max bound is ALWAYS locked to the current time (Date.now()) — the
    //   axis must never extend into the future (no empty future time space);
    // - sparse data (server recently started / short history): auto-scale to
    //   [first sample, now], pinning the oldest point to the left edge and
    //   letting the line grow rightward as live data streams in;
    // - data spanning the full range: now-anchored sliding window.
    const now = Date.now();
    const rangeMs = RANGE_MS[range];
    const firstT = points.length ? points[0].t : now;
    const lastT = points.length ? points[points.length - 1].t : now;
    const end = now; // never in the future
    let start;
    if (!points.length) {
      start = now - rangeMs;
    } else if (lastT - firstT >= rangeMs) {
      start = now - rangeMs;
    } else {
      // Auto-scale sparse data between the oldest sample and now (clamped so
      // start <= end even with clock skew between client and server). Keep at
      // least a 1s window so a single point at `now` doesn't collapse the
      // axis to zero-width (every range is >= 5m, so 1000ms is always tiny).
      start = Math.max(0, Math.min(firstT, end - 1000));
    }
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.options.scales.y2.suggestedMax = Math.max(5, metrics.maxPlayers || 20);

    // Animate only when the range changes (full reload); live appends, the 1s
    // now tick and legend toggles update without animation to keep the 500ms
    // stream cheap.
    const animate = lastRangeRef.current !== range;
    lastRangeRef.current = range;
    chart.update(animate ? undefined : 'none');
  }, [points, enabled, range, metrics.maxPlayers, nowTick]);

  // ── Derived live values for cards & legend ────────────────────────────────
  const uptimeSec = metrics.startedAt
    ? Math.max(0, Math.floor((nowTick - metrics.startedAt) / 1000))
    : null;
  const tps = metrics.tps;
  // Prefer the sidebar-identical system CPU; fall back to the WS metric while
  // the first /api/system/metrics response is still loading.
  const cpuDisplay = systemCpu != null ? systemCpu : Math.round(metrics.cpu);

  const toggleMetric = (key) => {
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const legendItems = [
    { key: 'cpu', label: 'CPU', color: () => cssVar('--accent', '#00f076'), value: `${cpuDisplay}%` },
    { key: 'ram', label: 'RAM', color: () => '#5b8def', value: `${metrics.ram} / ${metrics.maxRam} MB` },
    { key: 'tps', label: 'TPS', color: () => '#f59e0b', value: tps != null ? tps.toFixed(1) : '—' },
    { key: 'players', label: 'Players', color: () => '#a78bfa', value: `${metrics.players} / ${metrics.maxPlayers}` }
  ];

  const statCards = [
    {
      label: 'CPU USAGE', value: `${cpuDisplay}%`, cls: 'ov-stat-cpu',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
    },
    {
      label: 'MEMORY', value: `${metrics.ram} / ${metrics.maxRam} MB`, cls: 'ov-stat-ram',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg>
    },
    {
      label: 'PLAYERS', value: `${metrics.players} / ${metrics.maxPlayers}`, cls: 'ov-stat-players',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    },
    {
      label: 'CPU TEMP', value: metrics.temp, cls: 'ov-stat-temp',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
    },
    {
      label: 'TPS', value: tps != null ? tps.toFixed(1) : '—', cls: 'ov-stat-tps',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h3l2-5 4 10 2-7h3l2 2"/><path d="M3 3v18"/></svg>
    },
    {
      label: 'UPTIME', value: fmtUptime(uptimeSec), cls: 'ov-stat-uptime',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
    },
    {
      label: 'TIMEZONE', value: timezone || metrics.timezone || '—', cls: 'ov-stat-tz',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
    },
    {
      label: 'STARTED AT', value: fmtDateTime(metrics.startedAt), cls: 'ov-stat-started',
      icon: <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    }
  ];

  const hasAnyStats = points.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Server Status — stat cards + performance chart ── */}
      <div className="card" style={{ width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Server Status</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            live
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: status === 'online' ? '#22c55e' : 'var(--text-muted)', marginLeft: 6, verticalAlign: 'middle', boxShadow: status === 'online' ? '0 0 6px rgba(34,197,94,0.7)' : 'none' }} />
          </span>
        </div>

        {/* 8 stat cards, responsive grid (4 → 2 → 1 columns) */}
        <div className="ov-stats-row" style={{ marginBottom: '1.25rem' }}>
          {statCards.map(({ label, value, cls, icon }) => (
            <div key={label} className={`ov-stat-card ${cls}`}>
              <div className="ov-stat-icon" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                {icon}
              </div>
              <div className="ov-stat-info">
                <div className="ov-stat-label">{label}</div>
                <div className="ov-stat-val" title={value}>{value}</div>
              </div>
              {(label === 'MEMORY' || label === 'CPU USAGE') && (
                <div className="ov-stat-bar-wrap">
                  <div className={`ov-stat-bar ${cls.includes('temp') ? 'ov-bar-temp' : ''}`} style={{ width: label === 'MEMORY' ? `${Math.min(100, (metrics.ram / maxRamMb) * 100)}%` : `${Math.min(100, cpuDisplay)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Performance chart ── */}
        <div className="ov-chart-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span className="ov-chart-title">CPU · RAM · TPS · Players</span>
            <span className="ov-chart-sub">
              {status === 'online' ? 'live · updated every 500ms' : 'offline · chart hidden until server starts'}
            </span>
          </div>
          <div className="ov-range-select">
            <Select value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </Select>
          </div>
        </div>

        <div className="ov-chart-wrap">
          {loading && (
            <div className="ov-chart-overlay">
              <div className="ov-spinner" />
              <span>Loading statistics…</span>
            </div>
          )}
          {!loading && !hasAnyStats && (
            <div className="ov-chart-overlay">
              <span>
                {status === 'online'
                  ? 'No statistics yet — data is collected every 30 seconds while the server is online.'
                  : 'Server is offline — the chart will appear when it is started.'}
              </span>
            </div>
          )}
          <canvas ref={canvasRef} className="ov-chart-canvas" />
        </div>

        {/* Toggleable legend */}
        <div className="ov-chart-legend">
          {legendItems.map(({ key, label, color, value }) => (
            <button
              key={key}
              className={`ov-legend-btn ${enabled[key] ? '' : 'off'}`}
              onClick={() => toggleMetric(key)}
              title={enabled[key] ? `Hide ${label}` : `Show ${label}`}
            >
              <span className="ov-legend-dot" style={{ background: color() }} />
              <span className="ov-legend-label">{label}</span>
              <span className="ov-legend-val">{value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
