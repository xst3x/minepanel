import * as logger from './logger';

export async function checkUpdates(): Promise<boolean> {
    logger.info('Updater', 'Checking for updates... (No updates available)');
    return false;
}

export async function runUpdate(): Promise<void> {
    logger.info('Updater', 'Running update... (Not implemented)');
}
