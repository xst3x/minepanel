import { useState } from 'react';

const DOCS_DATA = {
  'getting-started': {
    title: 'Getting Started',
    content: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3>Welcome to MinePanel</h3>
          <p>MinePanel is a modern, lightweight Minecraft server management dashboard designed for ease of use, security, andHomelab friendliness.</p>
          <h4>Features at a Glance</h4>
          <ul>
            <li>Automatic software installation &amp; updates</li>
            <li>Real-time console stream &amp; command execution</li>
            <li>Sandboxed multi-user file explorer &amp; uploader</li>
            <li>Automated scheduled backups &amp; logs retention</li>
            <li>Per-server sandboxed SFTP (SSH File Transfer Protocol) daemon</li>
            <li>Multi-bot Discord integration with console stream &amp; slash commands</li>
          </ul>
        </div>
        <div className="card">
          <h3>General Architecture</h3>
          <h4>Sidebar â€” SERVERS section</h4>
          <p>Lists every server the current user has access to. Status dot updates live via WebSocket. Admins see all servers; non-admins see only those they have at least one permission on.</p>
          <h4>Sidebar â€” GLOBAL section</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Item</th><th style={{ padding: '6px' }}>Who can see it</th></tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>Users</code></td><td style={{ padding: '6px' }}>Everyone (self only for non-managers)</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>Ranks</code></td><td style={{ padding: '6px' }}>Users with <code>account.manage</code></td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>Panel Settings</code></td><td style={{ padding: '6px' }}>Admins and users with <code>panel.settings</code></td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>Docs</code></td><td style={{ padding: '6px' }}>Everyone</td></tr>
            </tbody>
          </table>
          <h4 style={{ marginTop: '1rem' }}>Server dashboard tabs</h4>
          <p>Overview &bull; Console &bull; Files &bull; Plugins/Mods &bull; Players &bull; Properties &bull; Backups &bull; Logs &bull; Settings &bull; FTP</p>
        </div>
      </div>
    )
  },
  'server-management': {
    title: 'Server Management',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>Creating a Server</h3>
            <p>Admin-only. The panel resolves the JAR from upstream sources, downloads it to the local cache, copies it into <code>servers/&lt;sanitized-name&gt;/server.jar</code>, writes <code>eula.txt=true</code>, and inserts a DB record.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Field</th><th style={{ padding: '6px' }}>Constraint</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Name</td><td style={{ padding: '6px' }}>Unique. Becomes the directory name (sanitized).</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Software</td><td style={{ padding: '6px' }}>Paper &bull; Purpur &bull; Vanilla &bull; Fabric &bull; Quilt &bull; Forge &bull; Magma</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Version</td><td style={{ padding: '6px' }}>Fetched from upstream version manifest</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>RAM (MB)</td><td style={{ padding: '6px' }}>512 â€“ 16 384</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Port</td><td style={{ padding: '6px' }}>1024 â€“ 65 535, unique across all servers</td></tr>
              </tbody>
            </table>
            <blockquote style={{ borderLeft: '4px solid var(--accent)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Forge Note</strong>: Forge triggers a separate installer run (<code>--installServer</code>). The panel executes it in a child process, parses the resulting directory for both modern (1.17+) and legacy layout directories, and copies the correct JAR to <code>server.jar</code>. Check <code>install.log</code> in the server directory if it fails.
            </blockquote>
          </div>
          <div className="card">
            <h3>Lifecycle â€” Start / Stop / Restart / Kill</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Action</th><th style={{ padding: '6px' }}>Behaviour</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Start</td><td style={{ padding: '6px' }}>Spawns <code>java -Xmx&lt;ram&gt;M -jar server.jar nogui</code>. Forge uses the args extracted from <code>run.bat</code> / <code>run.sh</code> instead. Console history is cleared before launch.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Stop</td><td style={{ padding: '6px' }}>Writes <code>/stop\n</code> to the process stdin. Waits up to 15 s for the process to exit.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Restart</td><td style={{ padding: '6px' }}>Graceful stop (same 15 s window) immediately followed by a fresh start. Aborts and reports if the stop times out.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Kill</td><td style={{ padding: '6px' }}>Sends SIGKILL to the exact PID tracked by the process manager. Console history is cleared.</td></tr>
              </tbody>
            </table>
            <blockquote style={{ borderLeft: '4px solid var(--danger)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Locking Warning</strong>: Every lifecycle action acquires an exclusive per-server lock. Concurrent Start/Stop/Kill/Delete requests on the same server get HTTP 409.
            </blockquote>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>File Manager</h3>
            <p>Sandboxed to <code>servers/&lt;name&gt;/</code>. Every path is resolved with <code>path.resolve</code> and checked against the server root â€” path-traversal attempts return 403.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Operation</th><th style={{ padding: '6px' }}>Notes</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Browse / Download file</td><td style={{ padding: '6px' }}>Requires <code>server.files.read</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Download folder</td><td style={{ padding: '6px' }}>Server zips on-the-fly, responds with a signed one-time token URL. Token expires after 5 min.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Upload file</td><td style={{ padding: '6px' }}>Requires <code>server.files.write</code>. Max 100 MB per file via multipart.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Edit file (inline)</td><td style={{ padding: '6px' }}>Read + write. Files &gt; 5 MB cannot be opened in the editor â€” download instead.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Delete</td><td style={{ padding: '6px' }}>Requires <code>server.files.delete</code>.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>New file / folder</td><td style={{ padding: '6px' }}>Requires <code>server.files.write</code>.</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Import from ZIP</h3>
            <p>Accepts an existing server export as a .zip archive. There is no size cap â€” the multipart parser streams directly to disk.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Field</th><th style={{ padding: '6px' }}>Notes</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Archive</td><td style={{ padding: '6px' }}>.zip only</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Executable Path</td><td style={{ padding: '6px' }}>Relative path of the JAR inside the archive, e.g. <code>server.jar</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Server Root Path</td><td style={{ padding: '6px' }}>Prefix to strip before extracting. Leave empty if JAR is at archive root.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Port / RAM / Software / Version</td><td style={{ padding: '6px' }}>Same constraints as normal server creation.</td></tr>
              </tbody>
            </table>
            <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>After extraction the panel verifies the JAR exists, copies it as <code>server.jar</code> if needed, ensures <code>eula.txt</code> is set, and patches the port into <code>server.properties</code>.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>Backups</h3>
            <p>Backups are stored as timestamped ZIPs inside <code>servers/&lt;name&gt;/backups/</code>.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Type</th><th style={{ padding: '6px' }}>Notes</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Manual</td><td style={{ padding: '6px' }}>Triggered from the Backups tab.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Auto-backup</td><td style={{ padding: '6px' }}>Enabled per-server with a configurable interval in hours. Runs on a timer.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Auto on switch</td><td style={{ padding: '6px' }}>A rollback backup is always created before a software switch, before any files are touched.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Restore</td><td style={{ padding: '6px' }}>Extracts the ZIP back into the server directory. Server must be offline.</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Switch Software / Version</h3>
            <p>Both operations live under the server <strong>Settings</strong> tab and require <code>server.properties.write</code>. The server must be offline.</p>
            <h4>Change Version</h4>
            <p style={{ fontSize: '0.85rem' }}>Downloads the new JAR for the same software type and replaces <code>server.jar</code>. For Forge, re-runs the installer.</p>
            <h4>Switch Software</h4>
            <p style={{ fontSize: '0.85rem' }}>Two-phase: first a dry-run returns compatibility warnings, then a confirmed request executes. Automatic rollback backup is created first. Incompatible folders are renamed to <code>.disabled</code> suffixes, not deleted.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>Plugins &amp; Mods</h3>
            <p>Lists <code>.jar</code> files from <code>plugins/</code> or <code>mods/</code> depending on the server software.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Action</th><th style={{ padding: '6px' }}>Mechanism</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Disable</td><td style={{ padding: '6px' }}>Renames <code>foo.jar</code> &rarr; <code>foo.jar.disabled</code>. Harmless, easily reversible.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Enable</td><td style={{ padding: '6px' }}>Renames <code>foo.jar.disabled</code> &rarr; <code>foo.jar</code>.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Delete</td><td style={{ padding: '6px' }}>Permanently removes the file.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Upload</td><td style={{ padding: '6px' }}>Drops the file directly into the correct folder.</td></tr>
              </tbody>
            </table>
            <blockquote style={{ borderLeft: '4px solid var(--accent)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Modrinth integration lets you search and install plugins/mods directly from the Plugins/Mods tab.
            </blockquote>
          </div>
          <div className="card">
            <h3>Player Management</h3>
            <p>Reads live player data from <code>world/playerdata/</code> NBT files, parsed entirely in-process (no RCON dependency).</p>
            <p>The modal renders the full inventory grid â€” hotbar, main inventory, armor slots, off-hand, and ender chest. Hover any slot for an item tooltip.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Action</th><th style={{ padding: '6px' }}>Permission</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>View + inventory</td><td style={{ padding: '6px' }}><code>server.players.read</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Kick</td><td style={{ padding: '6px' }}><code>server.players.kick</code> â€” issues <code>/kick &lt;name&gt;</code> via stdin</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Ban</td><td style={{ padding: '6px' }}><code>server.players.ban</code> â€” issues <code>/ban &lt;name&gt;</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>OP / DeOP</td><td style={{ padding: '6px' }}><code>server.players.op</code> â€” issues <code>/op</code> or <code>/deop</code></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
  'users-permissions': {
    title: 'Users & Permissions',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>Roles</h3>
            <p>There are two built-in roles, stored in the <code>users.role</code> column.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Role</th><th style={{ padding: '6px' }}>Access</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>admin</code></td><td style={{ padding: '6px' }}>Full access to everything. Implicit wildcard permission <code>*</code>. Cannot be restricted by individual permission entries.</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>user</code></td><td style={{ padding: '6px' }}>Access is entirely determined by the permission system â€” the role alone grants nothing.</td></tr>
              </tbody>
            </table>
            <blockquote style={{ borderLeft: '4px solid var(--accent)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Admins can disable accounts without deleting them. Disabled users are rejected at login regardless of credentials.
            </blockquote>
          </div>
          <div className="card">
            <h3>Permission Resolution</h3>
            <p>Permissions are resolved in the following order. A user has a permission if <em>any</em> source grants it â€” there is no deny mechanic.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Priority</th><th style={{ padding: '6px' }}>Source</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>1</td><td style={{ padding: '6px' }}>Role is <code>admin</code> &rarr; wildcard <code>*</code>, skip all other checks</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>2</td><td style={{ padding: '6px' }}>User's own <code>global_permissions</code> JSON column</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>3</td><td style={{ padding: '6px' }}>Global permissions from the assigned rank</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>4</td><td style={{ padding: '6px' }}>Per-server permissions from the assigned rank for the current server</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>5</td><td style={{ padding: '6px' }}>Individual per-server entries in <code>user_server_permissions</code> table</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>Invite Tokens</h3>
            <p>Registration is closed by default. An admin generates a token (Users &rarr; Generate Token), optionally pre-assigns a rank, and shares the 32-char hex string out-of-band.</p>
            <p>The token is single-use. Expired tokens are reaped from the database every hour.</p>
            <blockquote style={{ borderLeft: '4px solid var(--accent)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Tokens are stored hashed. The plaintext is shown exactly once after generation â€” if you close the modal it cannot be recovered.
            </blockquote>
          </div>
          <div className="card">
            <h3>Changing Passwords</h3>
            <p>Users can change their own password from the Users view. Admins can reset any user's password. Passwords are hashed with bcrypt (10 rounds).</p>
            <p>If the admin account password is lost and no other admin exists, reset it directly on the host using Node:</p>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: '0.8rem', overflowX: 'auto' }}>
{`node -e "
const bcrypt = require('bcryptjs');
const { dbRun } = require('./src/db/database');
const hash = bcrypt.hashSync('newpassword', 10);
dbRun('UPDATE users SET password=? WHERE username=?', [hash, 'admin']);
"`}
            </pre>
          </div>
        </div>
        <div className="card">
          <h3>Full Permission Reference</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px' }}>Key</th>
                <th style={{ padding: '8px' }}>Group</th>
                <th style={{ padding: '8px' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['server.start', 'Lifecycle', ''],
                ['server.stop', 'Lifecycle', ''],
                ['server.restart', 'Lifecycle', ''],
                ['server.kill', 'Lifecycle', 'Force-kill the OS process'],
                ['server.console.read', 'Console', 'Receive WebSocket console output'],
                ['server.console.write', 'Console', 'Send commands via WebSocket'],
                ['server.files.read', 'Files', 'List, read, download'],
                ['server.files.write', 'Files', 'Create, edit, upload'],
                ['server.files.delete', 'Files', ''],
                ['server.players.read', 'Players', 'View player list + inventory modal'],
                ['server.players.kick', 'Players', ''],
                ['server.players.ban', 'Players', ''],
                ['server.players.op', 'Players', 'OP / DeOP'],
                ['server.players.manage', 'Players', 'All player commands via console'],
                ['server.plugins.read', 'Plugins', 'List plugins/mods'],
                ['server.plugins.manage', 'Plugins', 'Enable, disable, delete, upload'],
                ['server.backups.read', 'Backups', 'List + download'],
                ['server.backups.create', 'Backups', 'Manual + auto-backup config'],
                ['server.backups.restore', 'Backups', ''],
                ['server.backups.delete', 'Backups', ''],
                ['server.properties.read', 'Settings', 'View server.properties'],
                ['server.properties.write', 'Settings', 'Edit properties, change version/software'],
                ['server.logs.read', 'Logs', 'View log files'],
                ['server.ftp.access', 'FTP', 'View FTP credentials'],
                ['server.ftp.manage', 'FTP', 'Configure and toggle FTP server'],
                ['account.manage', 'Global', 'Manage users, generate invite tokens'],
                ['panel.settings', 'Global', 'Edit panel-level settings'],
              ].map(([key, group, notes]) => (
                <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px' }}><code>{key}</code></td>
                  <td style={{ padding: '8px' }}>{group}</td>
                  <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  },
  'ranks': {
    title: 'Ranks',
    content: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3>What Ranks Are</h3>
          <p>Ranks are reusable permission bundles. Instead of configuring each user individually, you create a rank once and assign it. Rank edits propagate instantly to all holders.</p>
          <p>A rank carries two permission bags:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Bag</th><th style={{ padding: '6px' }}>Scope</th></tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Global permissions</td><td style={{ padding: '6px' }}>Apply regardless of which server is being accessed</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Per-server permissions</td><td style={{ padding: '6px' }}>Map of <code>serverId &rarr; permission[]</code> â€” each server can have a different set</td></tr>
            </tbody>
          </table>
          <blockquote style={{ borderLeft: '4px solid var(--accent)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            A user can hold exactly one rank at a time. Individual per-server permissions layer on top via the resolution chain described in Users &amp; Permissions.
          </blockquote>
        </div>
        <div className="card">
          <h3>Rank Editor</h3>
          <p>The rank editor renders a <strong>permission matrix</strong>: rows are permission keys, columns are servers. Check a cell to grant that permission on that server.</p>
          <p>Global permissions (<code>account.manage</code>, <code>panel.settings</code>) have their own column and are independent of any specific server.</p>
          <p>When a user has a permission via their rank, the corresponding checkbox in the user-level editor is rendered locked with a "Granted by Rank" status â€” you cannot override it in the user view without changing their rank or overriding the database.</p>
          <blockquote style={{ borderLeft: '4px solid var(--warning)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Ranks that are assigned to at least one user cannot be deleted without first unassigning them.
          </blockquote>
        </div>
      </div>
    )
  },
  'panel-settings': {
    title: 'Panel Settings',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>.env Reference</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px' }}>Variable</th>
                  <th style={{ padding: '6px' }}>Default</th>
                  <th style={{ padding: '6px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['PORT', '8082', 'HTTP/HTTPS listen port'],
                  ['SECRET_KEY', 'â€”', 'Required. Signs JWT tokens. Use a long random string.'],
                  ['JWT_EXPIRES_IN', '24h', 'JWT token lifetime'],
                  ['ALLOWED_ORIGINS', '*', 'Comma-separated CORS whitelist. Set to your actual domain(s) in production.'],
                  ['RATE_LIMIT', '100', 'API requests/min per IP. Import endpoint is exempt.'],
                  ['HTTPS', 'false', 'Enable TLS directly in Node. Use Nginx in production instead.'],
                  ['HTTPS_KEY', 'certs/key.pem', 'Path to TLS private key'],
                  ['HTTPS_CERT', 'certs/cert.pem', 'Path to TLS certificate'],
                ].map(([v, def, notes]) => (
                  <tr key={v} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px' }}><code>{v}</code></td>
                    <td style={{ padding: '6px' }}><code>{def}</code></td>
                    <td style={{ padding: '6px', color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: notes }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Runtime Settings (UI)</h3>
            <p>Global &rarr; Panel Settings writes to the <code>settings</code> table in SQLite â€” changes take effect immediately without a restart.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Key</th><th style={{ padding: '6px' }}>Notes</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Login cooldown</td><td style={{ padding: '6px' }}>Seconds a user must wait after exceeding max login attempts</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Max login attempts</td><td style={{ padding: '6px' }}>Threshold before the cooldown kicks in</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>API rate limit</td><td style={{ padding: '6px' }}>Overrides the .env value at runtime</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>FTP port</td><td style={{ padding: '6px' }}>Port for the global FTP service (not per-server FTP)</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>FTP enabled</td><td style={{ padding: '6px' }}>Toggle the FTP service on/off without restarting</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Default server RAM</td><td style={{ padding: '6px' }}>Pre-fills the RAM field on the Create Server form</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Default server port</td><td style={{ padding: '6px' }}>Pre-fills the port field</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Max RAM per server</td><td style={{ padding: '6px' }}>Upper bound enforced during server creation/edit</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>HTTPS Setup</h3>
            <h4>Self-signed (dev / LAN)</h4>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: '0.8rem', overflowX: 'auto' }}>
{`mkdir certs
openssl req -x509 -newkey rsa:4096 \\
  -keyout certs/key.pem -out certs/cert.pem \\
  -days 365 -nodes -subj "/CN=localhost"`}
            </pre>
            <p style={{ fontSize: '0.85rem' }}>Set <code>HTTPS=true</code> in .env. Browsers will warn about the self-signed cert.</p>
            <h4>Nginx reverse proxy (production)</h4>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: '0.8rem', overflowX: 'auto' }}>
{`server {
    listen 443 ssl;
    server_name panel.example.com;
    ssl_certificate     /etc/letsencrypt/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/.../privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 0;
    }
}`}
            </pre>
          </div>
          <div className="card">
            <h3>Running as a Service</h3>
            <h4>systemd (Linux)</h4>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: '0.8rem', overflowX: 'auto' }}>
{`[Unit]
Description=MinePanel
After=network.target

[Service]
Type=simple
User=minepanel
WorkingDirectory=/opt/minepanel
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target`}
            </pre>
            <h4>PM2</h4>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: '0.8rem', overflowX: 'auto' }}>
{`npm install -g pm2
pm2 start src/index.js --name minepanel
pm2 save && pm2 startup`}
            </pre>
          </div>
        </div>
      </div>
    )
  },
  'advanced-features': {
    title: 'Advanced Features',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>WebSocket Protocol</h3>
            <p>One WebSocket connection per server tab at <code>wss://&lt;host&gt;/ws?serverId=&lt;id&gt;</code>. Authentication is handled in the first message frame â€” the connection is closed with a 4-series code if auth fails or times out after 5 s.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Type</th><th style={{ padding: '6px' }}>Direction</th><th style={{ padding: '6px' }}>Payload</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>auth</code></td><td style={{ padding: '6px' }}>client &rarr; server</td><td style={{ padding: '6px' }}><code>{"{token:jwt}"}</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>command</code></td><td style={{ padding: '6px' }}>client &rarr; server</td><td style={{ padding: '6px' }}><code>{"{data:cmd}"}</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>history</code></td><td style={{ padding: '6px' }}>server &rarr; client</td><td style={{ padding: '6px' }}>Array of buffered console lines on connect</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>console</code></td><td style={{ padding: '6px' }}>server &rarr; client</td><td style={{ padding: '6px' }}>Raw stdout/stderr chunk</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>status</code></td><td style={{ padding: '6px' }}>server &rarr; client</td><td style={{ padding: '6px' }}><code>"online" | "offline" | "starting"</code></td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>stats</code></td><td style={{ padding: '6px' }}>server &rarr; client</td><td style={{ padding: '6px' }}><code>{"{cpu, ram}"}</code> â€” sent every 2 s</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>clear_console</code></td><td style={{ padding: '6px' }}>server &rarr; client</td><td style={{ padding: '6px' }}>Instructs client to flush console</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Process Manager</h3>
            <p><code>src/core/processManager.js</code> is a singleton EventEmitter that owns every spawned Java process. It tracks PIDs, buffers console lines, and emits events consumed by WebSockets.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Method</th><th style={{ padding: '6px' }}>Notes</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>start(id, dir, ...)</code></td><td style={{ padding: '6px' }}>Spawns the process, attaches stdout/stderr listeners</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>gracefulStop(id, timeout)</code></td><td style={{ padding: '6px' }}>Writes <code>/stop\n</code>, resolves when process exits or timeout elapses</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>kill(id)</code></td><td style={{ padding: '6px' }}>SIGKILL the tracked PID</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>acquireLock(id)</code></td><td style={{ padding: '6px' }}>Returns false if already locked â€” caller should respond 409</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>getHistory(id)</code></td><td style={{ padding: '6px' }}>Returns the in-memory console buffer (shown to new WS clients)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3>Per-Server SFTP</h3>
            <p>Each server runs its own <strong>SFTP daemon</strong> (SSH File Transfer Protocol, not plain FTP) built on the <strong>ssh2</strong> library. Each daemon binds to a dedicated port and restricts access to the server's working directory.</p>
            <h4>Key Details</h4>
            <ul>
              <li>Protocol: SFTP over SSH2 (not FTP/FTPS)</li>
              <li>Auth method: Username + password (bcrypt-verified)</li>
              <li>Root directory: Server working directory â€” <code>servers/&lt;name&gt;/</code></li>
              <li>Host key: RSA 2048-bit PKCS1 PEM, persisted to <code>data/sftp_host_key</code></li>
            </ul>
            <h4>Connecting with an SFTP client</h4>
            <p style={{ fontSize: '0.85rem' }}>Use any SFTP-capable client. In <strong>FileZilla</strong>: Site Manager &rarr; Protocol: <em>SFTP â€“ SSH File Transfer Protocol</em> &rarr; Host: panel IP &rarr; Port: configured SFTP port &rarr; Logon type: Normal &rarr; enter username &amp; password.</p>
          </div>
          <div className="card">
            <h3>Database Schema</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Table</th><th style={{ padding: '6px' }}>Purpose</th></tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>users</code></td><td style={{ padding: '6px' }}>id, username, password (bcrypt), role, disabled, rank_id, global_permissions (JSON)</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>servers</code></td><td style={{ padding: '6px' }}>id, uuid, name, software, version, ram_mb, port, owner_id, directory_name, java_path, ftp_* columns</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>user_server_permissions</code></td><td style={{ padding: '6px' }}>user_id &times; server_id &times; permission â€” individual grants</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>ranks</code></td><td style={{ padding: '6px' }}>id, name, color, permissions (JSON map serverId&rarr;perm[]), global_permissions (JSON)</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>account_creation_tokens</code></td><td style={{ padding: '6px' }}>token (hashed), rank_id, expires_at</td></tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>settings</code></td><td style={{ padding: '6px' }}>key/value store for panel-level config and per-user accent colors</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
  'discord-bot': {
    title: 'Discord Bot',
    content: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3>Overview &amp; Features</h3>
          <p>MinePanel features a multi-bot Discord integration that provides real-time server console streaming, live server status updates, and command execution directly from Discord channels.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Feature</th><th style={{ padding: '6px' }}>Description</th></tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Multi-Bot System</td><td style={{ padding: '6px' }}>Register multiple bots in the panel, each managing specific game servers.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Dedicated Categories</td><td style={{ padding: '6px' }}>Each server gets a dedicated category with <code>#console</code>, <code>#commands</code>, and <code>#status</code> channels.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Customizable Names</td><td style={{ padding: '6px' }}>Rename or move categories/channels on Discord; the bot tracks them by their ID.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Silent Logging</td><td style={{ padding: '6px' }}>All bot messages (console, status, embeds) suppress push notifications and unread badges.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Console Auto-Clear</td><td style={{ padding: '6px' }}>Automatically deletes messages in the console channel when the server starts, stops, or restarts.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Instant Commands</td><td style={{ padding: '6px' }}>Executing commands forwards input instantly and deletes the user message immediately.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Self-Healing</td><td style={{ padding: '6px' }}>Missing or deleted channels are auto-detected and recreated in the background.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}>Offline Cleanup</td><td style={{ padding: '6px' }}>When a bot or server is unassigned or deleted, the panel cleans up channels/roles on Discord and leaves the guild.</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Slash Commands</h3>
          <p>Authorized users can run the following slash commands within the dedicated Discord channels:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><th style={{ padding: '6px' }}>Command</th><th style={{ padding: '6px' }}>Description</th></tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/status</code></td><td style={{ padding: '6px' }}>Sends a status panel with Start, Stop, Restart, and Refresh buttons.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/console [live]</code></td><td style={{ padding: '6px' }}>Streams a live console interface inside any channel.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/stats [live]</code></td><td style={{ padding: '6px' }}>Streams live CPU and RAM resource usage graphs.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/players</code></td><td style={{ padding: '6px' }}>Lists online players.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/logs</code></td><td style={{ padding: '6px' }}>Browses, filters, and paginates server log files.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/execute &lt;cmd&gt;</code></td><td style={{ padding: '6px' }}>Runs a console command directly on the server.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/start | /stop | /restart</code></td><td style={{ padding: '6px' }}>Controls the server state.</td></tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '6px' }}><code>/init [server]</code></td><td style={{ padding: '6px' }}>Manually initializes or recreates the channels and roles for a server.</td></tr>
            </tbody>
          </table>
          <blockquote style={{ borderLeft: '4px solid var(--accent)', margin: '1rem 0 0', paddingLeft: '1rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Most commands (except <code>/init</code>) will only execute inside the server's dedicated channels to keep other guild channels clean.
          </blockquote>
        </div>
      </div>
    )
  }
};

export default function Docs() {
  const [activeTab, setActiveTab] = useState('getting-started');

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Docs</h2>
        <p className="text-muted" style={{ margin: 0 }}>Comprehensive documentation for MinePanel features</p>
      </div>

      <div className="sub-nav" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {Object.keys(DOCS_DATA).map(key => (
          <button
            key={key}
            className={`sub-nav-item${activeTab === key ? ' active' : ''}`}
            onClick={() => setActiveTab(key)}
            style={{ textTransform: 'capitalize' }}
          >
            {DOCS_DATA[key].title}
          </button>
        ))}
      </div>

      <div id="docs-content">
        {DOCS_DATA[activeTab].content}
      </div>
    </div>
  );
}
