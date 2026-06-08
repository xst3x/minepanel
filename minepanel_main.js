const { spawn } = require('child_process');
const path = require('path');

const backendScript = path.resolve(__dirname, 'src/minepanel.js');
const child = spawn(process.execPath, [backendScript], {
    stdio: 'inherit',
    env: { ...process.env }
});

child.on('exit', (code) => {
    process.exit(code || 0);
});
