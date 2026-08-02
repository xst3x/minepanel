// ─── Minecraft server log & chat parsers ───────────────────────────────
// Framework-agnostic helpers used by the Console and Chat tabs.
// Handles ANSI stripping, Minecraft/plugin color codes (§ and &),
// log-level classification and chat-line extraction.

export type LogLevel = 'info' | 'warn' | 'error' | 'done' | 'command' | 'chat' | 'join' | 'leave' | 'death' | 'sys';

export interface ParsedLogLine {
  level: LogLevel;
  /** Cleaned (ANSI-stripped) plain text of the line */
  text: string;
  /** Pre-escaped HTML with color spans — safe for dangerouslySetInnerHTML */
  html: string;
}

export type ChatKind = 'message' | 'server' | 'join' | 'leave' | 'death';

export interface ChatEntry {
  kind: ChatKind;
  player: string;
  message?: string;
}

// ─── ANSI escape codes ─────────────────────────────────────────────────
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Minecraft color codes (§x / &x) ───────────────────────────────────
const MC_CLASS: Record<string, string> = {
  '0': 'mc-black', '1': 'mc-dark-blue', '2': 'mc-dark-green', '3': 'mc-dark-aqua',
  '4': 'mc-dark-red', '5': 'mc-dark-purple', '6': 'mc-gold', '7': 'mc-gray',
  '8': 'mc-dark-gray', '9': 'mc-blue', 'a': 'mc-green', 'b': 'mc-aqua',
  'c': 'mc-red', 'd': 'mc-light-purple', 'e': 'mc-yellow', 'f': 'mc-white',
  'l': 'mc-bold', 'o': 'mc-italic', 'n': 'mc-underline', 'm': 'mc-strikethrough',
  'k': 'mc-obfuscated',
};

/** Converts text containing §/& color codes into escaped HTML spans. */
export function mcToHtml(text: string): string {
  const re = /(§|&)([0-9a-fk-or])/gi;
  const matches = Array.from(text.matchAll(re));
  if (matches.length === 0) return escapeHtml(text);

  let html = '';
  let last = 0;
  let open = 0;
  for (const m of matches) {
    html += escapeHtml(text.slice(last, m.index));
    const code = m[2].toLowerCase();
    if (code === 'r') {
      if (open > 0) { html += '</span>'; open--; }
    } else {
      html += `<span class="${MC_CLASS[code]}">`;
      open++;
    }
    last = (m.index as number) + m[0].length;
  }
  html += escapeHtml(text.slice(last));
  while (open > 0) { html += '</span>'; open--; }
  return html;
}

// ─── Chunk cleaning (fixes random empty lines) ─────────────────────────
/** Splits a raw WS console chunk into individual non-empty log lines. */
export function splitConsoleChunk(chunk: string): string[] {
  return chunk
    .replace(/\r/g, '')
    .split('\n')
    .filter(line => line.trim().length > 0);
}

// ─── Prefix stripping ──────────────────────────────────────────────────
/**
 * Removes only the leading "[HH:MM:SS LEVEL]:" timestamp prefix.
 * Everything after it — including "[Not Secure]" style markers — is
 * preserved for further parsing.
 */
export function stripLogPrefix(raw: string): string {
  return stripAnsi(raw)
    .replace(/^\[[^\]]+\](?::\s*|\s+)/, '')
    .trim();
}

/**
 * Removes leading "[...]" markers (timestamps, "[Not Secure]", plugin
 * tags, etc.) one at a time — but stops at a "[Server]" tag so that
 * console /say output keeps its server label.
 */
function stripMarkersKeepServer(raw: string): string {
  let body = stripAnsi(raw);
  for (let i = 0; i < 10; i++) {
    const m = body.match(/^\[([^\]]+)\]\s*/);
    if (!m) break;
    if (m[1].toLowerCase() === 'server') break;
    body = body.slice(m[0].length);
  }
  return body.trim();
}

// ─── Death / kill messages ─────────────────────────────────────────────
// In-game death messages such as "Steve was slain by Zombie" are broadcast
// to every player, so they belong in the Chat tab too.
const DEATH_PHRASES = [
  'was slain by .+',
  'was shot (?:by .+|off a high place by .+)',
  'was killed by .+',
  'was killed trying to hurt .+',
  'was blown up by .+',
  'was impaled by .+',
  'was fireballed by .+',
  'was poked to death by .+',
  'was skewered by .+',
  'was stung to death',
  'was frozen to death',
  'was struck by lightning',
  'was burnt to a crisp whilst fighting .+',
  'walked into fire whilst fighting .+',
  'was roasted in dragon breath',
  'was pricked to death',
  'was squashed by a falling (?:anvil|block)',
  'was doomed to fall',
  'drowned',
  'blew up',
  'hit the ground too hard',
  'fell from a high place',
  'fell off (?:a ladder|some (?:vines|weeping vines|twisting vines)|scaffolding)',
  'fell while climbing',
  'fell out of the world',
  'went off with a bang',
  'tried to swim in lava',
  'discovered the floor was lava',
  'suffocated in a wall',
  'starved to death',
  'withered away',
  'experienced kinetic energy',
  'died because of .+',
  'died from .+',
  'died',
].join('|');

const DEATH_RE = new RegExp(`^(.+?)\\s+(?:${DEATH_PHRASES})\\.?$`, 'i');

function extractDeath(body: string): { player: string; message: string } | null {
  const m = body.match(DEATH_RE);
  if (!m) return null;
  return { player: m[1], message: body };
}

// ─── Log line classification (Console tab) ─────────────────────────────
export function parseMinecraftLogLine(raw: string): ParsedLogLine {
  const clean = stripAnsi(raw);
  const unprefixed = stripLogPrefix(clean);
  const chatBody = stripMarkersKeepServer(unprefixed);

  let level: LogLevel = 'info';
  if (/\b(WARN|WARNING)\]/i.test(clean)) level = 'warn';
  else if (/\b(ERROR|SEVERE|FATAL)\]/i.test(clean) || /Exception|Caused by:/.test(clean)) level = 'error';
  else if (/^\s*at\s+[\w$.<>]+\(.+\)/.test(clean)) level = 'error';
  else if (/^Done \(/.test(chatBody)) level = 'done';
  else if (/^>/.test(clean) || /issued server command/i.test(clean)) level = 'command';
  else if (/^\[Server\]/.test(chatBody) || /^<[^>]+>/.test(chatBody)) level = 'chat';
  else if (/joined the game$/i.test(chatBody)) level = 'join';
  else if (/left the game$/i.test(chatBody)) level = 'leave';
  else if (/^\[(System|Panel)\]/.test(unprefixed)) level = 'sys';
  else if (extractDeath(chatBody)) level = 'death';

  return { level, text: clean, html: mcToHtml(clean) };
}

// ─── Chat extraction (Chat tab) ────────────────────────────────────────
/**
 * Extracts a chat entry from a raw console line, or null if the line is
 * not something a player would see in-game.
 *
 * Shown:
 *  - "<Player> message"                 → player chat
 *  - "[Server] message"                 → console /say / server chat
 *  - "Player joined/left the game"      → connect/disconnect events
 *  - "Player was slain by ..." etc.     → death / kill messages
 *
 * Everything else (system logs, errors, plugin output, console commands)
 * is hidden.
 */
export function parseChatLine(raw: string): ChatEntry | null {
  const body = stripMarkersKeepServer(stripLogPrefix(raw));

  const server = body.match(/^\[Server\]\s+(.+)$/);
  if (server) return { kind: 'server', player: 'Server', message: server[1] };

  const msg = body.match(/^<([^>]+)>\s*(.+)$/);
  if (msg) return { kind: 'message', player: msg[1], message: msg[2] };

  const join = body.match(/^(.+?)\s+joined the game$/i);
  if (join) return { kind: 'join', player: join[1] };

  const leave = body.match(/^(.+?)\s+left the game$/i);
  if (leave) return { kind: 'leave', player: leave[1] };

  const death = extractDeath(body);
  if (death) return { kind: 'death', player: death.player, message: death.message };

  return null;
}
