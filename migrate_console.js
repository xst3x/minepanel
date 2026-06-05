const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'core', 'discord', 'discordManager.js');
let content = fs.readFileSync(file, 'utf8');

// Replace console.log → logger.info and console.error → logger.error
// Be careful not to replace inside strings or comments in weird ways
content = content.replace(/\bconsole\.log\b/g, 'logger.info');
content = content.replace(/\bconsole\.error\b/g, 'logger.error');
content = content.replace(/\bconsole\.warn\b/g, 'logger.warn');

fs.writeFileSync(file, content, 'utf8');
console.log('Done. Replaced all console.log/error/warn in discordManager.js');
