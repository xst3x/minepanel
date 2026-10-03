"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { PROJECT_ROOT } = require('./src/paths');
const { spawn } = require('child_process');
const path = require('path');
const backendScript = path.resolve(__dirname, 'src/minepanel.js');
const child = spawn(process.execPath, [backendScript], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env }
});
child.on('exit', (code) => {
    process.exit(code || 0);
});
//# sourceMappingURL=minepanel_main.js.map