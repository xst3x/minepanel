/**
 * MinePanel — frontend console logger
 * Styled output similar to Crafty Controller's debug console.
 * Usage:
 *   import log from '@/lib/logger';
 *   log.info('WebSocket connected');
 *   log.event('server_status', { id: 3, status: 'online' });
 *   log.warn('Retrying in 5s...');
 *   log.error('API call failed', err);
 */

const PREFIX = '%c[MinePanel]%c';
const BASE   = 'font-weight:700;';
const RESET  = 'font-weight:400;color:inherit;';

const LEVELS = {
  info:    { label: 'INFO',    color: '#4ade80', icon: '●' },
  event:   { label: 'EVENT',   color: '#60a5fa', icon: '◆' },
  ws:      { label: 'WS',      color: '#a78bfa', icon: '⇄' },
  warn:    { label: 'WARN',    color: '#fbbf24', icon: '▲' },
  error:   { label: 'ERROR',   color: '#f87171', icon: '✖' },
  success: { label: 'OK',      color: '#34d399', icon: '✔' },
  debug:   { label: 'DEBUG',   color: '#94a3b8', icon: '⚙' },
} as const;

type Level = keyof typeof LEVELS;

function write(level: Level, message: string, ...rest: unknown[]) {
  const { label, color, icon } = LEVELS[level];
  const tag  = `%c${icon} ${label}%c`;
  const tagStyle  = `${BASE}color:${color};`;
  const msgStyle  = 'color:#e2e8f0;';

  if (level === 'error') {
    console.error(
      `${PREFIX} ${tag} ${message}`,
      `${BASE}color:${color};`,
      RESET,
      tagStyle,
      RESET,
      ...rest,
    );
  } else if (level === 'warn') {
    console.warn(
      `${PREFIX} ${tag} ${message}`,
      `${BASE}color:${color};`,
      RESET,
      tagStyle,
      RESET,
      ...rest,
    );
  } else {
    console.log(
      `${PREFIX} ${tag} %c${message}`,
      `${BASE}color:${color};`,
      RESET,
      tagStyle,
      RESET,
      msgStyle,
      ...rest,
    );
  }
}

const log = {
  info:    (msg: string, ...r: unknown[]) => write('info',    msg, ...r),
  event:   (msg: string, ...r: unknown[]) => write('event',   msg, ...r),
  ws:      (msg: string, ...r: unknown[]) => write('ws',      msg, ...r),
  warn:    (msg: string, ...r: unknown[]) => write('warn',    msg, ...r),
  error:   (msg: string, ...r: unknown[]) => write('error',   msg, ...r),
  success: (msg: string, ...r: unknown[]) => write('success', msg, ...r),
  debug:   (msg: string, ...r: unknown[]) => write('debug',   msg, ...r),

  /** Log a registered WebSocket / SSE event listener */
  registered: (eventName: string) =>
    write('event', `Registered listener → ${eventName}`),

  /** Log a WebSocket lifecycle moment */
  wsConnect: (url: string) =>
    write('ws', `Connecting to WebSocket — ${url}`),
  wsReady: () =>
    write('ws', 'WebSocket connection established'),
  wsClose: (code?: number) =>
    write('ws', `WebSocket closed${code !== undefined ? ` (code ${code})` : ''}`),
};

export default log;
