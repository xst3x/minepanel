import Section from './Section';

export default function McpConnectionSetup({ endpoint }: { endpoint: string }) {
  return <Section>
    <h3>Connection Setup</h3>
    <p>Endpoint: <code>{endpoint}</code></p>
    <p>Use Streamable HTTP and send your bearer key on every request. Remote access requires HTTPS. Keep keys in private configuration or the client's secret store.</p>
    <h4>Codex config.toml</h4>
    <pre>{`[mcp_servers.minepanel]\nurl = "${endpoint}"\nbearer_token_env_var = "MINEPANEL_MCP_KEY"`}</pre>
    <p>Supply MINEPANEL_MCP_KEY in the environment of the Codex process.</p>
    <h4>Claude Code</h4>
    <pre>{`claude mcp add --transport http minepanel "${endpoint}" --header "Authorization: Bearer <your-key>"`}</pre>
    <h4>Cursor</h4>
    <pre>{JSON.stringify({ mcpServers: { minepanel: { url: endpoint, headers: { Authorization: 'Bearer ${env:MINEPANEL_MCP_KEY}' } } } }, null, 2)}</pre>
    <h4>Google Antigravity</h4>
    <pre>{JSON.stringify({ mcpServers: { minepanel: { serverUrl: endpoint, headers: { Authorization: 'Bearer <your-key>' } } } }, null, 2)}</pre>
    <p>Other clients must support HTTP URLs and bearer headers. Approve Everything mode requires reading MCP resources to poll approved operations.</p>
    <p>The optional skill at <code>agent-skills/minepanel/SKILL.md</code> is installed separately. MCP does not install skills automatically.</p>
    <p>See <code>docs/mcp.md</code> in the repository for installation instructions, protocol support, capability coverage, and current limitations.</p>
  </Section>;
}
