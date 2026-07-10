import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.ts';
import { toast, showConfirm } from '../../components/Toast.tsx';
import '../../styles/pages/server/ApiKeys.css';

const SCOPE_LABELS: Record<string, string> = {
 'server.read': 'Read server info & MOTD',
 'server.console.read': 'View console',
 'server.console.write': 'Send commands',
 'server.players.read': 'View players',
 'server.performance.read': 'View performance',
 'server.files.read': 'Read files',
 'server.files.write': 'Write files',
 'server.files.delete': 'Delete files',
 'server.backups.read': 'View backups',
 'server.backups.write': 'Manage backups',
 'server.power': 'Power control',
 'server.everything': 'Full access (all scopes)',
};

const SCOPE_GROUPS: Record<string, string[]> = {
 'Server': ['server.read', 'server.everything'],
 'Console': ['server.console.read', 'server.console.write'],
 'Players': ['server.players.read'],
 'Performance': ['server.performance.read'],
 'Files': ['server.files.read', 'server.files.write', 'server.files.delete'],
 'Backups': ['server.backups.read', 'server.backups.write'],
 'Power': ['server.power'],
};

const EXAMPLE_CURL = `# Get server info
curl -H "Authorization: Bearer YOUR_API_KEY" /serverapi/1/info

# Send a console command
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\
 -H "Content-Type: application/json" \\
 -d '{"command":"say Hello from the API!"}' \\
 /serverapi/1/console

# Start the server
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" /serverapi/1/start
`;

const EXAMPLE_FETCH = `// Get server info
fetch('/serverapi/1/info', {
 headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
})
 .then(r => r.json())
 .then(data => console.log(data));

// Send a command
fetch('/serverapi/1/console', {
 method: 'POST',
 headers: {
 'Authorization': 'Bearer YOUR_API_KEY',
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ command: 'say Hello!' }),
})
 .then(r => r.json())
 .then(data => console.log(data));
`;

const EXAMPLE_PYTHON = `import requests

API_KEY = "YOUR_API_KEY"
BASE = "/serverapi/1"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# Get server info
r = requests.get(f"{BASE}/info", headers=HEADERS)
print(r.json())

# Send command
r = requests.post(f"{BASE}/console",
 headers=HEADERS,
 json={"command": "say Hello!"})
print(r.json())
`;

const EXAMPLE_NODE = `const axios = require('axios');

const API_KEY = 'YOUR_API_KEY';
const BASE = '/serverapi/1';

// Get server info
const info = await axios.get(\`$\{BASE}/info\`, {
 headers: { Authorization: \`Bearer $\{API_KEY}\` }
});
console.log(info.data);

// Send command
const result = await axios.post(\`$\{BASE}/console\`,
 { command: 'say Hello!' },
 { headers: { Authorization: \`Bearer $\{API_KEY}\` } }
);
console.log(result.data);
`;

// ── Code snippet component ──────────────────────────────────────────────
function CodeBlock({ title, code, language }: { title: string; code: string; language: string }) {
 const [copied, setCopied] = useState(false);

 const copy = () => {
 navigator.clipboard.writeText(code);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 return (
 <div className="api-code-block">
 <div className="api-code-header">
 <span className="api-code-lang">{title}</span>
 <button className="btn outline small" onClick={copy}>
 {copied ? 'Copied!' : 'Copy'}
 </button>
 </div>
 <pre className="api-code-body"><code>{code}</code></pre>
 </div>
 );
}

function IpListEditor({ ips, onChange }: { ips: string[]; onChange: (ips: string[]) => void }) {
 const [input, setInput] = useState('');

 const addIp = () => {
 const trimmed = input.trim();
 if (!trimmed) return;
 if (ips.includes(trimmed)) {
 toast('IP already in list', 'error');
 return;
 }
 onChange([...ips, trimmed]);
 setInput('');
 };

 const removeIp = (ip: string) => {
 onChange(ips.filter(i => i !== ip));
 };

 return (
 <div>
 <div style={{ display: 'flex', gap: '4px', marginBottom: '0.4rem' }}>
 <input
 type="text"
 value={input}
 onChange={e => setInput(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') addIp(); }}
 placeholder="e.g. 192.168.1.0/24 or 10.0.0.1"
 style={{ flex: 1, padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
 />
 <button className="btn outline small" onClick={addIp} style={{ fontSize: '11px' }}>Add</button>
 </div>
 {ips.length > 0 ? (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
 {ips.map(ip => (
 <span key={ip} className="ip-badge">
 <code>{ip}</code>
 <button className="ip-badge-remove" onClick={() => removeIp(ip)}>&times;</button>
 </span>
 ))}
 </div>
 ) : (
 <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
 No IP restrictions — key can be used from any IP address.
 </p>
 )}
 </div>
 );
}

export default function ServerApiKeys() {
 const { serverId } = useOutletContext();
 const [keys, setKeys] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [showCreate, setShowCreate] = useState(false);
 const [showDocs, setShowDocs] = useState(false);
 const [newKeyName, setNewKeyName] = useState('');
 const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['server.read']);
 const [newKeyExpiry, setNewKeyExpiry] = useState('');
 const [newKeyIps, setNewKeyIps] = useState<string[]>([]);
 const [creating, setCreating] = useState(false);
 const [createdKey, setCreatedKey] = useState<string | null>(null);
 const [editingKey, setEditingKey] = useState<number | null>(null);
 const [editName, setEditName] = useState('');
 const [editScopes, setEditScopes] = useState<string[]>([]);
 const [editIps, setEditIps] = useState<string[]>([]);
 const [activeExample, setActiveExample] = useState('curl');

 const loadKeys = async () => {
 setLoading(true);
 try {
 const data = await api(`/api/servers/${serverId}/api-keys`);
 setKeys(data || []);
 } catch (e) {
 toast('Failed to load API keys: ' + e.message, 'error');
 }
 setLoading(false);
 };

 useEffect(() => {
 loadKeys();
 }, [serverId]);

 const toggleScope = (scope: string, list: string[], setter: (s: string[]) => void) => {
 if (scope === 'server.everything') {
 setter(['server.everything']);
 return;
 }
 if (list.includes('server.everything') && scope !== 'server.everything') {
 const filtered = list.filter(s => s !== 'server.everything');
 setter(filtered.includes(scope) ? filtered.filter(s => s !== scope) : [...filtered, scope]);
 return;
 }
 setter(list.includes(scope) ? list.filter(s => s !== scope) : [...list, scope]);
 };

 const handleCreate = async () => {
 if (!newKeyName.trim()) {
 toast('Key name is required', 'error');
 return;
 }
 setCreating(true);
 try {
 const data = await api(`/api/servers/${serverId}/api-keys`, {
 method: 'POST',
 body: {
 name: newKeyName.trim(),
 scopes: newKeyScopes,
 expires_at: newKeyExpiry || null,
 allowed_ips: newKeyIps,
 },
 });
 setCreatedKey(data.key);
 setShowCreate(false);
 setNewKeyName('');
 setNewKeyScopes(['server.read']);
 setNewKeyExpiry('');
 setNewKeyIps([]);
 await loadKeys();
 } catch (e) {
 toast('Failed to create API key: ' + e.message, 'error');
 }
 setCreating(false);
 };

 const handleRevoke = async (keyId: number, keyName: string) => {
 if (!await showConfirm(`Revoke API key "${keyName}"?\n\nThis will immediately invalidate the key. Any services using it will lose access.`, 'Revoke Key')) return;
 try {
 await api(`/api/servers/${serverId}/api-keys/${keyId}`, { method: 'DELETE' });
 toast(`Key "${keyName}" revoked`, 'success');
 await loadKeys();
 } catch (e) {
 toast('Failed to revoke key: ' + e.message, 'error');
 }
 };

 const handleUpdate = async (keyId: number) => {
 try {
 await api(`/api/servers/${serverId}/api-keys/${keyId}`, {
 method: 'PATCH',
 body: { name: editName, scopes: editScopes, allowed_ips: editIps },
 });
 toast('API key updated', 'success');
 setEditingKey(null);
 await loadKeys();
 } catch (e) {
 toast('Failed to update key: ' + e.message, 'error');
 }
 };

 return (
 <div className="api-keys-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
 {/* Header */}
 <div className="card">
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
 <div>
 <h3 style={{ margin: 0 }}>API Keys</h3>
 <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
 Create and manage API keys for external applications, bots, and automation tools.
 </p>
 </div>
 <div style={{ display: 'flex', gap: '0.5rem' }}>
 <button className="btn outline small" onClick={() => setShowDocs(!showDocs)}>
 API Docs
 </button>
 <button className="btn primary" onClick={() => setShowCreate(true)}>
 + New Key
 </button>
 </div>
 </div>
 </div>

 {/* Docs Panel */}
 {showDocs && (
 <div className="card">
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
 <h4 style={{ margin: 0 }}>API Documentation & Examples</h4>
 <a href="/serverapi/docs/ui" target="_blank" rel="noopener noreferrer" className="btn outline small">
 Open Swagger UI 
 </a>
 </div>
 <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
 Base URL: <code>/serverapi/:serverId/</code> — Authenticate with <code>Authorization: Bearer &lt;key&gt;</code>
 </p>

 <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
 {['curl', 'fetch', 'python', 'node'].map(lang => (
 <button
 key={lang}
 className={`btn outline small${activeExample === lang ? ' active' : ''}`}
 onClick={() => setActiveExample(lang)}
 style={activeExample === lang ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}
 >
 {lang === 'curl' ? 'cURL' : lang === 'fetch' ? 'JS Fetch' : lang === 'python' ? 'Python' : 'Node.js'}
 </button>
 ))}
 </div>

 <CodeBlock
 title={
 activeExample === 'curl' ? 'cURL' :
 activeExample === 'fetch' ? 'JavaScript (Fetch)' :
 activeExample === 'python' ? 'Python (requests)' : 'Node.js (axios)'
 }
 code={
 activeExample === 'curl' ? EXAMPLE_CURL :
 activeExample === 'fetch' ? EXAMPLE_FETCH :
 activeExample === 'python' ? EXAMPLE_PYTHON : EXAMPLE_NODE
 }
 language={activeExample}
 />
 </div>
 )}

 {/* Created Key Banner */}
 {createdKey && (
 <div className="card" style={{ border: '2px solid var(--success)', background: 'color-mix(in srgb, var(--success) 8%, transparent)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
 <div>
 <h4 style={{ margin: '0 0 0.25rem', color: 'var(--success)' }}> API Key Created</h4>
 <p style={{ fontSize: '0.82rem', color: 'var(--text)', margin: '0 0 0.5rem' }}>
 Save this key now — it will <strong>never</strong> be shown again!
 </p>
 <div className="api-key-reveal" onClick={() => { navigator.clipboard.writeText(createdKey); toast('API key copied!', 'success'); }}>
 <code className="api-key-value">{createdKey}</code>
 <span className="api-key-copy-hint">Click to copy</span>
 </div>
 </div>
 <button className="btn outline small" onClick={() => { setCreatedKey(null); }}>Dismiss</button>
 </div>
 </div>
 )}

 {/* Key List */}
 <div className="card" style={{ padding: 0 }}>
 {loading ? (
 <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading API keys...</p>
 ) : keys.length === 0 ? (
 <div style={{ padding: '2rem', textAlign: 'center' }}>
 <p className="text-muted" style={{ margin: '0 0 0.5rem' }}>No API keys yet.</p>
 <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
 Create a key to get started with the Server API.
 </p>
 </div>
 ) : (
 <div>
 <div className="api-key-list-header">
 <span>Name</span>
 <span>Key</span>
 <span>Scopes</span>
 <span>IP Restriction</span>
 <span>Last Used</span>
 <span>Expires</span>
 <span>Status</span>
 <span></span>
 </div>
 {keys.map((key: any) => (
 <div key={key.id} className={`api-key-row${key.is_revoked ? ' revoked' : ''}`}>
 {editingKey === key.id ? (
 <>
 <div>
 <input
 type="text"
 value={editName}
 onChange={e => setEditName(e.target.value)}
 style={{ width: '100px', padding: '4px 6px', fontSize: '12px' }}
 autoFocus
 />
 </div>
 <div className="api-key-prefix"><code>{key.key_prefix}</code></div>
 <div className="api-key-scopes-inline">
 <select
 multiple
 value={editScopes}
 onChange={e => {
 const opts = Array.from(e.target.selectedOptions, o => o.value);
 setEditScopes(opts);
 }}
 style={{ fontSize: '10px', height: '60px', width: '120px' }}
 >
 {Object.keys(SCOPE_LABELS).map(s => (
 <option key={s} value={s}>{s}</option>
 ))}
 </select>
 </div>
 <div className="api-key-ips-edit">
 <IpListEditor ips={editIps} onChange={setEditIps} />
 </div>
 <div></div>
 <div></div>
 <div></div>
 <div style={{ display: 'flex', gap: '4px' }}>
 <button className="btn primary small" onClick={() => handleUpdate(key.id)} style={{ fontSize: '11px' }}>Save</button>
 <button className="btn outline small" onClick={() => setEditingKey(null)} style={{ fontSize: '11px' }}>Cancel</button>
 </div>
 </>
 ) : (
 <>
 <div className="api-key-name">{key.name}</div>
 <div className="api-key-prefix"><code>{key.key_prefix}</code></div>
 <div className="api-key-scopes">
 {key.scopes.slice(0, 2).map((s: string) => (
 <span key={s} className="scope-badge" title={SCOPE_LABELS[s] || s}>{s}</span>
 ))}
 {key.scopes.length > 2 && <span className="scope-badge scope-more">+{key.scopes.length - 2}</span>}
 </div>
 <div className="api-key-ips">
 {key.allowed_ips && key.allowed_ips.length > 0 ? (
 key.allowed_ips.slice(0, 2).map((ip: string) => (
 <span key={ip} className="ip-badge"><code>{ip}</code></span>
 ))
 ) : (
 <span className="text-muted" style={{ fontSize: '0.75rem' }}>Any</span>
 )}
 {key.allowed_ips && key.allowed_ips.length > 2 && (
 <span className="scope-badge scope-more">+{key.allowed_ips.length - 2}</span>
 )}
 </div>
 <div className="api-key-last-used">
 {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
 </div>
 <div className="api-key-expires">
 {key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}
 </div>
 <div className="api-key-status">
 <span className={`status-dot ${key.is_revoked ? 'revoked' : 'active'}`} />
 {key.is_revoked ? 'Revoked' : 'Active'}
 </div>
 <div className="api-key-actions">
 <button
 className="btn outline small"
 title="Edit name, scopes & IP restrictions"
 onClick={() => {
 setEditingKey(key.id);
 setEditName(key.name);
 setEditScopes(key.scopes);
 setEditIps(key.allowed_ips || []);
 }}
 style={{ fontSize: '11px', padding: '2px 6px' }}
 >
 
 </button>
 {!key.is_revoked && (
 <button
 className="btn danger small"
 title="Revoke key"
 onClick={() => handleRevoke(key.id, key.name)}
 style={{ fontSize: '11px', padding: '2px 6px' }}
 >
 
 </button>
 )}
 </div>
 </>
 )}
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Create Key Modal */}
 {showCreate && (
 <div className="modal-overlay active" onClick={() => { if (!creating) setShowCreate(false); }}>
 <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
 <div className="modal-header">
 <h3>Create API Key</h3>
 <button className="close-btn" onClick={() => { if (!creating) setShowCreate(false); }}>&times;</button>
 </div>
 <div className="modal-body">
 <div style={{ marginBottom: '1rem' }}>
 <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Key Name</label>
 <input
 type="text"
 value={newKeyName}
 onChange={e => setNewKeyName(e.target.value)}
 placeholder="e.g. Discord Bot, Website, Grafana"
 autoFocus
 style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
 />
 </div>

 <div style={{ marginBottom: '1rem' }}>
 <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Expiration (optional)</label>
 <input
 type="date"
 value={newKeyExpiry}
 onChange={e => setNewKeyExpiry(e.target.value)}
 style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
 />
 </div>

 <div style={{ marginBottom: '1rem' }}>
 <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
 IP Allowlist (optional)
 </label>
 <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 0.4rem' }}>
 Restrict this key to specific IPs or CIDR ranges. Leave empty to allow all IPs.
 </p>
 <IpListEditor ips={newKeyIps} onChange={setNewKeyIps} />
 </div>

 <div>
 <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Scopes / Permissions</label>
 {Object.entries(SCOPE_GROUPS).map(([group, scopes]) => (
 <div key={group} style={{ marginBottom: '0.5rem' }}>
 <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{group}</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
 {scopes.map(scope => {
 const isSelected = newKeyScopes.includes(scope) || (scope === 'server.everything' && newKeyScopes.includes('server.everything'));
 return (
 <button
 key={scope}
 type="button"
 className={`btn ${isSelected ? 'primary' : 'outline'} small`}
 onClick={() => toggleScope(scope, newKeyScopes, setNewKeyScopes)}
 title={SCOPE_LABELS[scope]}
 style={{ fontSize: '10px', padding: '3px 8px' }}
 >
 {scope}
 </button>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 </div>
 <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
 <button className="btn outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
 <button className="btn primary" onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
 {creating ? 'Creating...' : 'Create Key'}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
