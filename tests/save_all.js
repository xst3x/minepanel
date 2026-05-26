const processManager = require('../src/core/processManager');

async function main() {
    // Send save-all command to server
    const serverId = 'test-server-2';
    console.log('Sending /save-all to server...');
    processManager.sendCommand(serverId, 'save-all');
}

main().catch(console.error);
