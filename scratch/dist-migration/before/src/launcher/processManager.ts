import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as logger from './logger';
import { EventEmitter } from 'events';

export const pmEvents = new EventEmitter();
let child: ChildProcess | null = null;
let isShuttingDown = false;

export function getChildProcess() {
    return child;
}

export function startBackend(port: number, token: string): Promise<void> {
    isShuttingDown = false;
    return new Promise((resolve) => {
        const backendScript = path.resolve(__dirname, '../minepanel.js');
        
        logger.info('ProcessManager', `Starting backend child process...`);
        
        // Spawn with IPC channel enabled
        child = spawn(process.execPath, [backendScript], {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: {
                ...process.env,
                MINEPANEL_SERVER: 'true',
                MINEPANEL_MANAGED_BY_LAUNCHER: 'true',
                LAUNCHER_PORT: String(port),
                LAUNCHER_TOKEN: token
            }
        });

        child.on('message', (message: any) => {
            if (message && typeof message === 'object') {
                if (message.type === 'restart') {
                    logger.info('ProcessManager', 'Received restart request from backend IPC');
                    pmEvents.emit('restart-requested');
                } else if (message.type === 'shutdown') {
                    logger.info('ProcessManager', 'Received shutdown request from backend IPC');
                    pmEvents.emit('shutdown-requested');
                } else if (message.type === 'reload-settings') {
                    logger.info('ProcessManager', 'Received reload-settings request from backend IPC');
                    pmEvents.emit('reload-settings-requested');
                } else if (message.type === 'ready') {
                    logger.info('ProcessManager', 'Backend reported readiness');
                    pmEvents.emit('backend-ready');
                }
            }
        });

        child.on('exit', (code, signal) => {
            logger.info('ProcessManager', `Backend exited with code ${code}, signal ${signal}`);
            child = null;
            if (!isShuttingDown) {
                pmEvents.emit('backend-crashed', { code, signal });
            }
        });

        resolve();
    });
}

export async function stopBackend(gracefulTimeoutMs: number): Promise<void> {
    if (!child) return;
    isShuttingDown = true;
    
    logger.info('ProcessManager', 'Stopping backend gracefully...');
    child.kill('SIGTERM');

    return new Promise((resolve) => {
        let exited = false;
        
        const timeout = setTimeout(() => {
            if (exited) return;
            if (child) {
                logger.warn('ProcessManager', `Backend did not exit in ${gracefulTimeoutMs}ms. Sending SIGKILL.`);
                child.kill('SIGKILL');
            }
        }, gracefulTimeoutMs);

        const checkInterval = setInterval(() => {
            if (!child) {
                exited = true;
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
}
