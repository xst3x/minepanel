import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function ServerFtp() {
  const { serverId, hasPerm } = useOutletContext();
  
  const [ftpInfo, setFtpInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Credentials configured in the save form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [port, setPort] = useState(2121);
  
  // Show / hide state
  const [revealPass, setRevealPass] = useState(false);
  const [showConfigPass, setShowConfigPass] = useState(false);
  const [plainPassword, setPlainPassword] = useState('');

  useEffect(() => {
    loadFtpInfo();
  }, [serverId]);

  const loadFtpInfo = async () => {
    setLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/ftp`);
      setFtpInfo(data);
      if (data) {
        setUsername(data.username || '');
        setPort(data.port || 2121);
      }
    } catch (err) {
      console.error('Failed to load FTP info:', err.message);
      setFtpInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFtp = async () => {
    setActionLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/ftp/toggle`, { method: 'POST' });
      setFtpInfo(prev => ({
        ...prev,
        enabled: data.enabled,
        running: data.running
      }));
      alert(data.enabled ? 'FTP daemon enabled.' : 'FTP daemon disabled.');
    } catch (err) {
      alert('Failed to toggle FTP: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!username || !port) {
      alert('Username and port are required.');
      return;
    }
    setActionLoading(true);
    try {
      await api(`/api/servers/${serverId}/ftp/config`, {
        method: 'POST',
        body: { username, password, port }
      });
      alert('FTP configuration saved.');
      setPassword(''); // clear input password field
      setPlainPassword(''); // clear cached password reveal
      setRevealPass(false);
      loadFtpInfo();
    } catch (err) {
      alert('Failed to save FTP config: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevealPassword = async () => {
    if (revealPass) {
      setRevealPass(false);
      return;
    }

    if (plainPassword) {
      setRevealPass(true);
      return;
    }

    try {
      setActionLoading(true);
      const data = await api(`/api/servers/${serverId}/ftp/password`);
      setPlainPassword(data.password || '(not available â€” enter password again to reveal)');
      setRevealPass(true);
    } catch (err) {
      setPlainPassword('(not available)');
      setRevealPass(true);
    } finally {
      setActionLoading(false);
    }
  };

  const currentHost = window.location.hostname;
  const displayHost = (currentHost === 'localhost' || currentHost === '127.0.0.1') ? '127.0.0.1' : currentHost;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
      
      {/* Connection Info Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Connection Info</h3>
          {ftpInfo && (
            <span className={`status-badge ${ftpInfo.running ? 'online' : 'offline'}`}>
              {ftpInfo.running ? 'ONLINE' : 'OFFLINE'}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-muted">Loading FTP details...</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Host</span>
                <code className="text-mono" style={{ color: 'var(--text)' }}>{displayHost}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Port</span>
                <code className="text-mono" style={{ color: 'var(--text)' }}>{ftpInfo?.port || 'â€”'}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Username</span>
                <code className="text-mono" style={{ color: 'var(--text)' }}>{ftpInfo?.username || 'â€”'}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Password</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <code className="text-mono" style={{ color: 'var(--text)' }}>
                    {revealPass ? plainPassword : 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢'}
                  </code>
                  {hasPerm('server.ftp.manage') && (
                    <button
                      className="btn outline small"
                      style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                      onClick={handleRevealPassword}
                      disabled={actionLoading}
                    >
                      {revealPass ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {hasPerm('server.ftp.manage') && (
              <button
                className="btn outline full-width"
                onClick={handleToggleFtp}
                disabled={actionLoading}
              >
                {ftpInfo?.enabled ? 'Disable FTP' : 'Enable FTP'}
              </button>
            )}
            <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.75rem' }}>
              FTP is sandboxed to this server's directory only.
            </p>
          </>
        )}
      </div>

      {/* Configure FTP Card */}
      {hasPerm('server.ftp.manage') && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Configure FTP</h3>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ftpuser"
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label>Password <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank to keep current)</span></label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type={showConfigPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn outline small"
                onClick={() => setShowConfigPass(!showConfigPass)}
              >
                {showConfigPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>FTP Port <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(per-server, not global)</span></label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="e.g. 2121"
              min="1024"
              max="65535"
              style={{ width: '100%' }}
            />
          </div>
          <button
            className="btn primary full-width"
            onClick={handleSaveConfig}
            disabled={actionLoading}
          >
            Save &amp; Apply
          </button>
        </div>
      )}

      {/* Help Card */}
      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>How to connect</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          This panel uses <strong>SFTP</strong> (SSH File Transfer Protocol) â€” not plain FTP. Use FileZilla, WinSCP, or any SFTP-capable client.
        </p>
        <ol style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', lineHeight: 1.9, margin: '0 0 0.75rem' }}>
          <li>Set credentials &amp; port, click <strong>Save &amp; Apply</strong></li>
          <li>Click <strong>Enable FTP</strong> to start the SFTP daemon</li>
          <li><strong>FileZilla:</strong> Site Manager &rarr; Protocol: <em>SFTP â€“ SSH File Transfer Protocol</em></li>
          <li><strong>WinSCP:</strong> New Session &rarr; File Protocol: <em>SFTP</em></li>
          <li>Enter Host / Port / Username / Password from the Connection Info card</li>
        </ol>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Each server has its own independent SFTP port. Access is sandboxed to that server's directory.
        </p>
      </div>

    </div>
  );
}
