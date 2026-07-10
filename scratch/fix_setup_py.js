// Recover setup.py via LCS alignment between HEAD and current (line counts differ
// because of legitimate uncommitted additions). For lines that align (unchanged
// content), restore HEAD's original indentation. For lines with no HEAD match
// (new/edited lines), leave marked for manual review - do NOT guess indentation.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\stefa\\Desktop\\minepanel files\\MinePanel';
const file = path.join(ROOT, 'setup.py');

const EMOJI_REGEX = /([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2190}-\u{21FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE0F}]|[\u{200D}]|[\u{2300}-\u{23FF}]|\u2705|\u274C|\u2757|\u2753|\u2B50)/gu;

const headContent = execSync('git show HEAD:setup.py', { cwd: ROOT, encoding: 'utf8' });
const curContent = fs.readFileSync(file, 'utf8');

const headLines = headContent.split(/\r?\n/);
const curLines = curContent.split(/\r?\n/);

// Comparison key: HEAD line with emoji stripped and whitespace stripped, vs current line whitespace-stripped
function headKey(line) {
  return line.replace(EMOJI_REGEX, '').trim();
}
function curKey(line) {
  return line.trim();
}

const n = headLines.length, m = curLines.length;
// LCS DP table (n x m) - 566 x 729 ~ 412K cells, fine
const dp = new Array(n + 1);
for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);

const hKeys = headLines.map(headKey);
const cKeys = curLines.map(curKey);

for (let i = n - 1; i >= 0; i--) {
  for (let j = m - 1; j >= 0; j--) {
    if (hKeys[i] === cKeys[j] && hKeys[i] !== '') {
      dp[i][j] = dp[i + 1][j + 1] + 1;
    } else {
      dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
}

// Backtrack to build alignment: array of {curIndex, headIndex|null}
let i = 0, j = 0;
const alignment = []; // per current line: headIndex or -1
while (j < m) {
  if (i < n && hKeys[i] === cKeys[j] && hKeys[i] !== '' && dp[i][j] === dp[i + 1][j + 1] + 1) {
    alignment.push(i);
    i++; j++;
  } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) {
    i++;
  } else {
    alignment.push(-1);
    j++;
  }
}

const out = [];
const unmatchedLineNumbers = [];
for (let k = 0; k < curLines.length; k++) {
  const headIdx = alignment[k];
  const curLine = curLines[k];
  if (headIdx >= 0) {
    const headIndentMatch = headLines[headIdx].match(/^[ \t]*/);
    const headIndent = headIndentMatch ? headIndentMatch[0] : '';
    const curStripped = curLine.replace(/^[ \t]*/, '');
    out.push(headIndent + curStripped);
  } else {
    out.push(curLine); // leave as-is (currently corrupted/collapsed indent) - needs manual fix
    if (curLine.trim() !== '') unmatchedLineNumbers.push(k + 1);
  }
}

fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log(JSON.stringify({
  totalLines: out.length,
  matchedLines: alignment.filter(a => a >= 0).length,
  unmatchedNonEmptyLines: unmatchedLineNumbers.length,
  unmatchedLineNumbers
}, null, 2));
