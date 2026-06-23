const fs = require('fs');
const fp = './src/routes/modules/serverManagementRoutes.js';
let c = fs.readFileSync(fp, 'utf8');
const lines = c.split('\n');

// Line 474: normJar - write exact desired content
// In the source file we want: [/\\] (2 backslash chars = one escaped backslash in regex)
// 5c 5c are the hex values for two \ chars
const bs2 = String.fromCharCode(92, 92); // two backslashes
const bs4 = String.fromCharCode(92, 92, 92, 92); // four backslashes

const normJarLine = '    const normJar  = jar_path.replace(/^[/' + bs2 + ']+/, \'\').replace(/'.repeat(0) + bs2 + '/g, \'/\');';
// Simpler: just set the line directly using explicit chars
lines[474] = '    const normJar  = jar_path.replace(/^[/' + bs2 + ']+/, \'\').replace(/' + bs2 + '/g, \'/\');';
lines[475] = '    const normRoot = (root_path || \'\').replace(/^[/' + bs2 + ']+/, \'\').replace(/' + bs2 + '/g, \'/\').replace(/\\/+$/, \'\');';

c = lines.join('\n');
fs.writeFileSync(fp, c, 'utf8');

// Verify with hex dump
const v = fs.readFileSync(fp, 'utf8');
const l474a = v.split('\n')[474];
console.log('Line 474 hex:', Buffer.from(l474a, 'utf8').toJSON().data.map(b => b.toString(16)).join(' '));
console.log('Line 474 text:', l474a);

try {
  require('./src/routes/modules/serverManagementRoutes');
  console.log('MODULE LOADS OK');
} catch(e) {
  console.log('ERROR:', e.message);
}
