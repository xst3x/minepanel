import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import '../../styles/pages/server/Console.css';
import {
  parseMinecraftLogLine,
  parseChatLine,
  mcToHtml,
} from '../../lib/minecraftLog.ts';
import type { ChatEntry } from '../../lib/minecraftLog.ts';

type Tab = 'console' | 'chat';

export default function ServerConsole() {
  const {
    serverId,
    status,
    consoleLines,
    sendConsoleCommand,
    sendChatMessage,
    clearConsoleLines,
    hasPerm,
  } = useOutletContext();

  const canWrite = hasPerm ? hasPerm('server.console.write') : true;
  const canChatView = hasPerm ? hasPerm('server.console.chat.view') : false;
  const canChatSend = hasPerm ? hasPerm('server.console.chat.send') : false;
  const serverOnline = status === 'online';

  const [tab, setTab] = useState<Tab>('console');
  const [cmd, setCmd] = useState('');
  const [chatMsg, setChatMsg] = useState('');
  const [chatError, setChatError] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const outputRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const consoleStick = useRef(true);
  const chatStick = useRef(true);
  const chatErrorTimer = useRef<number | null>(null);

  // ── Derived data ──────────────────────────────────────────────────────
  const parsed = useMemo(() => consoleLines.map(parseMinecraftLogLine), [consoleLines]);

  const chatEntries = useMemo(() => {
    const out: ChatEntry[] = [];
    for (const line of consoleLines) {
      const entry = parseChatLine(line);
      if (entry) out.push(entry);
    }
    return out;
  }, [consoleLines]);

  // ── Chat send errors surfaced by the backend ─────────────────────────
  useEffect(() => {
    const onErr = (e: Event) => {
      setChatError((e as CustomEvent).detail || 'Could not send message.');
      if (chatErrorTimer.current) clearTimeout(chatErrorTimer.current);
      chatErrorTimer.current = window.setTimeout(() => setChatError(''), 5000);
    };
    window.addEventListener(`mp:chat-error:${serverId}`, onErr);
    return () => {
      window.removeEventListener(`mp:chat-error:${serverId}`, onErr);
      if (chatErrorTimer.current) clearTimeout(chatErrorTimer.current);
    };
  }, [serverId]);

  // ── Smart scrolling ───────────────────────────────────────────────────
  const handleConsoleScroll = useCallback(() => {
    const el = outputRef.current;
    if (el) consoleStick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const handleChatScroll = useCallback(() => {
    const el = chatRef.current;
    if (el) chatStick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // On mount / tab switch → jump straight to the newest content.
  useEffect(() => {
    const stick = tab === 'console' ? consoleStick : chatStick;
    stick.current = true;
    const el = tab === 'console' ? outputRef.current : chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (tab === 'chat' && canChatSend) chatInputRef.current?.focus();
    if (tab === 'console' && canWrite) inputRef.current?.focus();
  }, [tab, canChatSend, canWrite]);

  // Follow new content only while pinned to the bottom.
  useEffect(() => {
    if (tab === 'console' && consoleStick.current && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [consoleLines, tab]);

  useEffect(() => {
    if (tab === 'chat' && chatStick.current && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatEntries.length, tab]);

  // ── Console command handling ──────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    sendConsoleCommand(trimmed);
    setCmdHistory(prev => [trimmed, ...prev.slice(0, 99)]);
    setHistoryIdx(-1);
    setCmd('');
  }, [cmd, sendConsoleCommand]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(newIdx);
      if (cmdHistory[newIdx] !== undefined) setCmd(cmdHistory[newIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setCmd(newIdx < 0 ? '' : cmdHistory[newIdx] || '');
    }
  };

  const handleChatSend = useCallback(() => {
    const trimmed = chatMsg.trim();
    if (!trimmed || !canChatSend || !serverOnline) return;
    sendChatMessage(trimmed);
    setChatMsg('');
    chatInputRef.current?.focus();
  }, [chatMsg, canChatSend, serverOnline, sendChatMessage]);

  const countLabel = tab === 'console'
    ? `${consoleLines.length} lines`
    : `${chatEntries.length} messages`;

  return (
    <div className="console-container">
      <div className="console-toolbar">
        <div className="console-tabs">
          <button
            className={`ct-tab${tab === 'console' ? ' active' : ''}`}
            onClick={() => setTab('console')}
          >
            Console
          </button>
          {canChatView && (
            <button
              className={`ct-tab${tab === 'chat' ? ' active' : ''}`}
              onClick={() => setTab('chat')}
            >
              Chat
            </button>
          )}
        </div>
        <div className="console-toolbar-right">
          <span className="console-count">{countLabel}</span>
          {tab === 'console' && (
            <button className="btn outline small" onClick={clearConsoleLines}>Clear</button>
          )}
        </div>
      </div>

      {tab === 'console' ? (
        <div
          ref={outputRef}
          id="terminal-output"
          className="console-output"
          role="log"
          aria-label="Server console output"
          onScroll={handleConsoleScroll}
        >
          {parsed.map((line, i) => (
            <div
              key={i}
              className={`cl-line cl-${line.level}`}
              dangerouslySetInnerHTML={{ __html: line.html }}
            />
          ))}
        </div>
      ) : (
        <div ref={chatRef} className="chat-output" onScroll={handleChatScroll}>
          {chatEntries.length === 0 ? (
            <div className="chat-empty">
              No chat messages yet — chat activity will appear here.
            </div>
          ) : (
            chatEntries.map((entry, i) => (
              <div key={i} className={`chat-row chat-${entry.kind}`}>
                {entry.kind === 'message' || entry.kind === 'server' ? (
                  <>
                    <span className="chat-player">{entry.player}</span>
                    <span className="chat-colon">{entry.kind === 'server' ? ' » ' : ': '}</span>
                    <span
                      className="chat-text"
                      dangerouslySetInnerHTML={{ __html: mcToHtml(entry.message || '') }}
                    />
                  </>
                ) : entry.kind === 'death' ? (
                  <span className="chat-death">{entry.message}</span>
                ) : (
                  <span className="chat-event">
                    {entry.player} {entry.kind === 'join' ? 'joined the game' : 'left the game'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'chat' && chatError && <div className="chat-error">{chatError}</div>}

      {tab === 'console' ? (
        canWrite ? (
          <div className="console-input-bar">
            <span className="console-prompt">{'>'}</span>
            <input
              ref={inputRef}
              id="terminal-input"
              type="text"
              aria-label="Server console command"
              placeholder="Type a command and press Enter..."
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); else handleKeyDown(e); }}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn primary small" onClick={handleSend}>Send</button>
          </div>
        ) : (
          <div className="console-readonly">
            Read-only access — you don't have permission to send commands.
          </div>
        )
      ) : (
        <div className="chat-input-bar">
          <span className="console-prompt">{'>'}</span>
          <input
            ref={chatInputRef}
            id="chat-input"
            type="text"
            aria-label="Chat message"
            placeholder={
              !serverOnline
                ? 'Server is offline.'
                : canChatSend
                  ? 'Type a message and press Enter...'
                  : 'Read-only — you cannot send chat messages.'
            }
            value={chatMsg}
            disabled={!canChatSend || !serverOnline}
            onChange={e => setChatMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleChatSend(); }}
            autoComplete="off"
            spellCheck={false}
            maxLength={256}
          />
          <button
            className="btn primary small"
            onClick={handleChatSend}
            disabled={!canChatSend || !serverOnline}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
