import { useEffect, useState } from 'react';
import Section from './Section';
import { api, demoMode } from '../lib/api';
import type { McpSettings as Settings } from '../lib/mcp';
import { toast } from './Toast';
import '../styles/pages/McpServers.css';
import { useAuth } from '../context/AuthContext';
import { canManageMcp } from '../lib/mcp';

const numeric: [keyof Settings, string, number, number][] = [
  ['requestsPerMinute', 'Global requests per minute', 1, 10000], ['identityRequestsPerMinute', 'Per-identity ceiling per minute', 1, 1000],
  ['maxConcurrent', 'Maximum concurrent operations', 1, 32], ['maxPendingApprovals', 'Maximum pending approvals', 1, 1000],
  ['requestTimeoutMs', 'Request timeout (milliseconds)', 1000, 120000], ['approvalExpirationMs', 'Approval expiration (milliseconds)', 10000, 86400000],
  ['maxRequestBytes', 'Maximum request size (bytes)', 1024, 1048576]
];
export default function McpSettings() {
  const { user } = useAuth();
  const allowed = canManageMcp(user);
  const [config, setConfig] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!demoMode && allowed) api('/api/mcp/settings').then(setConfig).catch(e => setError(e.message)); }, [allowed]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    try { setConfig(await api('/api/mcp/settings', { method: 'PUT', body: config })); toast('MCP settings saved', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  }
  if (!demoMode && !allowed) return null;
  return <Section className="mcp-settings"><h3>MCP Configuration</h3>
    <p className="text-muted">Configure the native agent endpoint. Remote connections require HTTPS and an explicit public origin. Identities keep their own ranks and server restrictions.</p>
    {demoMode ? <p>Install MinePanel to configure MCP identities and connections.</p> : error ? <p role="alert">{error}</p> : !config ? <p>Loading MCP configuration…</p> :
      <form onSubmit={save} className="mcp-form">
        <label className="mcp-check"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Enable MCP endpoint</label>
        <label>Endpoint path<input required value={config.endpoint} onChange={e => setConfig({ ...config, endpoint: e.target.value })} /></label>
        <label>Public HTTPS origin<input type="url" placeholder="https://panel.example.com" value={config.publicUrl} onChange={e => setConfig({ ...config, publicUrl: e.target.value })} /></label>
        <label>Additional allowed origins (one per line)<textarea value={config.allowedOrigins.join('\n')} onChange={e => setConfig({ ...config, allowedOrigins: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} /></label>
        {numeric.map(([key, label, min, max]) => <label key={key}>{label}<input required type="number" min={min} max={max} value={Number(config[key])} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })} /></label>)}
        <p className="text-muted">Behind a proxy, configure MCP_TRUST_PROXY with the proxy addresses or subnets. Endpoint changes apply immediately; update clients afterward.</p>
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save MCP Configuration'}</button>
      </form>}
  </Section>;
}
