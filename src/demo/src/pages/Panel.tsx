import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { toast, showConfirm, toastProgress } from '../components/Toast.jsx';
import Select from '../components/Select.jsx';
import ModpackBrowser from '../components/ModpackBrowser.jsx';
import { showRestrictionWarning } from '../components/DemoBanner.jsx';
import '../styles/pages/Panel.css';

export default function Panel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [versions, setVersions] = useState(null);
  const [syncingVersions, setSyncingVersions] = useState(false);

  const action = searchParams.get('action');
  const showCreateModal = action === 'create';
  const showImportModal = action === 'import';

  const [csTab, setCsTab] = useState('java');
  const [csName, setCsName] = useState('');
  const [csSoftware, setCsSoftware] = useState('paper');
  const [csVersion, setCsVersion] = useState('');
  const [csRam, setCsRam] = useState(2048);
  const [csPort, setCsPort] = useState(25565);

  const [impFile, setImpFile] = useState(null);
  const [impName, setImpName] = useState('');
  const [impPort, setImpPort] = useState(25565);
  const [impSoftware, setImpSoftware] = useState('paper');
  const [impVersion, setImpVersion] = useState('');
  const [impRam, setImpRam] = useState(2048);
  const [impJar, setImpJar] = useState('');
  const [impRoot, setImpRoot] = useState('');
  const [importProgress, setImportProgress] = useState(null);
  const [impBusy, setImpBusy] = useState(false);

  const fileInputRef = useRef(null);

  const loadServers = async () => {
    try {
      const svs = await api('/api/servers');
      setServers(svs || []);
    } catch (e) {
      console.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (refresh = false) => {
    try {
      if (refresh) setSyncingVersions(true);
      const data = await api(`/api/system/versions${refresh ? '?refresh=true' : ''}`);
      setVersions(data);
    } catch (e) {
      console.error(e.message);
    } finally {
      if (refresh) setSyncingVersions(false);
    }
  };

  useEffect(() => {
    loadServers();
    loadVersions();
    const interval = setInterval(loadServers, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (csTab === 'java') { setCsSoftware('paper'); setCsPort(25565); }
    else if (csTab === 'bedrock') { setCsSoftware('bedrock'); setCsPort(19132); }
  }, [csTab]);

  useEffect(() => {
    if (versions && versions[csSoftware]) setCsVersion(versions[csSoftware][0] || '');
  }, [csSoftware, versions]);

  useEffect(() => {
    if (versions && versions[impSoftware]) setImpVersion(versions[impSoftware][0] || '');
  }, [impSoftware, versions]);

  const refreshVersions = async () => { await loadVersions(true); };

  const handleCreateServer = async (e) => {
    e.preventDefault();
    if (!csName || !csVersion) return toast('Name and version are required.', 'error');

    const name = csName, software = csSoftware, version = csVersion, ram = csRam, port = csPort;
    setSearchParams({});
    setCsName(''); setCsSoftware('paper'); setCsRam(2048); setCsPort(25565); setCsTab('java');

    const dismiss = toastProgress(`Creating server "${name}"...`);
    try {
      await api('/api/servers/create', {
        method: 'POST',
        body: { name, software, version, ram_mb: Number(ram), port: Number(port) }
      });
      loadServers();
      dismiss(null, `Server "${name}" created successfully.`);
    } catch (err) {
      dismiss(err.message || 'Server creation failed.');
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = (e) => {
    e.preventDefault();
    showRestrictionWarning('file.upload');
  };

  const setFile = (file) => {
    setImpFile(file);
    if (!impName) {
      const fallbackName = file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      setImpName(fallbackName);
    }
  };

  const handleImportServer = async (e) => {
    e.preventDefault();
    showRestrictionWarning('server.import');
  };

  const isAdmin = user?.role === 'admin' ||
    (Array.isArray(user?.globalPermissions) && (
      user.globalPermissions.includes('*') ||
      user.globalPermissions.includes('root') ||
      user.globalPermissions.includes('panel.settings')
    ));

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Your Servers</h2>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn primary" onClick={() => setSearchParams({ action: 'create' })}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Server
            </button>
            <button className="btn outline" onClick={() => showRestrictionWarning('server.import')}>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Import Server
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted">Loading servers...</p>
      ) : servers.length === 0 ? (
        <p className="text-muted">No servers found.</p>
      ) : (
        <div className="servers-grid" id="servers-grid">
          {servers.map((sv, i) => (
            <div 
              key={sv.id} 
              className="server-card"
              style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              onClick={() => navigate(`/server/${sv.id}/overview`)}
            >
              <h4>{sv.name}</h4>
              <p>{sv.software} {sv.version}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className={`status-badge ${sv.status || 'offline'}`}>
                  {(sv.status || 'offline').toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay active" id="modal-create-server">
          <div className={`modal${csTab === 'modpacks' ? ' large' : ''}`}>
            <div className="modal-header">
              <h3>Create new server</h3>
              <button className="close-btn" onClick={() => { setSearchParams({}); setCsTab('java'); }}>&times;</button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 1.5rem', gap: '0.25rem' }}>
              {[
                { id: 'java', label: 'Java Edition', icon: 'java' },
                { id: 'bedrock', label: 'Bedrock Edition', icon: 'bedrock' },
                { id: 'modpacks', label: 'Java Modpacks', icon: 'modpacks' },
              ].map(tab => (
                <button key={tab.id} type="button" onClick={() => setCsTab(tab.id)}
                  style={{
                    padding: '0.65rem 1.1rem', background: 'none', border: 'none',
                    borderBottom: csTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                    color: csTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: csTab === tab.id ? 600 : 400,
                    fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.45rem',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {tab.icon === 'java' && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>}
                  {tab.icon === 'bedrock' && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>}
                  {tab.icon === 'modpacks' && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={csTab === 'modpacks' ? (e) => e.preventDefault() : handleCreateServer}>
              <div className="modal-body" style={csTab === 'modpacks' ? { paddingBottom: '0.5rem' } : undefined}>
                <div className="form-group">
                  <label>Server Name</label>
                  <input type="text" required={csTab !== 'modpacks'} placeholder="My Server" value={csName} onChange={(e) => setCsName(e.target.value)} />
                </div>

                {csTab === 'modpacks' && (
                  <>
                    <div className="form-group row" style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div className="col" style={{ flex: 1 }}><label>RAM (MB)</label><input type="number" min="512" max="16384" value={csRam} onChange={(e) => setCsRam(e.target.value)} /></div>
                      <div className="col" style={{ flex: 1 }}><label>Port</label><input type="number" min="1024" max="65535" value={csPort} onChange={(e) => setCsPort(e.target.value)} /></div>
                    </div>
                    <ModpackBrowser serverName={csName} ramMb={csRam} port={csPort} onInstalled={() => { setSearchParams({}); setCsName(''); setCsRam(2048); setCsPort(25565); setCsTab('java'); loadServers(); }} />
                  </>
                )}

                {csTab === 'java' && (
                  <>
                    <div className="form-group">
                      <label>Software Engine</label>
                      <Select value={csSoftware} onChange={(e) => setCsSoftware(e.target.value)}>
                        <option value="paper">Paper (Recommended)</option>
                        <option value="vanilla">Vanilla</option>
                        <option value="purpur">Purpur</option>
                        <option value="fabric">Fabric</option>
                        <option value="forge">Forge</option>
                        <option value="neoforge">NeoForge</option>
                        <option value="quilt">Quilt</option>
                        <option value="folia">Folia</option>
                      </Select>
                    </div>
                    <div className="form-group">
                      <label>Minecraft Version</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Select style={{ flex: 1 }} value={csVersion} onChange={(e) => setCsVersion(e.target.value)}>
                          {versions && versions[csSoftware]?.map(v => <option key={v} value={v}>{v}</option>)}
                          {(!versions || !versions[csSoftware]?.length) && <option value="">{syncingVersions ? 'Syncing...' : 'No versions available'}</option>}
                        </Select>
                        <button type="button" className="btn outline" title="Refresh versions" onClick={refreshVersions} disabled={syncingVersions} style={{ height: '38px', padding: '0 0.75rem' }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                      </div>
                    </div>
                    <div className="form-group row" style={{ display: 'flex', gap: '1rem' }}>
                      <div className="col" style={{ flex: 1 }}><label>RAM (MB)</label><input type="number" min="512" max="16384" value={csRam} onChange={(e) => setCsRam(e.target.value)} /></div>
                      <div className="col" style={{ flex: 1 }}><label>Port</label><input type="number" min="1024" max="65535" value={csPort} onChange={(e) => setCsPort(e.target.value)} /></div>
                    </div>
                  </>
                )}

                {csTab === 'bedrock' && (
                  <>
                    <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px', color: 'var(--accent)' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Bedrock servers use UDP instead of TCP.
                    </div>
                    <div className="form-group"><label>Software Engine</label>
                      <Select value={csSoftware} onChange={(e) => setCsSoftware(e.target.value)}>
                        <option value="bedrock">Vanilla</option>
                        <option value="pocketmine">PocketMine-MP</option>
                      </Select>
                    </div>
                    <div className="form-group"><label>Version</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Select style={{ flex: 1 }} value={csVersion} onChange={(e) => setCsVersion(e.target.value)}>
                          {versions && versions[csSoftware]?.map(v => <option key={v} value={v}>{v}</option>)}
                        </Select>
                      </div>
                    </div>
                    <div className="form-group row" style={{ display: 'flex', gap: '1rem' }}>
                      <div className="col" style={{ flex: 1 }}><label>RAM (MB)</label><input type="number" min="512" max="16384" value={csRam} onChange={(e) => setCsRam(e.target.value)} /></div>
                      <div className="col" style={{ flex: 1 }}><label>Port (UDP)</label><input type="number" min="1024" max="65535" value={csPort} onChange={(e) => setCsPort(e.target.value)} /></div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn outline" onClick={() => { setSearchParams({}); setCsTab('java'); }}>Cancel</button>
                {csTab !== 'modpacks' && <button type="submit" className="btn primary">Create Server</button>}
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay active" id="modal-import-server">
          <div className="modal large">
            <div className="modal-header">
              <h3>Import Existing Server</h3>
              <button className="close-btn" onClick={() => setSearchParams({})}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Server import is disabled in the demo version.</p>
              <p>Download the full version at <a href="https://github.com/xst3x/minepanel" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>github.com/xst3x/minepanel</a></p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn outline" onClick={() => setSearchParams({})}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
