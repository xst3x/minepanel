const fs = require('fs');
const file = 'C:\\Users\\stefa\\Desktop\\MinePanel\\src\\routes\\serverRoutes.js';
let src = fs.readFileSync(file, 'utf8');

// ── Stop: remove Docker branch ──────────────────────────────────────────────
// Pattern: from "const mode = server.execution_mode..." to just before
// "if (!processManager.acquireLock(serverId.toString()))"
src = src.replace(
  /[ \t]*const mode = server\.execution_mode \|\| 'native';\n\n[ \t]*if \(mode === 'docker'\) \{[\s\S]*?\}\n\n[ \t]*(?=if \(!processManager\.acquireLock\(serverId\.toString\(\)\)\))/,
  '        '
);

// ── Restart: remove Docker branch ───────────────────────────────────────────
// Pattern: from "const mode = server.execution_mode..." to just before
// "const { serverDir, jarFile, customArgs } = getStartInfo(server);"
// (second occurrence of mode check)
src = src.replace(
  /[ \t]*const mode = server\.execution_mode \|\| 'native';\n\n[ \t]*if \(mode === 'docker'\) \{[\s\S]*?\}\n\n[ \t]*(?=const \{ serverDir, jarFile, customArgs \} = getStartInfo)/,
  '        '
);

// ── Kill: remove Docker branch ───────────────────────────────────────────────
src = src.replace(
  /[ \t]*const killMode = server\.execution_mode \|\| 'native';\n\n[ \t]*if \(killMode === 'docker'\) \{[\s\S]*?\}\n\n[ \t]*\/\/ Kill must never be blocked/,
  '        // Kill must never be blocked'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Done. Matches remaining for docker:', (src.match(/dockerService/g) || []).length);
