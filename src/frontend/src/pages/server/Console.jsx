import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';

// Strip ANSI escape codes
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Colorize Minecraft server log lines — culori adaptate la temă
function colorizeLogLine(line, isLight) {
  const clean = stripAnsi(line);
  let color = isLight ? '#1a1a1a' : '#e6e6e6';
  if (/\[WARN\]/i.test(clean))            color = isLight ? '#b45309' : '#f59e0b';
  else if (/\[ERROR\]|\[SEVERE\]/i.test(clean)) color = isLight ? '#b91c1c' : '#f87171';
  else if (/Done \(/.test(clean))          color = isLight ? '#15803d' : '#4ade80';
  else if (/^>/.test(clean))               color = isLight ? '#0f6c3a' : '#34d399';
  else if (/\[INFO\]/i.test(clean))        color = isLight ? '#555555' : '#a1a1aa';

  const escaped = clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<span style="color:${color}">${escaped}</span>`;
}

export default function ServerConsole() {
  const { consoleLines, sendConsoleCommand, clearConsoleLines } = useOutletContext();
  const [cmd, setCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [isLight, setIsLight] = useState(
    document.documentElement.getAttribute('data-theme') === 'light'
  );
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // Detectează schimbarea temei
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.getAttribute('data-theme') === 'light');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const handleSend = useCallback((e) => {
    e?.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed) return;
    sendConsoleCommand(trimmed);
    setCmdHistory(prev => [trimmed, ...prev.slice(0, 99)]);
    setHistoryIdx(-1);
    setCmd('');
  }, [cmd, sendConsoleCommand]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCmdHistory(hist => {
        const newIdx = Math.min(historyIdx + 1, hist.length - 1);
        setHistoryIdx(newIdx);
        if (hist[newIdx] !== undefined) setCmd(hist[newIdx]);
        return hist;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setCmd(newIdx < 0 ? '' : cmdHistory[newIdx] || '');
    }
  };

  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 80;
      if (isAtBottom) el.scrollTop = el.scrollHeight;
    }
  }, [consoleLines]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Culori bazate pe temă
  const bg       = isLight ? '#ffffff' : '#0d0d0d';
  const bgBar    = isLight ? '#f3f4f6' : '#111111';
  const border   = isLight ? '#d1d5db' : '#2a2a2a';
  const textColor = isLight ? '#1a1a1a' : '#e6e6e6';
  const mutedColor = isLight ? '#6b7280' : '#666666';

  const html = consoleLines.map(l => colorizeLogLine(l, isLight)).join('\n');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '72vh',
      background: bg, border: `1px solid ${border}`,
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 14px', borderBottom: `1px solid ${border}`,
        background: bgBar, flexShrink: 0
      }}>
        <span style={{ fontSize: 11, color: mutedColor, fontFamily: 'var(--font-mono)' }}>
          {consoleLines.length} lines
        </span>
        <button className="btn outline small" onClick={clearConsoleLines}>Clear</button>
      </div>

      <div
        ref={outputRef}
        id="terminal-output"
        style={{
          flex: 1, overflowY: 'auto',
          fontFamily: 'var(--font-mono)', fontSize: 13,
          lineHeight: 1.55, padding: '12px 16px',
          background: bg, color: textColor,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderTop: `1px solid ${border}`,
        background: bgBar, flexShrink: 0
      }}>
        <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>{'>'}</span>
        <input
          ref={inputRef}
          id="terminal-input"
          type="text"
          placeholder="Type a command and press Enter..."
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            outline: 'none', color: textColor,
            fontFamily: 'var(--font-mono)', fontSize: 13
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn primary small" onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
