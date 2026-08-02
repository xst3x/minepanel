"use strict";
/**
 * Console output parsers — extract TPS and player counts from server console output.
 * Used by the process managers for the live WS stats and the background /tps poller.
 */
/**
 * /tps response parsers — used by the background TPS poller (no plugin required).
 */
/** Paper/forks: "TPS from last 1m, 5m, 15m: 20.0, 19.9, 19.5" — first value is the 1-minute average. */
const TPS_RESPONSE_RE = /TPS from last 1m,\s*5m,\s*15m:\s*([\d.]+)/i;
/** Short form used by some forks: "TPS: 20.0" */
const TPS_SHORT_RE = /\bTPS:\s*([\d.]+)/i;
/** Console echo of the polled command, e.g. "Console issued server command: /tps" */
const TPS_ECHO_RE = /issued\s+server\s+command:\s*\/?tps\b/i;
/** Vanilla/unsupported servers reply: Unknown command: "/tps" */
const TPS_UNKNOWN_RE = /unknown\s+command.*\btps\b/i;
function parseTpsFromHistoryText(text) {
    try {
        const match = String(text || '').match(/TPS from last 1m,\s*5m,\s*15m:\s*([\d.]+)/i);
        if (match)
            return parseFloat(match[1]);
    }
    catch (_) { }
    return null;
}
function parsePlayersFromHistoryText(text) {
    try {
        const source = String(text || '');
        const regex = /There are (\d+) of a max(?: of)? \d+ players online/gi;
        let match, last = null;
        while ((match = regex.exec(source)) !== null)
            last = parseInt(match[1], 10);
        if (last !== null)
            return last;
    }
    catch (_) { }
    return null;
}
/**
 * Extract the 1-minute TPS average from a single /tps response line.
 * Returns null when the line isn't a TPS response.
 */
function parseTpsFromLine(line) {
    try {
        const source = String(line || '');
        const match = source.match(TPS_RESPONSE_RE) || source.match(TPS_SHORT_RE);
        if (match)
            return parseFloat(match[1]);
    }
    catch (_) { }
    return null;
}
/**
 * True when the line is /tps-related console noise that should be hidden:
 * the command echo or an "Unknown command" reply from servers without /tps.
 */
function isTpsConsoleNoise(line) {
    const source = String(line || '');
    return TPS_ECHO_RE.test(source) || TPS_UNKNOWN_RE.test(source);
}
/**
 * True when the line is an "Unknown command" reply from a server without a
 * /tps command (e.g. vanilla) — signals the poll is complete.
 */
function isTpsUnknownCommand(line) {
    return TPS_UNKNOWN_RE.test(String(line || ''));
}
/** A /tps poll that threw, e.g. "[15:45:29 ERROR]: Command exception: /tps". */
const TPS_ERROR_RE = /command\s+exception:\s*\/?tps\b/i;
/** Continuation lines of a Java command-exception stacktrace dump. */
const STACKTRACE_RE = /^\s*at\s|^Caused\s+by:|^\s*\.\.\.\s+\d+\s+more|^[\w.$]*(?:Exception|Error):/;
/** Paper's trailer after a failed command: "An unexpected error occurred trying to execute that command". */
const TPS_ERROR_TRAILER_RE = /an\s+unexpected\s+error\s+occurred\s+trying\s+to\s+execute\s+that\s+command/i;
/**
 * True when the panel's own /tps poll failed (e.g. an NPE on some Paper
 * setups) — the exception line starts a stacktrace dump that is noise.
 */
function isTpsCommandException(line) {
    return TPS_ERROR_RE.test(String(line || ''));
}
/**
 * True for a line that continues a Java command-exception stacktrace dump:
 * "\tat ...", "java.lang.XException: ...", "Caused by: ...", "... N more".
 */
function isStacktraceLine(line) {
    return STACKTRACE_RE.test(String(line || ''));
}
/** True for Paper's error trailer printed right after a failed command. */
function isTpsErrorTrailer(line) {
    return TPS_ERROR_TRAILER_RE.test(String(line || ''));
}
module.exports = { parseTpsFromHistoryText, parsePlayersFromHistoryText, parseTpsFromLine, isTpsConsoleNoise, isTpsUnknownCommand, isTpsCommandException, isStacktraceLine, isTpsErrorTrailer };
//# sourceMappingURL=consoleStatsParser.js.map