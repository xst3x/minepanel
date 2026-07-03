import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm, showPrompt } from '../../components/Toast.jsx';
import CodeEditor from '../../components/CodeEditor.jsx';
import '../../styles/pages/server/Automation.css';

export default function Automation() {
  const { serverId, hasPerm } = useOutletContext();
  const canWrite = hasPerm('server.automation.write');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState('dashboard'); // 'dashboard' or 'editor'

  const [rules, setRules] = useState([]);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [activeRule, setActiveRule] = useState(null); // rule being edited
  const [scriptContent, setScriptContent] = useState('');
  const [validationResult, setValidationResult] = useState(null); // { valid, errors }
  const [terminalLogs, setTerminalLogs] = useState([]);

  const terminalEndRef = useRef(null);

  // Fetch automations and server state
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/automation`);
      setRules(data.rules || []);
      setServerEnabled(!!data.automationEnabled);
    } catch (e) {
      toast(e.message || 'Failed to load automations.', 'error');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Connect to the WebSocket custom events forwarded from ServerLayout.jsx
  useEffect(() => {
    const handleLog = (e) => {
      setTerminalLogs(prev => {
        const next = [...prev, e.detail];
        return next.slice(-1000); // Keep last 1000 log lines
      });
    };
    window.addEventListener(`mp:automation-log:${serverId}`, handleLog);
    return () => {
      window.removeEventListener(`mp:automation-log:${serverId}`, handleLog);
    };
  }, [serverId]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Toggle server-wide automation status
  const handleServerToggle = async () => {
    if (!canWrite) return;
    try {
      const res = await api(`/api/servers/${serverId}/automation/server-toggle`, { method: 'PATCH' });
      setServerEnabled(res.automationEnabled);
      toast(`Server automation set to ${res.automationEnabled ? 'ACTIVE' : 'OFF'}.`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to toggle server automation.', 'error');
    }
  };

  // Toggle individual rule status
  const handleRuleToggle = async (ruleId) => {
    if (!canWrite) return;
    try {
      const res = await api(`/api/servers/${serverId}/automation/${ruleId}/toggle`, { method: 'PATCH' });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: res.enabled } : r));
      toast('Automation rule updated.', 'success');
    } catch (e) {
      toast(e.message || 'Failed to toggle rule.', 'error');
    }
  };

  // Create new rule
  const handleCreateRule = async () => {
    if (!canWrite) return;
    const name = await showPrompt('Enter a name for the new Python automation:', '', 'Create Script');
    if (!name || !name.trim()) return;

    try {
      const res = await api(`/api/servers/${serverId}/automation`, {
        method: 'POST',
        body: { name: name.trim() }
      });
      setRules(prev => [...prev, res.rule]);
      toast('Automation rule created.', 'success');
      handleOpenEditor(res.rule);
    } catch (e) {
      toast(e.message || 'Failed to create automation.', 'error');
    }
  };

  // Delete rule
  const handleDeleteRule = async (ruleId, e) => {
    e.stopPropagation();
    if (!canWrite) return;
    const confirmed = await showConfirm('Are you sure you want to delete this automation?', 'Delete Automation');
    if (!confirmed) return;

    try {
      await api(`/api/servers/${serverId}/automation/${ruleId}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== ruleId));
      toast('Automation deleted.', 'success');
    } catch (e) {
      toast(e.message || 'Failed to delete automation.', 'error');
    }
  };

  // Open script editor
  const handleOpenEditor = (rule) => {
    setActiveRule(rule);
    setScriptContent(rule.script);
    setValidationResult(null);
    setView('editor');
  };

  // Verify python script
  const handleVerifyCode = async () => {
    setVerifying(true);
    setValidationResult(null);
    try {
      const res = await api(`/api/servers/${serverId}/automation/verify`, {
        method: 'POST',
        body: { code: scriptContent }
      });
      setValidationResult(res);
      if (res.valid) {
        toast('Code is valid! No errors found.', 'success');
      } else {
        toast('Verification failed with errors.', 'error');
      }
    } catch (e) {
      toast(e.message || 'Failed to verify code.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  // Run python script in test sandbox
  const handleRunScript = async () => {
    setRunning(true);
    setTerminalLogs(prev => [...prev, `\n>>> Starting test run for ${activeRule?.name || 'script'}.py...`]);
    try {
      await api(`/api/servers/${serverId}/automation/run-test`, {
        method: 'POST',
        body: { code: scriptContent, name: activeRule?.name || 'TestScript' }
      });
    } catch (e) {
      toast(e.message || 'Failed to start test run.', 'error');
      setTerminalLogs(prev => [...prev, `>>> Error starting test run: ${e.message}`]);
    } finally {
      setRunning(false);
    }
  };

  // Save script content
  const handleSave = async () => {
    if (!canWrite || !activeRule) return;
    setSaving(true);
    try {
      const res = await api(`/api/servers/${serverId}/automation/${activeRule.id}`, {
        method: 'PUT',
        body: {
          name: activeRule.name,
          script: scriptContent,
          enabled: activeRule.enabled
        }
      });
      setRules(prev => prev.map(r => r.id === activeRule.id ? res.rule : r));
      toast('Automation script saved.', 'success');
      setView('dashboard');
    } catch (e) {
      toast(e.message || 'Failed to save automation.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="tab-content">
        <div className="vb-loading" style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
          Loading automation environment…
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Toggle Server-wide state & description */}
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text)' }}>Minecraft Automation IDE</h3>
            <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
              Write custom Python scripts triggered by vanilla console log events. Runs in a fully restricted sandbox.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: serverEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
              {serverEnabled ? 'ACTIVE (Events Dispatched)' : 'OFF (Paused)'}
            </span>
            <label className="toggle-switch" style={{ pointerEvents: canWrite ? 'auto' : 'none' }}>
              <input
                type="checkbox"
                checked={serverEnabled}
                onChange={handleServerToggle}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* List of rules */}
        <div className="card" style={{ padding: 0, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div className="list-header" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
            <div>Script Name</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          <div className="list-body">
            {rules.length === 0 ? (
              <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No automation scripts created yet. Click "Create Script" to start writing Python automations.
              </div>
            ) : (
              rules.map(r => (
                <div
                  key={r.id}
                  className="list-item"
                  onClick={() => handleOpenEditor(r)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <div style={{ fontWeight: '500', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="var(--accent)" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    {r.name}.py
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <label className="toggle-switch" style={{ pointerEvents: canWrite ? 'auto' : 'none' }}>
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => handleRuleToggle(r.id)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    <button className="btn outline small" onClick={() => handleOpenEditor(r)}>Edit</button>
                    {canWrite && (
                      <button className="btn danger small" onClick={(e) => handleDeleteRule(r.id, e)}>Delete</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {canWrite && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={handleCreateRule}>
              + Create Script
            </button>
          </div>
        )}
      </div>
    );
  }

  // Editor View
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '80vh' }}>
      {/* Editor Toolbar */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn outline small" onClick={() => setView('dashboard')}>
            ← Dashboard
          </button>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            Editing: {activeRule?.name}.py
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn outline small" onClick={handleVerifyCode} disabled={verifying}>
            {verifying ? 'Verifying...' : 'Verify Code'}
          </button>
          <button className="btn outline small" onClick={handleRunScript} disabled={running}>
            {running ? 'Running...' : 'Run Script'}
          </button>
          {canWrite && (
            <button className="btn primary small" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Exit'}
            </button>
          )}
        </div>
      </div>

      {/* Editor and Terminal Split */}
      <div style={{ display: 'grid', gridTemplateRows: '3fr 2fr', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Code Editor Container */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#282c34', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          {/* Validation Errors Overlay */}
          {validationResult && (
            <div style={{
              background: validationResult.valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderBottom: `1px solid ${validationResult.valid ? 'var(--success)' : 'var(--danger)'}`,
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              color: validationResult.valid ? 'var(--success)' : '#f87171',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem'
            }}>
              <span style={{ fontWeight: 700 }}>
                {validationResult.valid ? '✓ Code Verification Passed!' : '✗ Code Verification Failed:'}
              </span>
              {!validationResult.valid && validationResult.errors && (
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {validationResult.errors.map((err, idx) => (
                    <li key={idx} style={{ fontFamily: 'var(--font-mono)' }}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          
          <div style={{ flex: 1, overflow: 'auto' }}>
            <CodeEditor
              filename={`${activeRule?.name}.py`}
              value={scriptContent}
              onChange={setScriptContent}
              height="100%"
            />
          </div>
        </div>

        {/* Live Output Terminal */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#0d0d0d',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid #2a2a2a',
          overflow: 'hidden'
        }}>
          {/* Terminal Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 14px',
            borderBottom: '1px solid #2a2a2a',
            background: '#111111',
            flexShrink: 0
          }}>
            <span style={{ fontSize: 11, color: '#666666', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              Python Output Terminal (Real-time logs)
            </span>
            <button className="btn outline small" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setTerminalLogs([])}>
              Clear
            </button>
          </div>

          {/* Terminal Logs Output */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.55,
            padding: '12px 16px',
            color: '#e6e6e6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {terminalLogs.length === 0 ? (
              <span style={{ color: '#555555', fontStyle: 'italic' }}>Terminal idle. Run tasks or trigger server events to stream output logs here...</span>
            ) : (
              terminalLogs.map((logLine, idx) => {
                let color = '#e6e6e6';
                if (logLine.includes('ERROR') || logLine.includes('Exception') || logLine.includes('Traceback')) {
                  color = '#f87171'; // Red for errors
                } else if (logLine.includes('[Automation Log]') || logLine.includes('[Automation]')) {
                  color = '#60a5fa'; // Light blue for system logs
                }
                return (
                  <div key={idx} style={{ color }}>
                    {logLine}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
