import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function ServerBackups() {
  const { serverId, hasPerm } = useOutletContext();
  const [backups, setBackups] = useState([]);
  const [config, setConfig] = useState({
    auto_backup: false,
    backup_interval: 24,
    backup_includes: 'all'
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [serverId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load config
      try {
        const cfg = await api(`/api/servers/${serverId}/backup-config`);
        setConfig({
          auto_backup: !!cfg.auto_backup,
          backup_interval: cfg.backup_interval || 24,
          backup_includes: cfg.backup_includes || 'all'
        });
      } catch (err) {
        console.error('Failed to load backup config:', err.message);
      }

      // Load backups list
      const list = await api(`/api/servers/${serverId}/backups`);
      setBackups(list || []);
    } catch (err) {
      alert('Failed to load backups: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setActionLoading(true);
    try {
      await api(`/api/servers/${serverId}/backup-config`, {
        method: 'POST',
        body: {
          enabled: config.auto_backup,
          interval: parseInt(config.backup_interval) || 24,
          includes: config.backup_includes || 'all'
        }
      });
      alert('Backup configuration saved successfully.');
    } catch (err) {
      alert('Failed to save configuration: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunBackup = async () => {
    setActionLoading(true);
    try {
      alert('Creating backup (this may take a moment)...');
      const res = await api(`/api/servers/${serverId}/backups/create`, {
        method: 'POST',
        body: { includes: config.backup_includes }
      });
      alert(res.message || 'Backup completed successfully.');
      loadData();
    } catch (err) {
      alert('Backup failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const token = localStorage.getItem('mp_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/servers/${serverId}/backups/${filename}/download`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  };

  const handleRestore = async (filename) => {
    if (!confirm(`Restore ${filename}? This will overwrite current files.`)) return;
    setActionLoading(true);
    try {
      alert('Restoring backup... Please wait.');
      const res = await api(`/api/servers/${serverId}/backups/${filename}/restore`, { method: 'POST' });
      alert(res.message || 'Backup restored successfully.');
    } catch (err) {
      alert('Failed to restore backup: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await api(`/api/servers/${serverId}/backups/${filename}/delete`, { method: 'POST' });
      alert('Backup deleted.');
      loadData();
    } catch (err) {
      alert('Failed to delete backup: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatBytes = (b) => {
    if (!+b) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Configuration Card */}
      {hasPerm('server.backups.write') && (
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text)' }}>Backup Configuration</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Auto-Backup Interval (Hours)</label>
              <input
                type="number"
                value={config.backup_interval}
                onChange={(e) => setConfig(prev => ({ ...prev, backup_interval: e.target.value }))}
                placeholder="24"
                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', color: 'var(--text)' }}
              />
            </div>
            <div className="form-group">
              <label>Included Directories (comma separated, or 'all')</label>
              <input
                type="text"
                value={config.backup_includes}
                onChange={(e) => setConfig(prev => ({ ...prev, backup_includes: e.target.value }))}
                placeholder="world, plugins, logs"
                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', color: 'var(--text)' }}
              />
            </div>
          </div>
          
          <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <button className="btn success" onClick={handleRunBackup} disabled={actionLoading}>
                {actionLoading ? 'Working...' : 'Run Backup Now'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enable Auto-Backups</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={config.auto_backup}
                    onChange={(e) => setConfig(prev => ({ ...prev, auto_backup: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </label>
              <button className="btn primary" onClick={handleSaveConfig} disabled={actionLoading}>
                Save Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backups List Card */}
      <div className="card" style={{ padding: 0 }}>
        <div className="list-header" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-secondary)' }}>
          <div>Filename</div>
          <div>Size</div>
          <div>Date</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        <div className="list-body">
          {loading ? (
            <p className="text-muted" style={{ padding: '1rem' }}>Loading backups...</p>
          ) : backups.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No backups created yet.
            </div>
          ) : (
            backups.map(b => (
              <div
                key={b.name}
                className="list-item"
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text)' }}>{b.name}</div>
                <div>{formatBytes(b.size)}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {new Date(b.date).toLocaleString()}
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                  <button className="btn outline small" onClick={() => handleDownload(b.name)}>Download</button>
                  {hasPerm('server.backups.write') && (
                    <>
                      <button className="btn outline small" onClick={() => handleRestore(b.name)} disabled={actionLoading}>Restore</button>
                      <button className="btn danger small" onClick={() => handleDelete(b.name)} disabled={actionLoading}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
