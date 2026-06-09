const fs = require('fs');
const file = 'C:\\Users\\stefa\\Desktop\\MinePanel\\src\\minepanel.js';
let src = fs.readFileSync(file, 'utf8');

// ── 1. Remove dockerRoutes require + app.use ──────────────────────────────
src = src.replace(/const dockerRoutes = require\('\.\/routes\/dockerRoutes'\);\napp\.use\('\/api\/docker', dockerRoutes\);\n/, '');

// ── 2. Remove executionManager import (now only processManager is needed) ──
// Keep executionManager — it's still used for getStatus in the WS handler
// Actually keep it — it's still referenced in WS handler for getStatus/getStats

// ── 3. Autostart: remove Docker branch inside autostart loop ───────────────
// Pattern: the if (mode === 'docker') { ... } else { ... } block inside autostart
src = src.replace(
  /[ \t]*const mode = srv\.execution_mode \|\| 'native';\n[ \t]*if \(mode === 'docker'\) \{[\s\S]*?\} else \{\n([\s\S]*?)\}\n[ \t]*\} catch \(e\) \{ logger\.error\(`\[Autostart\]/,
  (_, nativeBlock) => nativeBlock + '                    } catch (e) { logger.error(`[Autostart]'
);

// ── 4. CrashRestart: the handler already uses native-only code (javaManager)
// nothing to change there — it never had a docker branch

// ── 5. WebSocket handler: remove Docker-specific blocks ──────────────────
// Remove the Docker log handle setup and the Docker status-poll inside statsInterval

// 5a. Remove attachDockerLogs function + dockerLogHandle var + the Docker attach on start
src = src.replace(
  /[ \t]*\/\/ For Docker servers: attach container log stream \+ poll status\n[\s\S]*?\/\/ Store handle for cleanup on WS close\n[ \t]*ws\._dockerLogHandle = \(\) => \{ if \(dockerLogHandle\) \{ try \{ dockerLogHandle\.destroy\(\); \} catch \(_\) \{\} dockerLogHandle = null; \} \};\n/,
  ''
);

// 5b. Remove Docker log-tail seeding block  
src = src.replace(
  /[ \t]*\/\/ If history is empty \(panel restarted while container kept running\),[\s\S]*?await attachDockerLogs\(\);\n[ \t]*\}\n/,
  ''
);

// 5c. Remove Docker status-poll inside statsInterval
src = src.replace(
  /[ \t]*\/\/ For Docker: poll container status and push status change \+ re-attach logs on start\n[\s\S]*?}\n[ \t]*\} catch \(_\) \{\}\n[ \t]*\}, 2000\);/,
  '                } catch (_) {}\n                }, 2000);'
);

// 5d. Remove Docker stdin forwarding in WS command handler
src = src.replace(
  /[ \t]*const mode = await executionManager\.getExecutionMode\(serverId\);\n[ \t]*if \(mode === 'docker'\) \{[\s\S]*?\} else \{\n[ \t]*processManager\.sendCommand\(serverId, parsed\.data\);\n[ \t]*\}/,
  '                    processManager.sendCommand(serverId, parsed.data);'
);

// 5e. Remove ws._dockerLogHandle cleanup on WS close
src = src.replace(
  /[ \t]*\/\/ Destroy Docker log stream if attached\n[ \t]*try \{ if \(ws\._dockerLogHandle\) ws\._dockerLogHandle\(\); \} catch \(_\) \{\}\n/,
  ''
);

// ── 6. Remove getExecutionMode references ──────────────────────────────────
// The executionManager import no longer needs getExecutionMode — clean up the destructuring
src = src.replace(
  "const executionManager = require('./core/executionManager');",
  "const executionManager = require('./core/executionManager');"
  // keep as-is; executionManager.getStatus / getStats still used in WS handler
);

fs.writeFileSync(file, src, 'utf8');

// Count remaining Docker refs
const dockerCount = (src.match(/[Dd]ocker/g) || []).length;
const execModeCount = (src.match(/getExecutionMode/g) || []).length;
console.log('Done.');
console.log('  Remaining "docker" refs:', dockerCount);
console.log('  Remaining getExecutionMode calls:', execModeCount);
