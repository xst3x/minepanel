// tests/automationEngine.test.js
// Unit tests for the console-log -> automation-event pipeline in automationEngine.js.
// These mock the DB and processManager so we can test line parsing, debouncing,
// and the disabled-server fast path in isolation, without spinning up real
// servers or Python workers.
process.env.NODE_ENV = 'test';

const triggeredEvents = [];

jest.mock('../src/db/database', () => ({
    dbAll: jest.fn(async () => []),
    dbGet: jest.fn(async () => ({ automation_enabled: 1 })),
}));

jest.mock('../src/core/processManager', () => {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    emitter.getStats = jest.fn(async () => ({ cpu: 0, ram: 0 }));
    emitter._stopIntents = new Set();
    return emitter;
});

jest.mock('../src/core/automation/workerManager', () => {
    const { EventEmitter } = require('events');
    return new EventEmitter();
});

const automationEngine = require('../src/core/automationEngine');

beforeEach(() => {
    triggeredEvents.length = 0;
    // Spy on triggerEvent instead of letting it hit the (mocked) DB, so each
    // test only asserts "was the right event fired with the right data".
    jest.spyOn(automationEngine, 'triggerEvent').mockImplementation(async (serverId, eventName, data) => {
        triggeredEvents.push({ serverId, eventName, data });
    });
    automationEngine.lineBuffers.clear();
    automationEngine.lastChatTriggered.clear();
    automationEngine.lastStopTriggered.clear();
    automationEngine.activeCache.clear();
});

afterEach(() => {
    jest.restoreAllMocks();
});

function feed(serverId, chunk) {
    automationEngine.consoleListener_TEST(serverId, chunk);
}

// processLine/consoleListener are defined inside start(); call start() once so
// they exist, but we drive them directly via the exposed listener rather than
// going through the real processManager EventEmitter.
beforeAll(() => {
    automationEngine.start();
    // Expose the internal listener under a stable test name.
    automationEngine.consoleListener_TEST = automationEngine.consoleListener;
});

afterAll(() => {
    automationEngine.stop();
});

describe('player_join detection', () => {
    test('fires on a real Paper/Vanilla join line', () => {
        feed('s1', '[12:34:56] [Server thread/INFO]: Stefan joined the game\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'player_join', data: { player_name: 'Stefan' } },
        ]);
    });

    test('fires on a millisecond-precision PocketMine-style timestamp', () => {
        feed('s1', '[12:34:56.789] [Server thread/INFO]: Stefan joined the game\n');
        expect(triggeredEvents).toHaveLength(1);
        expect(triggeredEvents[0].eventName).toBe('player_join');
    });

    test('does NOT fire from a voicechat/plugin log mentioning "joined the game"', () => {
        feed('s1', '[12:34:56] [Server thread/INFO]: [VoiceChat] Stefan joined the game voice channel\n');
        expect(triggeredEvents).toHaveLength(0);
    });

    test('does NOT fire from a chat message that merely contains the phrase', () => {
        feed('s1', '[12:34:56] [Server thread/INFO]: <Stefan> haha Bob joined the game lol\n');
        // Should be parsed as a chat event, not a join event
        expect(triggeredEvents).toHaveLength(1);
        expect(triggeredEvents[0].eventName).toBe('player_chat');
    });

    test('does NOT fire on a DEBUG-level line', () => {
        feed('s1', '[12:34:56] [Server thread/DEBUG]: Stefan joined the game\n');
        expect(triggeredEvents).toHaveLength(0);
    });

    test('does NOT fire on a line with no log prefix at all', () => {
        feed('s1', 'Stefan joined the game\n');
        expect(triggeredEvents).toHaveLength(0);
    });
});

describe('player_leave detection', () => {
    test('fires on Paper/Vanilla "left the game"', () => {
        feed('s1', '[12:34:56] [Server thread/INFO]: Stefan left the game\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'player_leave', data: { player_name: 'Stefan' } },
        ]);
    });

    test('fires on PocketMine-style "has left the game"', () => {
        feed('s1', '[13:50:04] [Server thread/INFO]: paps9787 has left the game\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'player_leave', data: { player_name: 'paps9787' } },
        ]);
    });
});

describe('player_chat detection', () => {
    test('fires with correct player name and message', () => {
        feed('s1', '[12:34:56] [Server thread/INFO]: <Stefan> hello world\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'player_chat', data: { player_name: 'Stefan', message: 'hello world' } },
        ]);
    });

    test('is rejected when the <name> token is not immediately after the log prefix', () => {
        feed('s1', '[12:34:56] [Server thread/INFO]: Relaying <Bob> hi\n');
        expect(triggeredEvents).toHaveLength(0);
    });
});

describe('chat debounce (anti-flood)', () => {
    test('drops rapid repeat chat events from the same player within the debounce window', () => {
        feed('s1', '[12:00:00.000] [Server thread/INFO]: <Spammer> msg1\n');
        feed('s1', '[12:00:00.050] [Server thread/INFO]: <Spammer> msg2\n');
        feed('s1', '[12:00:00.100] [Server thread/INFO]: <Spammer> msg3\n');
        // All within 200ms of the first -> only the first should fire.
        expect(triggeredEvents).toHaveLength(1);
        expect(triggeredEvents[0].data.message).toBe('msg1');
    });

    test('does not debounce across different players', () => {
        feed('s1', '[12:00:00.000] [Server thread/INFO]: <Alice> hi\n');
        feed('s1', '[12:00:00.010] [Server thread/INFO]: <Bob> hi\n');
        expect(triggeredEvents).toHaveLength(2);
    });

    test('handles a burst of 200 chat lines from one player without crashing or exploding event count', () => {
        let chunk = '';
        for (let i = 0; i < 200; i++) {
            chunk += `[12:00:00.000] [Server thread/INFO]: <Spammer> msg${i}\n`;
        }
        expect(() => feed('s1', chunk)).not.toThrow();
        // Debounce collapses same-timestamp burst to effectively one logical event
        // (all 200 lines arrive in the same JS tick, so Date.now() is identical).
        expect(triggeredEvents.length).toBeLessThan(200);
        expect(triggeredEvents.length).toBeGreaterThanOrEqual(1);
    });
});

describe('chunk buffering across partial lines', () => {
    test('reconstructs a line split across two chunks', () => {
        feed('s1', '[12:00:02] [Server thread/INFO]: Stefan le');
        expect(triggeredEvents).toHaveLength(0); // nothing yet, line incomplete
        feed('s1', 'ft the game\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'player_leave', data: { player_name: 'Stefan' } },
        ]);
    });

    test('parses multiple complete events from a single multi-line chunk', () => {
        const chunk =
            '[12:00:00] [Server thread/INFO]: Stefan joined the game\n' +
            '[12:00:01] [Server thread/INFO]: <Stefan> hello\n' +
            '[12:00:02] [Server thread/INFO]: Stefan left the game\n';
        feed('s1', chunk);
        expect(triggeredEvents.map(e => e.eventName)).toEqual([
            'player_join', 'player_chat', 'player_leave',
        ]);
    });
});

describe('per-server isolation', () => {
    test('events for one server do not leak into another server\'s stream', () => {
        feed('s1', '[12:00:00] [Server thread/INFO]: Stefan joined the game\n');
        feed('s2', '[12:00:00] [Server thread/INFO]: Bob joined the game\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'player_join', data: { player_name: 'Stefan' } },
            { serverId: 's2', eventName: 'player_join', data: { player_name: 'Bob' } },
        ]);
    });
});

describe('server_ready / server_stop detection', () => {
    test('fires server_ready on the Done(...) line', () => {
        feed('s1', '[12:00:00] [Server thread/INFO]: Done (32.123s)! For help, type "help"\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'server_ready', data: {} },
        ]);
    });

    test('fires server_stop on "Stopping the server"', () => {
        feed('s1', '[12:00:00] [Server thread/INFO]: Stopping the server\n');
        expect(triggeredEvents).toEqual([
            { serverId: 's1', eventName: 'server_stop', data: { crash: false } },
        ]);
    });
});
