// tests/minecraftLog.test.ts
// Unit tests for the frontend log/chat parser (src/frontend/src/lib/minecraftLog.ts).
// Pure functions — no DB, no app boot, so this file runs fast and standalone.
//
// NOTE: jest.config.js routes this file + the parser through jest-transform-ts.js
// (babel-jest can't transform TS without @babel/preset-typescript). If you add
// tests for another TS file from the frontend, add a matching regex there.

const {
    splitConsoleChunk,
    parseMinecraftLogLine,
    parseChatLine,
    mcToHtml,
    stripAnsi,
} = require('../src/frontend/src/lib/minecraftLog.ts');

describe('splitConsoleChunk', () => {
    test('splits CRLF / LF chunks and drops empty lines', () => {
        expect(splitConsoleChunk('[a]\r\n\r\n[b]\n   \n[c]')).toEqual(['[a]', '[b]', '[c]']);
    });

    test('keeps leading whitespace but drops whitespace-only lines', () => {
        expect(splitConsoleChunk('  at java.lang.Thread.run()\n  \n\n')).toEqual(['  at java.lang.Thread.run()']);
    });

    test('returns [] for an empty chunk', () => {
        expect(splitConsoleChunk('\r\n\n')).toEqual([]);
    });
});

describe('parseMinecraftLogLine (console classification)', () => {
    test('classifies INFO as info', () => {
        expect(parseMinecraftLogLine('[09:00:00 INFO]: Starting minecraft server').level).toBe('info');
    });

    test('classifies [HH:MM:SS WARN] as warn', () => {
        expect(parseMinecraftLogLine('[09:00:00 WARN]: This is a warning').level).toBe('warn');
    });

    test('classifies [HH:MM:SS ERROR] / SEVERE / stacktraces as error', () => {
        expect(parseMinecraftLogLine('[09:00:00 ERROR]: Boom').level).toBe('error');
        expect(parseMinecraftLogLine('[09:00:00 SEVERE]: Boom').level).toBe('error');
        expect(parseMinecraftLogLine('  at net.minecraft.server.Main.main(Main.java:123)').level).toBe('error');
        expect(parseMinecraftLogLine('[09:00:00 ERROR]: java.lang.NullPointerException').level).toBe('error');
    });

    test('classifies "Done (" as done', () => {
        expect(parseMinecraftLogLine('[09:00:00 INFO]: Done (4.2s)!').level).toBe('done');
    });

    test('classifies player chat and [Server] says as chat', () => {
        expect(parseMinecraftLogLine('[09:42:20 INFO]: [Not Secure] <CALIN_7414> cn este la spawn').level).toBe('chat');
        expect(parseMinecraftLogLine('[09:42:20 INFO]: [Server] hello world').level).toBe('chat');
    });

    test('classifies join / leave as join / leave', () => {
        expect(parseMinecraftLogLine('[09:42:20 INFO]: CALIN_7414 joined the game').level).toBe('join');
        expect(parseMinecraftLogLine('[09:42:20 INFO]: CALIN_7414 left the game').level).toBe('leave');
    });

    test('classifies death / kill messages as death', () => {
        expect(parseMinecraftLogLine('[09:42:20 INFO]: Steve was slain by Zombie').level).toBe('death');
        expect(parseMinecraftLogLine('[09:42:20 INFO]: [Not Secure] Steve fell from a high place').level).toBe('death');
    });

    test('classifies console commands and panel/system lines', () => {
        expect(parseMinecraftLogLine('[09:00:00 INFO]: Console issued server command: /tps').level).toBe('command');
        expect(parseMinecraftLogLine('> /say hello').level).toBe('command');
        expect(parseMinecraftLogLine('[09:00:00 INFO]: [System] Access denied').level).toBe('sys');
    });

    test('keeps plugin output as info', () => {
        expect(parseMinecraftLogLine('[09:00:00 INFO]: [Essentials] reloaded 12 users').level).toBe('info');
    });
});

describe('parseChatLine (chat tab extraction)', () => {
    test('extracts <Player> message', () => {
        expect(parseChatLine('[09:42:20 INFO]: [Not Secure] <CALIN_7414> cn este la spawn')).toEqual({
            kind: 'message', player: 'CALIN_7414', message: 'cn este la spawn',
        });
    });

    test('extracts player message with repeated markers or no marker', () => {
        expect(parseChatLine('[09:42:20 INFO]: [Not Secure] [Not Secure] <Steve> hi')).toEqual({
            kind: 'message', player: 'Steve', message: 'hi',
        });
        expect(parseChatLine('[09:42:20 INFO]: <Steve> hi')).toEqual({
            kind: 'message', player: 'Steve', message: 'hi',
        });
    });

    test('extracts [Server] /say output', () => {
        expect(parseChatLine('[10:00:00 INFO]: [Server] hello world')).toEqual({
            kind: 'server', player: 'Server', message: 'hello world',
        });
    });

    test('extracts [Server] output even when prefixed with [Not Secure]', () => {
        expect(parseChatLine('[10:00:00 INFO]: [Not Secure] [Server] hello world')).toEqual({
            kind: 'server', player: 'Server', message: 'hello world',
        });
    });

    test('extracts join / leave events', () => {
        expect(parseChatLine('[09:42:20 INFO]: CALIN_7414 joined the game')).toEqual({
            kind: 'join', player: 'CALIN_7414',
        });
        expect(parseChatLine('[09:42:20 INFO]: CALIN_7414 left the game')).toEqual({
            kind: 'leave', player: 'CALIN_7414',
        });
    });

    test('extracts death / kill messages', () => {
        expect(parseChatLine('[09:42:20 INFO]: Steve was slain by Zombie')).toEqual({
            kind: 'death', player: 'Steve', message: 'Steve was slain by Zombie',
        });
        expect(parseChatLine('[09:42:20 INFO]: Steve was shot by Skeleton')).toEqual({
            kind: 'death', player: 'Steve', message: 'Steve was shot by Skeleton',
        });
        expect(parseChatLine('[09:42:20 INFO]: Steve drowned')).toEqual({
            kind: 'death', player: 'Steve', message: 'Steve drowned',
        });
        expect(parseChatLine('[09:42:20 INFO]: Steve fell from a high place')).toEqual({
            kind: 'death', player: 'Steve', message: 'Steve fell from a high place',
        });
        expect(parseChatLine('[09:42:20 INFO]: [Not Secure] Steve was killed by [Intentional Game Design]')).toEqual({
            kind: 'death', player: 'Steve', message: 'Steve was killed by [Intentional Game Design]',
        });
    });

    test('returns null for system / plugin / error / command / plain-info lines', () => {
        expect(parseChatLine('[10:00:00 INFO]: [Essentials] reloaded')).toBeNull();
        expect(parseChatLine('[10:00:00 INFO]: [System] Access denied')).toBeNull();
        expect(parseChatLine('[09:00:00 ERROR]: Boom')).toBeNull();
        expect(parseChatLine('[09:00:00 INFO]: Console issued server command: /tps')).toBeNull();
        expect(parseChatLine('[09:00:00 INFO]: Starting minecraft server')).toBeNull();
        expect(parseChatLine('[09:00:00 INFO]: Finished')).toBeNull();
    });

    test('does not confuse player chat mentioning death with a death event', () => {
        const entry = parseChatLine('[09:00:00 INFO]: <Steve> I died lmao');
        expect(entry).not.toBeNull();
        expect(entry.kind).toBe('message');
    });
});

describe('mcToHtml (color codes + escaping)', () => {
    test('converts §/& color codes into escaped span HTML', () => {
        expect(mcToHtml('§aGreen §rPlain')).toBe('<span class="mc-green">Green </span>Plain');
    });

    test('escapes HTML when no color codes are present', () => {
        expect(mcToHtml('a < b & c')).toBe('a &lt; b &amp; c');
    });

    test('balances spans across chained codes', () => {
        expect(mcToHtml('§l§cRED')).toBe('<span class="mc-bold"><span class="mc-red">RED</span></span>');
    });
});

describe('stripAnsi', () => {
    test('removes ANSI escape sequences', () => {
        expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
    });
});
