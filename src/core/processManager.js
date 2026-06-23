/**
 * Process Manager — thin wrapper that conditionally exports the appropriate
 * implementation based on the runtime environment.
 *
 * Worker & Test → RealProcessManager (manages actual server child processes)
 * API process   → ProxyProcessManager (communicates with worker via IPC)
 *
 * Logic lives in:
 *   process-real-manager.js  — RealProcessManager class
 *   process-proxy-manager.js — ProxyProcessManager class
 *   process-persistence.js   — save/load running servers
 *   process-output-parser.js — stderr parsing
 */

const isWorker = process.env.MINEPANEL_PROCESS === 'worker';
const isTest = process.env.NODE_ENV === 'test';

if (isWorker || isTest) {
    const RealProcessManager = require('./process-real-manager');
    module.exports = new RealProcessManager();
} else {
    const ProxyProcessManager = require('./process-proxy-manager');
    module.exports = new ProxyProcessManager();
}
