import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm, showPrompt } from '../../components/Toast.jsx';

export default function ServerSettings() {
  const { serverId, serverInfo, status, hasPerm, reloadServerInfo } = useOutletContext();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [ram, setRam] = useState(2048);
  const [port, setPort] = useState(25565);
  const [javaPath, setJavaPath] = useState('java');
  const [logRetention, setLogRetention] = useState(7);
  const [backupRetention, setBackupRetention] = useState(30);
  const [autostart, setAutostart] = useState(false);
  const [autostartCrash, setAutostartCrash] = useState(false);

  const [versions, setVersions] = useState(null);
  const [newSoftware, setNewSoftware] = useState('vanilla');
  const [newVersion, setNewVersion] = useState('');
  const [switchWarnings, setSwitchWarnings] = useState([]);
  const [showSwitchModal, setShowSwitchModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadVersions();
  }, [serverId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}`);
      if (data) {
        setName(data.name || '');
        setRam(data.ram_mb || 2048);
        setPort(data.port || 25565);
        setJavaPath(data.java_path || 'java');
        setLogRetention(data.log_retention_days ?? 7);
        setBackupRetention(data.backup_retention_days ?? 30);
        setAutostart(!!data.autostart);
        setAutostartCrash(!!data.autostart_on_crash);
        setNewSoftware(data.software?.toLowerCase() || 'vanilla');
      }
    } catch (err) {
      toast('Failed to load server settings: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    try {
      const data = await api('/api/system/versions');
      setVersions(data);
    } catch (err) {
      console.error('Failed to load versions list:', err.message);
    }
  };

  const handleRefreshVersions = async () => {
    try {
      toast('Syncing latest Minecraft versions from APIs', 'info');
      const data = await api('/api/system/versions?refresh=true');
      setVersions(data);
      toast('Versions synced successfully!', 'success');
    } catch (err) {
      toast('Failed to sync versions: ' + err.message, 'error');
    }
  };

  const handleSaveSettings = async () => {
    if (!name) return toast('Server name is required', 'error');
    if (ram < 512 || ram > 16384) return toast('RAM must be between 512 and 16384 MB', 'error');
    if (port < 1024 || port > 65535) return toast('Port must be between 1024 and 65535', 'error');
    if (!javaPath) return toast('Java path is required', 'error');

    const isOnline = status === 'online';
    const isRamChanged = Number(serverInfo?.ram_mb) !== Number(ram);
    const isPortChanged = Number(serverInfo?.port) !== Number(port);
    const isJavaChanged = serverInfo?.java_path !== javaPath;

    if (isOnline && (isRamChanged || isPortChanged || isJavaChanged)) {
      toast('The server must be offline to change RAM, Port, or Java Path.', 'error');
      return;
    }

    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/settings`, {
        method: 'POST',
        body: {
          name,
          port: Number(port),
          ram_mb: Number(ram),
          java_path: javaPath,
          log_retention_days: Number(logRetention),
          backup_retention_days: Number(backupRetention),
          autostart,
          autostart_on_crash: autostartCrash
        }
      });
      toast('Settings saved successfully.', 'success');
      reloadServerInfo();
    } catch (err) {
      toast('Failed to save settings: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchSoftware = async () => {
    if (!newSoftware || !newVersion) {
      toast('Engine software and version are both required.', 'error');
      return;
    }
    if (status !== 'offline') {
      toast('The server must be offline to transition engine/version.', 'error');
      return;
    }

    try {
      const check = await api(`/api/servers/${serverId}/switch-software`, {
        method: 'POST',
        body: { software: newSoftware, version: newVersion, confirm: false }
      });

      if (check.warnings && check.warnings.length > 0) {
        setSwitchWarnings(check.warnings);
        setShowSwitchModal(true);
      } else {
        const ok = await showConfirm(`Switch to ${newSoftware.toUpperCase()} ${newVersion}?`, 'Confirm Switch');
        if (!ok) return;
        executeSwitchSoftware();
      }
    } catch (err) {
      toast('Transition check failed: ' + err.message, 'error');
    }
  };

  const executeSwitchSoftware = async () => {
    setShowSwitchModal(false);
    try {
      toast('Initiating transition', 'info');
      const res = await api(`/api/servers/${serverId}/switch-software`, {
        method: 'POST',
        body: { software: newSoftware, version: newVersion, confirm: true }
      });
      toast(res.message || 'Transition complete!', 'success');
      reloadServerInfo();
      loadSettings();
    } catch (err) {
      toast('Transition failed: ' + err.message, 'error');
    }
  };

  const handleDeleteServer = async () => {
    const ok = await showConfirm(
      'PERMANENTLY DELETE THIS SERVER? This cannot be undone. All server files, logs, databases, and configs will be completely deleted.',
      'Delete Server'
    );
    if (!ok) return;

    const confirmName = await showPrompt('Type the server name exactly to confirm deletion:', '', 'Confirm Deletion');
    if (confirmName === null) return;
    if (confirmName !== serverInfo?.name) {
      toast('Confirmation name did not match. Deletion aborted.', 'error');
      return;
    }

    try {
      toast('Deleting server', 'info');
      await api(`/api/servers/${serverId}`, { method: 'DELETE' });
      toast('Server successfully deleted.', 'success');
      navigate('/panel');
    } catch (err) {
      toast('Deletion failed: ' + err.message, 'error');
    }
  };

  const availableVersions = versions ? versions[newSoftware] || [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Engine & Version Switcher */}
      <div className="card">
        <h3>Server Engine &amp; Version</h3>
        <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
          Switch server engine software or upgrade/downgrade version. The server must be stopped first.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="form-group">
            <label>Current Engine</label>
            <input type="text" value={serverInfo?.software || ''} readOnly disabled />
          </div>
          <div className="form-group">
            <label>Current Version</label>
            <input type="text" value={serverInfo?.version || ''} readOnly disabled />
          </div>
        </div>

        {hasPerm('server.properties.write') && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>New Engine Software</label>
              <select
                value={newSoftware}
                onChange={(e) => { setNewSoftware(e.target.value); setNewVersion(''); }}
                style={{ width: '100%', height: '38px', padding: '0 0.75rem' }}
              >
                <option value="vanilla">Vanilla</option>
                <option value="snapshots">Vanilla Snapshots</option>
                <option value="paper">Paper</option>
                <option value="purpur">Purpur</option>
                <option value="fabric">Fabric</option>
                <option value="forge">Forge</option>
                <option value="quilt">Quilt</option>
                <option value="magma">Magma</option>
                <option value="bedrock">Bedrock (Native)</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>New Minecraft Version</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  style={{ flex: 1, height: '38px', padding: '0 0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', color: 'var(--text)' }}
                >
                  <option value="">Select version</option>
                  {availableVersions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn outline"
                  onClick={handleRefreshVersions}
                  style={{ height: '38px', padding: '0 0.75rem' }}
                  title="Refresh versions from APIs"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <button className="btn primary" onClick={handleSwitchSoftware} style={{ height: '38px', width: '100%' }}>
                Switch Engine
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Server Details & Resources */}
      <div className="card">
        <h3>Server Details &amp; Resources</h3>
        <p className="text-muted" style={{ marginBottom: '1rem' }}>
          General server options and hardware budget configurations.
        </p>

        {loading ? (
          <p className="text-muted">Loading settings</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label>Server Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Minecraft Server" />
              </div>
              <div className="form-group">
                <label>Allocated RAM (MB)</label>
                <input type="number" value={ram} onChange={(e) => setRam(e.target.value)} placeholder="2048" min="512" max="16384" />
              </div>
              <div className="form-group">
                <label>Custom Server Port</label>
                <input type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="25565" min="1024" max="65535" />
              </div>
              {serverInfo?.software?.toLowerCase() !== 'bedrock' && (
                <div className="form-group">
                  <label>Java Path / Binary</label>
                  <input type="text" value={javaPath} onChange={(e) => setJavaPath(e.target.value)} placeholder="java" />
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem' }}>Retention &amp; Lifecycle</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <div className="form-group">
                  <label>Log Retention (Days)</label>
                  <input type="number" value={logRetention} onChange={(e) => setLogRetention(e.target.value)} placeholder="7" min="0" />
                </div>
                <div className="form-group">
                  <label>Backup Retention (Days)</label>
                  <input type="number" value={backupRetention} onChange={(e) => setBackupRetention(e.target.value)} placeholder="30" min="0" />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Autostart on boot</div>
                    <div className="text-muted" style={{ fontSize: '0.79rem', marginTop: '0.15rem' }}>Automatically start this server when the panel boots up.</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={autostart} onChange={(e) => setAutostart(e.target.checked)} />
                    <span className="toggle-slider"></span>
                  </label>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Autostart on crash</div>
                    <div className="text-muted" style={{ fontSize: '0.79rem', marginTop: '0.15rem' }}>
                      Automatically restart this server if it crashes (non-zero exit code). Does not trigger on manual stops/kills.
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={autostartCrash} onChange={(e) => setAutostartCrash(e.target.checked)} />
                    <span className="toggle-slider"></span>
                  </label>
                </label>
              </div>
            </div>

            {hasPerm('server.properties.write') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button className="btn primary" onClick={handleSaveSettings} disabled={saving}>
                  {saving ? 'Saving' : 'Save Settings'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Danger Zone */}
      {hasPerm('account.manage') && (
        <div className="card" style={{ border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--bg-surface) 85%, var(--danger) 25%)' }}>
          <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Delete Server</h3>
          <p style={{ marginBottom: '1rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Permanently delete this server, including all files, databases, and configurations. This action cannot be undone.
          </p>
          <button className="btn danger" onClick={handleDeleteServer}>Delete Server</button>
        </div>
      )}

      {/* Switch Software Warning Modal */}
      {showSwitchModal && (
        <div className="modal-overlay active" onClick={() => setShowSwitchModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--warning)' }}>Compatibility Warnings</h3>
              <button className="close-btn" onClick={() => setShowSwitchModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                Switching the engine or changing version has potential issues:
              </p>
              <div style={{ background: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: '0.85rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                {switchWarnings.map((warning, i) => (
                  <div key={i} style={{ marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>&bull; {warning}</div>
                ))}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Are you sure you want to proceed? Ensure you have a full backup before continuing!
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn outline" onClick={() => setShowSwitchModal(false)}>Cancel</button>
              <button className="btn primary" onClick={executeSwitchSoftware}>Proceed Switch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
