// One-off utility: remove emoji characters from source files.
// Scans src/ (ts/js/tsx/jsx), skips node_modules/.git/dist/build/cache/data/logs.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGET_DIRS = ['src', 'setup.py', 'analyze_stats.py', 'migrateis.py'];
const EXT_OK = new Set(['.ts', '.tsx', '.js', '.jsx', '.py']);
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'build', 'cache', 'data', 'logs', 'venv', '__pycache__']);

// Broad emoji / pictographic / symbol ranges (keeps normal punctuation, arrows used as ASCII, etc.)
const EMOJI_REGEX = /([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2190}-\u{21FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE0F}]|[\u{200D}]|[\u{2300}-\u{23FF}]|\u2705|\u274C|\u2757|\u2753|\u2B50)/gu;

let changedFiles = [];
let totalRemoved = 0;

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else {
      const ext = path.extname(entry.name);
      if (EXT_OK.has(ext) && !entry.name.endsWith('.map')) {
        processFile(full);
      }
    }
  }
}

function processFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { return; }
  const matches = content.match(EMOJI_REGEX);
  if (!matches || matches.length === 0) return;

  // Remove emoji, then collapse any resulting double-space before punctuation/newline
  let newContent = content.replace(EMOJI_REGEX, '');
  // Clean up leftover " :" or double spaces left where emoji used to sit between space and text
  newContent = newContent.replace(/[ \t]{2,}/g, ' ');

  fs.writeFileSync(filePath, newContent, 'utf8');
  changedFiles.push({ file: path.relative(ROOT, filePath), count: matches.length });
  totalRemoved += matches.length;
}

for (const t of TARGET_DIRS) {
  const full = path.join(ROOT, t);
  try {
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else processFile(full);
  } catch (e) { /* ignore missing */ }
}

console.log(JSON.stringify({ totalRemoved, filesChanged: changedFiles.length, changedFiles }, null, 2));
