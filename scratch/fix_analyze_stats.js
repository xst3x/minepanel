// Recover analyze_stats.py: line counts match HEAD exactly, so pair line-by-line
// and take indentation from HEAD, content (with emoji already removed) from current.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\stefa\\Desktop\\minepanel files\\MinePanel';
const file = path.join(ROOT, 'analyze_stats.py');

const headContent = execSync('git show HEAD:analyze_stats.py', { cwd: ROOT, encoding: 'utf8' });
const curContent = fs.readFileSync(file, 'utf8');

const headLines = headContent.split(/\r?\n/);
const curLines = curContent.split(/\r?\n/);

if (headLines.length !== curLines.length) {
  console.log('MISMATCH still - aborting', headLines.length, curLines.length);
  process.exit(1);
}

const out = [];
for (let i = 0; i < curLines.length; i++) {
  const headLine = headLines[i];
  const curLine = curLines[i];
  const headIndentMatch = headLine.match(/^[ \t]*/);
  const headIndent = headIndentMatch ? headIndentMatch[0] : '';
  const curStripped = curLine.replace(/^[ \t]*/, '');
  out.push(headIndent + curStripped);
}

fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('Restored analyze_stats.py, lines:', out.length);
