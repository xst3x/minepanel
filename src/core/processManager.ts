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

const RealProcessManager = require('./process-real-manager')
import ProxyProcessManager = require('./process-proxy-manager')

const isWorker = process.env.MINEPANEL_PROCESS === 'worker';
const isTest = process.env.NODE_ENV === 'test';

const instance = (isWorker || isTest) ? new RealProcessManager() : new ProxyProcessManager();
export = instance;

