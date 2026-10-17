import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, demoMode } from '../lib/api';
import { getBasePath } from '../lib/basePath';
import { approvalModes, canManageMcp, type McpIdentity, type IdentityForm, type Approval } from '../lib/mcp';
import Section from '../components/Section';
import McpConnectionSetup from '../components/McpConnectionSetup';
import McpSettings from '../components/McpSettings';
import Select from '../components/Select';
import ModalOverlay from '../components/ModalOverlay';
import { showConfirm, toast } from '../components/Toast';
import '../styles/pages/McpServers.css';

type Rank = { id: number; name: string };
type Server = { id: number; name: string };
type Permission = { key: string; label: string; group: string };
type Audit = { id: number; event: string; tool: string | null; created_at: number; actor: string };
const blank: IdentityForm = { name: '', description: '', rankId: null, overrides: {}, allowedServers: [], approvalMode: 'dangerous', requestsPerMinute: 60, enabled: true };
function editable(i: McpIdentity): IdentityForm { return { name: i.name, description: i.description, rankId: i.rankId, overrides: i.overrides, allowedServers: i.allowedServers, approvalMode: i.approvalMode, requestsPerMinute: i.requestsPerMinute, enabled: i.enabled }; }
const time = (value: number | null) => value ? new Date(value).toLocaleString() : 'Never';
export default function McpServers() {
  const { user } = useAuth(); const { id } = useParams(); const navigate = useNavigate();
  const allowed = canManageMcp(user);
  const [identities, setIdentities] = useState<McpIdentity[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]); const [servers, setServers] = useState<Server[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]); const [activity, setActivity] = useState<Audit[]>([]);
  const [tab, setTab] = useState('Overview'); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false); const [form, setForm] = useState<IdentityForm>(blank); const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(''); const previousId = useRef(id); const [setup, setSetup] = useState({ endpointPath: getBasePath().replace(/\/$/, '') + '/mcp', publicUrl: '' });
  const selected = identities.find(i => i.id === id);
  const load = useCallback(async () => {
    if (demoMode || !allowed) { setLoading(false); return; }
    try {
      const [items, requests, events] = await Promise.all([api('/api/mcp/identities'), api('/api/mcp/approvals'), api('/api/mcp/activity' + (id ? `?identityId=${id}` : ''))]);
      setIdentities(items); setApprovals(requests); setActivity(events); setError('');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [id, allowed]);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('mp:mcp-changed', refresh);
    return () => { clearInterval(timer); window.removeEventListener('mp:mcp-changed', refresh); };
  }, [load]);
  useEffect(() => {
    if (demoMode || !allowed) return;
    Promise.all([api('/api/ranks'), api('/api/servers'), api('/api/ranks/permissions'), api('/api/mcp/setup')])
      .then(([r, s, p, setup]) => { setRanks(r); setServers(s); setPermissions(p.filter((permission: Permission) => permission.key !== 'mcp.manage')); setSetup(setup); }).catch(e => setError(e.message));
  }, [allowed]);
  useEffect(() => { if (selected) setForm(editable(selected)); }, [selected?.id]);
  useEffect(() => { setTab('Overview'); if (previousId.current && previousId.current !== id) setKey(''); previousId.current = id; }, [id]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await api(creating ? '/api/mcp/identities' : `/api/mcp/identities/${id}`, { method: creating ? 'POST' : 'PUT', body: form });
      if (creating) { setCreating(false); setKey(response.key); navigate(`/mcp-servers/${response.identity.id}`); }
      toast('MCP identity saved', 'success'); await load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function security(action: 'rotate' | 'revoke') {
    if (!await showConfirm(action === 'rotate' ? 'Rotate this key? Existing clients and pending approvals will lose access.' : 'Revoke this identity immediately? Existing keys and pending approvals will lose access.', 'MCP Security', { danger: true })) return;
    setBusy(true);
    try { const response = await api(`/api/mcp/identities/${id}/${action}`, { method: 'POST' }); setKey(response.key || ''); await load(); toast(action === 'rotate' ? 'Key rotated' : 'Access revoked', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function decide(request: Approval, approved: boolean) {
    if (!await showConfirm(`${approved ? 'Approve' : 'Deny'} ${request.tool} for ${request.identity_name}?\n\n${request.arguments}`, 'MCP Approval', { danger: approved && request.risk === 'dangerous' })) return;
    setBusy(true);
    try { await api(`/api/mcp/approvals/${request.id}/decision`, { method: 'POST', body: { approved } }); await load(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  function formFields() { return <>
    <label>Display name<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label>Description<textarea maxLength={1000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
    <label>Assigned rank<Select aria-label="Assigned rank" value={form.rankId ?? ''} onChange={e => setForm({ ...form, rankId: e.target.value ? Number(e.target.value) : null })}><option value="">No rank</option>{ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
    <label>Approval mode<Select aria-label="Approval mode" value={form.approvalMode} onChange={e => setForm({ ...form, approvalMode: e.target.value as IdentityForm['approvalMode'] })}>{Object.entries(approvalModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
    <label>Requests per minute<input required type="number" min={1} max={1000} value={form.requestsPerMinute} onChange={e => setForm({ ...form, requestsPerMinute: Number(e.target.value) })} /></label>
    <label className="mcp-check"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Enabled</label>
    <fieldset><legend>Allowed Minecraft servers</legend><p className="text-muted">Explicit selection is required, even for an Owner rank.</p>{servers.map(s => <label key={s.id} className="mcp-check"><input type="checkbox" checked={form.allowedServers.includes(String(s.id))} onChange={e => setForm({ ...form, allowedServers: e.target.checked ? [...form.allowedServers, String(s.id)] : form.allowedServers.filter(v => v !== String(s.id)) })} />{s.name}</label>)}</fieldset>
    <details><summary>Individual permission overrides</summary><p className="text-muted">Inherit uses the assigned rank. Deny always removes the permission.</p>{[...permissions, { key: 'server.plugins.install', label: 'Install Plugins / Mods', group: 'Plugins' }].map(p => <label key={p.key} className="mcp-permission"><span>{p.label}<small>{p.key}</small></span><Select aria-label={`${p.label} override`} value={form.overrides[p.key] === undefined ? 'inherit' : form.overrides[p.key] ? 'allow' : 'deny'} onChange={e => { const overrides = { ...form.overrides }; if (e.target.value === 'inherit') delete overrides[p.key]; else overrides[p.key] = e.target.value === 'allow'; setForm({ ...form, overrides }); }}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></Select></label>)}</details>
  </>; }
  const requestList = approvals.filter(a => !id || a.identity_id === id);
  const endpoint = (setup.publicUrl || window.location.origin).replace(/\/$/, '') + setup.endpointPath;
  if (demoMode) return <div className="page mcp-page"><h2>MCP Servers</h2><p>Install MinePanel to create agent identities and review approvals. MCP connections require a running backend.</p><a className="btn primary" href="https://github.com/xst3x/minepanel" target="_blank" rel="noreferrer">MinePanel on GitHub</a></div>;
  if (!allowed) return <div className="page"><h2>MCP Servers</h2><p role="alert">MCP administration requires the mcp.manage permission.</p></div>;
  return <div className="page mcp-page">
    <div className="page-header"><div><h2>{selected?.name || 'MCP Servers'}</h2><p className="text-muted">Independent agent identities, scoped access, and native approvals.</p></div>{!id && <button className="btn primary" onClick={() => { setForm(blank); setCreating(true); }}>Create MCP Server</button>}</div>
    {id && <Link to="/mcp-servers" className="btn small">All MCP Servers</Link>}
    {error && <p role="alert">{error}</p>}{loading && <p>Loading…</p>}
    {!loading && id && !selected && <p>Identity not found.</p>}
    {!id && <details><summary>MCP Configuration</summary><McpSettings /></details>}
    {key && <Section className="mcp-key"><h3>Save your authentication key now</h3><p>This key is shown once. Store it in your client's secret configuration.</p><code>{key}</code><button className="btn" onClick={() => setKey('')}>I have saved the key</button></Section>}
    {!id && <Section><div className="mcp-table-wrap"><table className="mcp-table"><thead><tr><th>Name</th><th>Status</th><th>Rank</th><th>Approval mode</th><th>Last used</th></tr></thead><tbody>{identities.map(i => <tr key={i.id}><td><Link to={`/mcp-servers/${i.id}`}>{i.name}</Link></td><td>{i.enabled ? 'Enabled' : 'Disabled'}</td><td>{ranks.find(r => r.id === i.rankId)?.name || 'No rank'}</td><td>{approvalModes[i.approvalMode]}</td><td>{time(i.lastUsedAt)}</td></tr>)}</tbody></table></div>{!identities.length && <p>No identities yet. Create one with a rank and an explicit server scope.</p>}</Section>}
    {selected && <><nav className="mcp-tabs" aria-label="MCP identity sections">{['Overview','Permissions','Security','Approvals','Activity','Setup'].map(t => <button key={t} className={`btn small ${t === tab ? 'primary' : ''}`} aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {tab === 'Overview' && <Section><p>{selected.description || 'No description'}</p><dl><dt>Identity ID</dt><dd>{selected.id}</dd><dt>Created</dt><dd>{time(selected.createdAt)}</dd><dt>Last used</dt><dd>{time(selected.lastUsedAt)}</dd><dt>Approval mode</dt><dd>{approvalModes[selected.approvalMode]}</dd><dt>Status</dt><dd>{selected.enabled ? 'Enabled' : 'Disabled'}</dd></dl></Section>}
      {tab === 'Permissions' && <form onSubmit={save} className="mcp-form">{formFields()}<button className="btn primary" disabled={busy}>Save Identity</button></form>}
      {tab === 'Security' && <Section><h3>Authentication and revocation</h3><p>Keys are stored as SHA-256 verifiers of 256-bit random secrets. Rotation invalidates the old key and outstanding approvals immediately. Generation: {selected.keyVersion}.</p><div className="mcp-actions"><button className="btn" disabled={busy} onClick={() => security('rotate')}>Rotate Key</button><button className="btn danger" disabled={busy} onClick={() => security('revoke')}>Revoke Access</button></div></Section>}
      {tab === 'Activity' && <Section><h3>Activity</h3>{activity.length ? activity.map(e => <p key={e.id}>{time(e.created_at)} · {e.event} · {e.tool || e.actor}</p>) : <p>No activity yet.</p>}</Section>}
      {tab === 'Setup' && <McpConnectionSetup endpoint={endpoint} />}
    </>}
    {(!id || tab === 'Approvals') && <Section><h3>Approval Center</h3><p className="text-muted">Review the exact arguments before approving. Approval permits one execution when the client polls.</p>{requestList.length ? requestList.map(a => <article key={a.id} className="mcp-request"><div><strong>{a.tool}</strong> · {a.identity_name} · <span>{a.status}</span></div><p>Risk: {a.risk} · Server: {a.server_id || 'Panel'} · Expires: {time(a.expires_at)}</p><pre>{JSON.stringify(JSON.parse(a.arguments), null, 2)}</pre>{a.status === 'pending' && <div className="mcp-actions"><button className="btn primary" disabled={busy} onClick={() => decide(a, true)}>Approve</button><button className="btn danger" disabled={busy} onClick={() => decide(a, false)}>Deny</button></div>}</article>) : <p>No approval requests.</p>}</Section>}
    {creating && <ModalOverlay className="modal-overlay active" onClick={() => setCreating(false)}><div className="modal mcp-modal" onClick={e => e.stopPropagation()} aria-labelledby="mcp-create-title"><h3 id="mcp-create-title">Create MCP Server</h3><form onSubmit={save} className="mcp-form">{formFields()}<div className="mcp-actions"><button className="btn close-btn" type="button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" disabled={busy}>Create and Generate Key</button></div></form></div></ModalOverlay>}
  </div>;
}
