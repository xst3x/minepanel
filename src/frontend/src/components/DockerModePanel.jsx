/**
 * DockerModePanel — per-server Docker settings card.
 * Shows in server Settings tab.
 * Features:
 *  - Toggle native / docker mode (no migration, just sets the flag)
 *  - Extra port mappings (add/remove host:container/protocol)
 *  - Start / Stop container directly from here
 */

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api.js';
import { toast } from './Toast.jsx';

export function ExecutionModeBadge({ mode }) {
  if (mode === 'docker') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
        background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
      }}>
        🐳 Docker
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
      background: 'rgba(100,116,139,0.12)', color: '#94a3b8',
    }}>
      Native
    </span>
  );
}

export default function DockerModePanel() {
  const ctx = useOutletContext?.() || {};
  const serverId = ctx?.server?.id;

  const [dockerAvailable, setDockerAvailable] = useState(null);
  const [mode, setMode]         = useState('native');
  const [status, setStatus]     = useState('unknown'); // running / stopped / unknown
  const [ports, setPorts]       = useState([]);
  const [newPort, setNewPort]   = useState({ host: '', container: '', protocol: 'tcp' });
  const [saving, setSaving]     = useState(false);
  const [acting, setActing]     = useState(false);

  useEffect(() => {
    if (!serverId) return;
    checkDocker();
    loadData();
  }, [serverId]);

  const checkDocker = async () => {
    try {
      const r = await api('/api/docker/check');
      setDockerAvailable(r.available);
    } catch { setDockerAvailable(false); }
  };

  const loadData = async () => {
    try {
      const r = await api('/api/docker/server-modes');
      const srv = (r.servers || []).find(s => String(s.id) === String(serverId));
      if (srv) {
        setMode(srv.mode || 'native');
        setPorts(srv.extra_ports || []);
      }
    } catch (e) { console.error(e); }
    // Also get container status if docker
    try {
      const s = await api(`/api/servers/${serverId}`);
      setStatus(s.status || 'offline');
    } catch {}
  };

  const handleModeToggle = async (wantDocker) => {
    if (wantDocker && !dockerAvailable) {
      toast('Docker daemon not available.', 'error');
      return;
    }
    const newMode = wantDocker ? 'docker' : 'native';
    try {
      await api(`/api/docker/server/${serverId}/mode`, { method: 'POST', body: { mode: newMode } });
      setMode(newMode);
      toast(`Switched to ${newMode} mode.`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const savePorts = async () => {
    setSaving(true);
    try {
      await api(`/api/docker/server/${serverId}/ports`, { method: 'POST', body: { ports } });
      toast('Ports saved.', 'success');
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };

  const addPort = () => {
    const h = parseInt(newPort.host);
    const c = parseInt(newPort.container);
    if (!h || !c || h < 1 || c < 1 || h > 65535 || c > 65535) {
      toast('Invalid port numbers.', 'error'); return;
    }
    setPorts(prev => [...prev, { host: h, container: c, protocol: newPort.protocol }]);
    setNewPort({ host: '', container: '', protocol: 'tcp' });
  };

  const removePort = (i) => setPorts(prev => prev.filter((_, idx) => idx !== i));

  const handleStart = async () => {
    setActing(true);
    try {
      await api(`/api/docker/server/${serverId}/start`, { method: 'POST' });
      toast('Container started.', 'success');
      setTimeout(loadData, 1500);
    } catch (e) { toast(e.message, 'error'); }
    setActing(false);
  };

  const handleStop = async () => {
    setActing(true);
    try {
      await api(`/api/docker/server/${serverId}/stop`, { method: 'POST' });
      toast('Stop command sent.', 'success');
      setTimeout(loadData, 1500);
    } catch (e) { toast(e.message, 'error'); }
    setActing(false);
  };

  const isRunning = status === 'online';

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        Docker
        <ExecutionModeBadge mode={mode} />
      </h3>

      {/* Docker availability */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: dockerAvailable === true ? '#4ade80' : dockerAvailable === false ? '#f87171' : '#94a3b8'
        }} />
        <span style={{ color: dockerAvailable === true ? '#4ade80' : dockerAvailable === false ? '#f87171' : 'var(--text-muted)' }}>
          {dockerAvailable === null ? 'Checking Docker…' : dockerAvailable ? 'Docker available' : 'Docker not available'}
        </span>
        <button onClick={checkDocker} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline', padding: 0 }}>
          Recheck
        </button>
      </div>

      {/* Mode toggle */}
      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span>
            <span style={{ display: 'block', fontWeight: 600 }}>Run in Docker container</span>
            <span style={{ display: 'block', fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: 3 }}>
              Isolates this server in its own container with CPU and RAM limits.
            </span>
          </span>
          <label className="toggle-switch" style={{ marginLeft: '1rem', flexShrink: 0, marginTop: 2 }}>
            <input
              type="checkbox"
              checked={mode === 'docker'}
              disabled={dockerAvailable === false}
              onChange={e => handleModeToggle(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </label>
      </div>

      {/* Container controls — only shown in docker mode */}
      {mode === 'docker' && (
        <>
          {/* Start / Stop */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Container</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: isRunning ? '#4ade80' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isRunning ? '#4ade80' : '#94a3b8', display: 'inline-block' }} />
                {isRunning ? 'Running' : 'Stopped'}
              </span>
              <button
                className="btn primary small"
                disabled={acting || isRunning}
                onClick={handleStart}
                style={{ marginLeft: 'auto' }}
              >
                Start
              </button>
              <button
                className="btn danger small"
                disabled={acting || !isRunning}
                onClick={handleStop}
              >
                Stop
              </button>
            </div>
          </div>

          {/* Extra port mappings */}
          <div>
            <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Extra Port Mappings
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              The main server port is mapped automatically. Add extra ports here (e.g. RCON, map viewer, voice chat).
            </div>

            {/* Existing ports */}
            {ports.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {ports.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.6rem', borderRadius: 'var(--radius)',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    fontSize: '0.83rem',
                  }}>
                    <code style={{ color: 'var(--accent)' }}>{p.host}</code>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <code style={{ color: 'var(--text-primary)' }}>{p.container}</code>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{p.protocol}</span>
                    <button onClick={() => removePort(i)} style={{
                      marginLeft: 'auto', background: 'none', border: 'none',
                      color: '#f87171', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px'
                    }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new port row */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                placeholder="Host port"
                value={newPort.host}
                onChange={e => setNewPort(p => ({ ...p, host: e.target.value }))}
                style={{ width: 110 }}
                className="input"
                min={1} max={65535}
              />
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <input
                type="number"
                placeholder="Container port"
                value={newPort.container}
                onChange={e => setNewPort(p => ({ ...p, container: e.target.value }))}
                style={{ width: 130 }}
                className="input"
                min={1} max={65535}
              />
              <select
                value={newPort.protocol}
                onChange={e => setNewPort(p => ({ ...p, protocol: e.target.value }))}
                className="input"
                style={{ width: 80 }}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
              <button className="btn outline small" onClick={addPort}>Add</button>
            </div>

            {/* Save ports */}
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary small" disabled={saving} onClick={savePorts}>
                {saving ? 'Saving…' : 'Save Ports'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
