import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm, showPrompt } from '../../components/Toast.jsx';
import Select from '../../components/Select.jsx';

// ─── Tiny inline icon helpers ─────────────────────────────────────────────────
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const IconUndo = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);



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

  // ── Auto-Update state ──────────────────────────────────────────────────────
  const [upd, setUpd] = useState({
    auto_update_software: false,
    auto_update_content: false,
    force_incompatible_updates: false,
    auto_backup_before_update: true,
    ignored_plugins: [],
    update_interval_hours: 12,
    last_update_check: null,
    last_update_run: null,
    _updateState: { status: 'idle', message: null },
  });
  const [updSaving, setUpdSaving] = useState(false);
  const [updChecking, setUpdChecking] = useState(false);
  const [updRunning, setUpdRunning] = useState(false);
  const [updCheckResult, setUpdCheckResult] = useState(null);
  const [ignoredInput, setIgnoredInput] = useState('');

  useEffect(() => {
    loadSettings();
    loadVersions();
    loadUpdateSettings();
  }, [serverId]);

  const loadUpdateSettings = async () => {
    try {
      const data = await api(`/api/servers/${serverId}/update/settings`);
      if (data) {
        setUpd({
          auto_update_software:       !!data.auto_update_software,
          auto_update_content:        !!data.auto_update_content,
          force_incompatible_updates: !!data.force_incompatible_updates,
          auto_backup_before_update:  data.auto_backup_before_update !== false,
          ignored_plugins:            Array.isArray(data.ignored_plugins) ? data.ignored_plugins : [],
          update_interval_hours:      data.update_interval_hours || 12,
          last_update_check:          data.last_update_check || null,
          last_update_run:            data.last_update_run || null,
          _updateState:               data._updateState || { status: 'idle', message: null },
        });
      }
    } catch (_) {}
  };

  const handleSaveUpdateSettings = async () => {
    setUpdSaving(true);
    try {
      await api(`/api/servers/${serverId}/update/settings`, {
        method: 'PATCH',
        body: {
          auto_update_software:       upd.auto_update_software,
          auto_update_content:        upd.auto_update_content,
          force_incompatible_updates: upd.force_incompatible_updates,
          auto_backup_before_update:  upd.auto_backup_before_update,
          ignored_plugins:            upd.ignored_plugins,
          update_interval_hours:      Number(upd.update_interval_hours),
        },
      });
      toast('Auto-update settings saved.', 'success');
    } catch (err) {
      toast('Failed to save update settings: ' + err.message, 'error');
    } finally {
      setUpdSaving(false);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdChecking(true);
    setUpdCheckResult(null);
    try {
      const result = await api(`/api/servers/${serverId}/update/check`, { method: 'POST' });
      setUpdCheckResult(result);
      if (result.available) {
        toast(`Update available: ${result.currentVersion} → ${result.latestVersion}`, 'info');
      } else {
        toast('Server is up to date.', 'success');
      }
    } catch (err) {
      toast('Check failed: ' + err.message, 'error');
    } finally {
      setUpdChecking(false);
    }
  };

  const handleRunUpdate = async () => {
    if (updCheckResult?.available && !updCheckResult.compatible && !upd.force_incompatible_updates) {
      toast('Update is incompatible. Enable "Force incompatible updates" to proceed.', 'error');
      return;
    }
    if (!updCheckResult?.available) {
      const ok = await showConfirm('No update was detected. Force run anyway?', 'Run Update');
      if (!ok) return;
    } else {
      const ok = await showConfirm(
        `Update ${updCheckResult.currentVersion} → ${updCheckResult.latestVersion}?\n\nThe server will be stopped, backed up, and the new jar installed.`,
        'Confirm Update'
      );
      if (!ok) return;
    }
    setUpdRunning(true);
    try {
      const result = await api(`/api/servers/${serverId}/update/run`, { method: 'POST', body: {} });
      toast(`Update complete! New version: ${result.newVersion}`, 'success');
      setUpdCheckResult(null);
      loadUpdateSettings();
      reloadServerInfo();
    } catch (err) {
      toast('Update failed: ' + err.message, 'error');
    } finally {
      setUpdRunning(false);
    }
  };

  const handleRollback = async () => {
    const ok = await showConfirm(
      'Roll back to the most recent pre-update backup? The server will be stopped.',
      'Confirm Rollback'
    );
    if (!ok) return;
    try {
      const result = await api(`/api/servers/${serverId}/update/rollback`, { method: 'POST' });
      toast(`Rolled back from ${result.restoredFrom}`, 'success');
      loadUpdateSettings();
      reloadServerInfo();
    } catch (err) {
      toast('Rollback failed: ' + err.message, 'error');
    }
  };

  const addIgnoredPlugin = () => {
    const trimmed = ignoredInput.trim().toLowerCase();
    if (!trimmed) return;
    if (upd.ignored_plugins.includes(trimmed)) { setIgnoredInput(''); return; }
    setUpd(prev => ({ ...prev, ignored_plugins: [...prev.ignored_plugins, trimmed] }));
    setIgnoredInput('');
  };

  const removeIgnoredPlugin = (p) => {
    setUpd(prev => ({ ...prev, ignored_plugins: prev.ignored_plugins.filter(x => x !== p) }));
  };



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

  const BEDROCK_SOFTWARES = ['bedrock', 'bedrock-preview', 'pocketmine', 'nukkitx', 'powernukkitx', 'waterdogpe'];
  const currentIsBedrock = BEDROCK_SOFTWARES.includes(serverInfo?.software?.toLowerCase());

  const javaSoftwareOptions = [
    { value: 'vanilla',   label: 'Vanilla' },
    { value: 'snapshots', label: 'Vanilla Snapshots' },
    { value: 'paper',     label: 'Paper' },
    { value: 'purpur',    label: 'Purpur' },
    { value: 'fabric',    label: 'Fabric' },
    { value: 'forge',     label: 'Forge' },
    { value: 'neoforge',  label: 'NeoForge' },
    { value: 'quilt',     label: 'Quilt' },
    { value: 'magma',     label: 'Magma' },
    { value: 'folia',     label: 'Folia' },
    { value: 'velocity',  label: 'Velocity' },
    { value: 'waterfall', label: 'Waterfall' },
    { value: 'leaves',    label: 'Leaves' },
    { value: 'pufferfish',label: 'Pufferfish' },
    { value: 'arclight',  label: 'Arclight' },
    { value: 'mohist',    label: 'Mohist' },
    { value: 'spongevanilla', label: 'SpongeVanilla' },
  ];
  const bedrockSoftwareOptions = [
    { value: 'bedrock',       label: 'Vanilla' },
    { value: 'bedrock-preview', label: 'Vanilla (Preview/Snapshots)' },
    { value: 'pocketmine',    label: 'PocketMine-MP' },
    { value: 'nukkitx',       label: 'NukkitX' },
    { value: 'powernukkitx',  label: 'PowerNukkitX' },
    { value: 'waterdogpe',    label: 'WaterdogPE (Proxy)' },
  ];
  const softwareOptions = currentIsBedrock ? bedrockSoftwareOptions : javaSoftwareOptions;

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
              <Select
                value={newSoftware}
                onChange={(e) => { setNewSoftware(e.target.value); setNewVersion(''); }}
              >
                {softwareOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>New Minecraft Version</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Select
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Select version</option>
                  {availableVersions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
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

      {/* ── Auto-Update Settings ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <h3 style={{ margin: 0 }}>Auto-Update Settings</h3>
          {upd._updateState?.status && upd._updateState.status !== 'idle' && (
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '0.2rem 0.6rem', borderRadius: '999px',
              background: upd._updateState.status === 'error' ? 'color-mix(in srgb, var(--bg-surface) 80%, var(--danger) 20%)' : 'color-mix(in srgb, var(--bg-surface) 80%, var(--accent) 20%)',
              color: upd._updateState.status === 'error' ? 'var(--danger)' : 'var(--accent)',
              border: `1px solid ${upd._updateState.status === 'error' ? 'var(--danger)' : 'var(--accent)'}`,
            }}>
              {upd._updateState.status}
            </span>
          )}
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>
          Automatically check and install software updates on a schedule. Always creates a backup before applying.
        </p>

        {/* Update available banner */}
        {updCheckResult?.available && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
            background: 'color-mix(in srgb, var(--bg-surface) 80%, var(--accent) 20%)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem',
            marginBottom: '1rem', fontSize: '0.85rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontWeight: 600 }}>
              <IconShield />
              Update available: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{updCheckResult.currentVersion}</code>
              &nbsp;→&nbsp;
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{updCheckResult.latestVersion}</code>
              {!updCheckResult.compatible && (
                <span style={{ color: 'var(--warning)', fontSize: '0.75rem', fontWeight: 400 }}>
                  ⚠ Incompatible – {updCheckResult.compatibilityReason}
                </span>
              )}
            </div>
            <button
              className="btn primary"
              onClick={handleRunUpdate}
              disabled={updRunning}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <IconPlay /> {updRunning ? 'Updating…' : 'Apply Update'}
            </button>
          </div>
        )}

        {/* Toggle rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
          {[
            {
              key: 'auto_update_software',
              label: 'Auto-update software',
              desc: 'Automatically download and install server jar updates on the configured schedule.',
            },
            {
              key: 'auto_update_content',
              label: 'Auto-update content (plugins)',
              desc: 'Also check and update plugins/mods. Respects the ignored plugins list.',
            },
            {
              key: 'force_incompatible_updates',
              label: 'Force incompatible updates',
              desc: 'Allow cross-minor-version updates (e.g. 1.20 → 1.21). High risk – ensure plugin compatibility first.',
              warn: true,
            },
            {
              key: 'auto_backup_before_update',
              label: 'Backup before every update',
              desc: 'Create a full server backup before applying any update. Strongly recommended.',
              locked: upd.force_incompatible_updates,
            },
          ].map(({ key, label, desc, warn, locked }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: locked ? 'default' : 'pointer', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 500, color: warn ? 'var(--warning)' : 'var(--text-primary)', fontSize: '0.88rem' }}>{label}</div>
                <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.12rem' }}>{desc}</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={locked ? true : upd[key]}
                  disabled={locked}
                  onChange={locked ? undefined : (e) => setUpd(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </label>
          ))}
        </div>

        {/* Interval picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Check interval (hours)</label>
            <input
              type="number"
              min="1" max="168"
              value={upd.update_interval_hours}
              onChange={(e) => setUpd(prev => ({ ...prev, update_interval_hours: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Last check</label>
            <input
              type="text"
              readOnly
              value={upd.last_update_check ? new Date(upd.last_update_check).toLocaleString() : 'Never'}
              style={{ color: 'var(--text-muted)', cursor: 'default' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Last update applied</label>
            <input
              type="text"
              readOnly
              value={upd.last_update_run ? new Date(upd.last_update_run).toLocaleString() : 'Never'}
              style={{ color: 'var(--text-muted)', cursor: 'default' }}
            />
          </div>
        </div>

        {/* Ignored plugins */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontWeight: 500, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Ignored plugins (skip content updates for these)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. essentialsx"
              value={ignoredInput}
              onChange={(e) => setIgnoredInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIgnoredPlugin(); } }}
              style={{ flex: 1, height: '36px' }}
            />
            <button className="btn outline" onClick={addIgnoredPlugin} style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.82rem' }}>
              Add
            </button>
          </div>
          {upd.ignored_plugins.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {upd.ignored_plugins.map(p => (
                <span key={p} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '999px', padding: '0.15rem 0.6rem', fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
                }}>
                  {p}
                  <button
                    onClick={() => removeIgnoredPlugin(p)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1, fontSize: '0.9rem' }}
                    aria-label={`Remove ${p}`}
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button
            id="update-check-btn"
            className="btn outline"
            onClick={handleCheckUpdate}
            disabled={updChecking}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.83rem' }}
          >
            <IconRefresh /> {updChecking ? 'Checking…' : 'Check Now'}
          </button>
          <button
            id="update-run-btn"
            className="btn outline"
            onClick={handleRunUpdate}
            disabled={updRunning}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.83rem' }}
          >
            <IconPlay /> {updRunning ? 'Updating…' : 'Update Now'}
          </button>
          <button
            id="update-rollback-btn"
            className="btn outline"
            onClick={handleRollback}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.83rem', color: 'var(--warning)', borderColor: 'var(--warning)' }}
          >
            <IconUndo /> Rollback
          </button>
          {hasPerm('server.properties.write') && (
            <button
              id="update-save-btn"
              className="btn primary"
              onClick={handleSaveUpdateSettings}
              disabled={updSaving}
              style={{ marginLeft: 'auto', fontSize: '0.83rem' }}
            >
              {updSaving ? 'Saving…' : 'Save Update Settings'}
            </button>
          )}
        </div>
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
