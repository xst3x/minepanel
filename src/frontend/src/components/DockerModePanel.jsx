/**
 * DockerModePanel — Settings card for toggling Docker execution mode.
 * Shows:
 *   - Docker availability status
 *   - Toggle: "Run each server in separate Docker container"
 *   - Warning modal before migrating
 *   - Live migration progress per server
 */

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { toast } from './Toast.jsx';

// Status badge for individual server migration progress
function MigrationBadge({ status, error, message }) {
  const colors = {
    pending:  { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', label: 'Pending' },
    running:  { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa', label: 'Migrating…' },
    pulling:  { bg: 'rgba(168,85,247,0.15)',  color: '#c084fc', label: 'Pulling image…' },
    success:  { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', label: 'Done' },
    failed:   { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: 'Failed' },
  };
  const c = colors[status] || colors.pending;
  const spinning = status === 'running' || status === 'pulling';
  return (
    <span
      title={error || message || c.label}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        letterSpacing: '0.02em',
      }}
    >
      {spinning && (
        <span style={{ display: 'inline-block', marginRight: 4, animation: 'spin 1s linear infinite' }}>⏳</span>
      )}
      {message || c.label}
    </span>
  );
}

// Badge showing execution mode (Native / Docker)
export function ExecutionModeBadge({ mode }) {
  if (mode === 'docker') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
        background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
      }}>
         Docker
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
  const [dockerAvailable, setDockerAvailable] = useState(null); // null = checking
  const [dockerMode, setDockerMode] = useState(false);
  const [servers, setServers] = useState([]);
  const [migrating, setMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState({}); // { serverId: { status, error } }
  const [showWarning, setShowWarning] = useState(false);
  const [pendingEnable, setPendingEnable] = useState(null); // true/false
  const pollRef = useRef(null);

  // Load current state on mount
  useEffect(() => {
    checkDocker();
    loadServerModes();
  }, []);

  const checkDocker = async () => {
    try {
      const res = await api('/api/docker/check');
      setDockerAvailable(res.available);
    } catch {
      setDockerAvailable(false);
    }
  };

  const loadServerModes = async () => {
    try {
      const res = await api('/api/docker/server-modes');
      setDockerMode(res.dockerMode);
      setServers(res.servers || []);
    } catch (e) {
      console.error('Failed to load server modes:', e.message);
    }
  };

  // Poll migration status while migrating
  useEffect(() => {
    if (migrating) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await api('/api/docker/migration');
          setMigrationStatus(res.status || {});
          if (!res.migrating) {
            setMigrating(false);
            clearInterval(pollRef.current);
            // Reload server modes to reflect updated execution_mode
            await loadServerModes();
            const allFailed = Object.values(res.status || {}).some(s => s.status === 'failed');
            if (allFailed) {
              toast('Some servers failed to migrate. Check the details below.', 'error');
            } else {
              toast('Migration complete!', 'success');
            }
          }
        } catch (e) {
          console.error('Migration poll error:', e.message);
        }
      }, 1500);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [migrating]);

  const handleToggleRequest = (wantEnabled) => {
    if (migrating) return;
    if (wantEnabled && !dockerAvailable) {
      toast('Docker daemon is not available. Please ensure Docker is installed and running.', 'error');
      return;
    }
    setPendingEnable(wantEnabled);
    setShowWarning(true);
  };

  const handleConfirmMigration = async () => {
    setShowWarning(false);
    setMigrating(true);
    setMigrationStatus({});

    // Pre-populate with pending status for all servers
    const initial = {};
    servers.forEach(s => { initial[s.id] = { status: 'pending' }; });
    setMigrationStatus(initial);

    try {
      await api('/api/docker/migrate', {
        method: 'POST',
        body: { enable: pendingEnable },
      });
      // Migration runs in background; polling will update status
    } catch (e) {
      setMigrating(false);
      toast('Migration failed to start: ' + e.message, 'error');
    }
  };

  const allDone = !migrating && Object.values(migrationStatus).length > 0;
  const hasFailed = Object.values(migrationStatus).some(s => s.status === 'failed');

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Docker Execution Mode
        </h3>

        {/* Docker availability indicator */}
        <div style={{ marginTop: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
          {dockerAvailable === null && <span style={{ color: 'var(--text-muted)' }}>Checking Docker…</span>}
          {dockerAvailable === true && (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: '#4ade80' }}>Docker daemon is available</span>
            </>
          )}
          {dockerAvailable === false && (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: '#f87171' }}>Docker daemon not found — install Docker to enable this feature</span>
            </>
          )}
          <button
            onClick={checkDocker}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline', padding: 0 }}
          >
            Recheck
          </button>
        </div>

        {/* Toggle */}
        <div className="form-group">
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>Run each server in separate Docker container</span>
              <span style={{ display: 'block', fontSize: '0.79rem', color: 'var(--text-muted)', marginTop: 3 }}>
                When enabled, each Minecraft server runs in its own isolated container with CPU and RAM limits.
                Toggling this will migrate all existing servers.
              </span>
            </span>
            <label className="toggle-switch" style={{ marginLeft: '1rem', flexShrink: 0, marginTop: 2 }}>
              <input
                type="checkbox"
                checked={dockerMode}
                disabled={migrating || dockerAvailable === false}
                onChange={e => handleToggleRequest(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </label>
        </div>

        {/* Server mode list */}
        {servers.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Server execution modes:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {servers.map(s => {
                const mig = migrationStatus[s.id];
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.4rem 0.75rem', borderRadius: 'var(--radius)',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    fontSize: '0.83rem',
                  }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ExecutionModeBadge mode={s.mode} />
                      {mig && <MigrationBadge status={mig.status} error={mig.error} message={mig.message} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error summary */}
        {allDone && hasFailed && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.82rem', color: '#f87171' }}>
            Some servers failed to migrate. Failed servers have been reverted to their previous working state. No server files were modified.
            {Object.entries(migrationStatus).filter(([, v]) => v.status === 'failed').map(([id, v]) => {
              const srv = servers.find(s => String(s.id) === String(id));
              return (
                <div key={id} style={{ marginTop: '0.35rem', paddingLeft: '0.5rem', borderLeft: '2px solid #f87171' }}>
                  <strong>{srv?.name || `Server ${id}`}:</strong> {v.error || 'Unknown error'}
                </div>
              );
            })}
          </div>
        )}

        {migrating && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
            Migration in progress — do not close this page…
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showWarning && (
        <div className="modal-overlay active" onClick={() => setShowWarning(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Migration</h3>
              <button className="close-btn" onClick={() => setShowWarning(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                {pendingEnable
                  ? 'This will stop all running servers and migrate each one to run inside a Docker container.'
                  : 'This will stop all running containers and migrate each server back to native Java process mode.'}
              </p>
              <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem', lineHeight: 1.8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <li>All servers will be stopped before migration</li>
                <li>Server files are never deleted or moved</li>
                <li>Each server is migrated sequentially</li>
                <li>Failed servers are automatically reverted</li>
                {pendingEnable && <li>Docker must be installed and running</li>}
              </ul>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Servers: <strong>{servers.length}</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn outline" onClick={() => setShowWarning(false)}>Cancel</button>
              <button className="btn primary" onClick={handleConfirmMigration}>
                Migrate All Servers
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
