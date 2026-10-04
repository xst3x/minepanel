const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const { spawn, spawnSync, fork } = require('node:child_process');
const { once } = require('node:events');

const root = path.resolve(__dirname, '..');
let sandbox, install, env;
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function run(args, overrides = {}) {
  const result = spawnSync(process.execPath, args, { cwd: sandbox, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr + result.stdout + (result.error || ''));
  return result.stdout;
}
function script(code, overrides) { return run(['-e', code], overrides); }
function modulePath(relative) { return JSON.stringify(path.join(install, 'dist', 'src', relative)); }
function cli(command) { return run([path.join(install, 'dist/src/db/db-cli.js'), command]); }
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function get(port, route) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: route }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(1000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
  });
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    // Every startup probe owns its own process group, including workers.
    process.kill(-child.pid, 'SIGTERM');
  }
  await exited;
}
before(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'minepanel-dist-'));
  install = path.join(sandbox, 'installation');
  fs.mkdirSync(install);
  fs.copyFileSync(path.join(root, 'package.json'), path.join(install, 'package.json'));
  // Only compiled code is copied. Pre-existing runtime files in a developer's
  // dist directory must never enter the fixture or be removed by these tests.
  for (const file of files(path.join(root, 'dist'))) {
    const rel = path.relative(path.join(root, 'dist'), file);
    if (!/\.(js|js\.map)$/.test(rel) || !(rel.startsWith('src' + path.sep) || rel.startsWith('minepanel_main.'))) continue;
    const dest = path.join(install, 'dist', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(install, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const dir of ['src/core/automation', 'src/docs']) {
    fs.cpSync(path.join(root, dir), path.join(install, dir), { recursive: true, filter: p => !/\.(ts|js|map)$/.test(p) });
  }
  fs.mkdirSync(path.join(install, 'src/public'), { recursive: true });
  fs.cpSync(path.join(root, 'src/public'), path.join(install, 'src/public'), { recursive: true });
  fs.appendFileSync(path.join(install, 'src/public/index.html'), '<!-- dist-layout-static-marker -->');
  fs.writeFileSync(path.join(install, '.env'), 'HTTPS=false\nFTP_ENABLED=false\nJWT_SECRET=dist-layout-test-secret\nDIST_LAYOUT_MARKER=loaded-from-installation\n');
  fs.writeFileSync(path.join(install, 'settings.json'), '{"ftpEnabled":false}');
  fs.mkdirSync(path.join(install, 'data'));
  fs.mkdirSync(path.join(install, 'servers/Existing_Server'), { recursive: true });
  fs.writeFileSync(path.join(install, 'servers/Existing_Server/server.properties'), 'server-port=25565');
  env = { ...process.env, NODE_ENV: 'production' };
  for (const key of ['BASE_PATH', 'DATA_DIR', 'HTTPS', 'HTTPS_KEY', 'HTTPS_CERT', 'PORT', 'MINEPANEL_SERVER', 'MINEPANEL_PROCESS', 'DIST_LAYOUT_MARKER', 'NODE_OPTIONS']) delete env[key];
});
after(() => {
  if (sandbox && path.dirname(sandbox) === path.resolve(os.tmpdir()) && path.basename(sandbox).startsWith('minepanel-dist-')) {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('backend output and source maps live only in dist', () => {
  const ts = require('typescript');
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => assert.fail(String(d.messageText)) });
  for (const source of parsed.fileNames.filter(f => !f.endsWith('.d.ts'))) {
    const js = source.replace(/\.ts$/, '.js');
    assert.equal(fs.existsSync(js), false, js);
    assert.equal(fs.existsSync(js + '.map'), false, js + '.map');
    const emitted = path.join(root, 'dist', path.relative(root, js));
    assert.ok(fs.existsSync(emitted), emitted);
    const map = JSON.parse(fs.readFileSync(emitted + '.map', 'utf8'));
    assert.equal(path.resolve(path.dirname(emitted), map.sources[0]), path.resolve(source));
  }
});

test('one root loads .env from an unrelated cwd and preserves default data paths', () => {
  const result = JSON.parse(script(`const p=require(${modulePath('paths.js')}); console.log(JSON.stringify({...p, marker:process.env.DIST_LAYOUT_MARKER}));`));
  assert.equal(result.PROJECT_ROOT, install);
  assert.equal(result.marker, 'loaded-from-installation');
  assert.equal(result.DB_DIR, path.join(install, 'data'));
  assert.equal(result.SERVERS_DIR, path.join(install, 'servers'));
  assert.equal(result.SETTINGS_FILE, path.join(install, 'settings.json'));
  assert.equal(result.PROCESS_DATA_DIR, path.join(sandbox, 'data'));
  assert.ok(fs.existsSync(path.join(result.SERVERS_DIR, 'Existing_Server/server.properties')));
  for (const data of ['relative-data', path.join(sandbox, 'external-data')]) {
    const configured = JSON.parse(script(`console.log(JSON.stringify(require(${modulePath('paths.js')})));`, { DATA_DIR: data }));
    const expected = path.resolve(install, data);
    assert.equal(configured.DB_DIR, path.join(expected, 'db'));
    assert.equal(configured.SERVERS_DIR, path.join(expected, 'servers'));
    assert.equal(configured.AVATARS_DIR, path.join(expected, 'avatars'));
    assert.equal(configured.SETTINGS_FILE, path.join(expected, 'settings.json'));
  }
});

test('compiled database CLI migrates, reports status, checks integrity and backs up the same database', () => {
  // SQLite creates a valid empty DB on first open; all mutations stay in fixture.
  script(`const sqlite=require(${JSON.stringify(path.join(root, 'node_modules/sqlite3'))}); new sqlite.Database(${JSON.stringify(path.join(install, 'data/minepanel.db'))}).close();`);
  assert.match(cli('migrate'), /Done/);
  assert.match(cli('status'), /applied/);
  assert.match(cli('integrity'), /integrity: OK/);
  assert.match(cli('backup'), /Backup saved and verified/);
  assert.ok(files(path.join(install, 'data/backups')).length > 0);
  // Verify ORM and raw SQLite select exactly the same physical file.
  script(`const assert=require('assert/strict'); const p=require(${modulePath('paths.js')}); const db=require(${modulePath('db/database.js')}); const orm=require(${modulePath('db/sequelize.js')}); assert.equal(db.db.filename, require('path').join(p.DB_DIR,'minepanel.db')); assert.equal(orm.options.storage, db.db.filename); db.db.close(); orm.close();`);
});

test('Discord commands and migration discovery load emitted JavaScript', () => {
  assert.match(script(`const commands=require(${modulePath('core/discord/commands/index.js')}); console.log('commands='+commands.size); process.exit(0);`), /commands=[1-9]/);
  const migrations = files(path.join(install, 'dist/src/db/migrations')).filter(f => f.endsWith('.js'));
  assert.ok(migrations.length >= 20);
  assert.equal(fs.existsSync(path.join(install, 'src/db/migrations')), false);
});

test('compiled Python manager finds and executes the original Python resources', () => {
  const output = script(`(async()=>{ const assert=require('assert/strict'); const manager=require(${modulePath('core/automation/workerManager.js')}); const validation=await manager.verifyCode('print("valid")'); assert.equal(validation.valid,true,JSON.stringify(validation)); let logs=''; manager.on('log',(_,text)=>logs+=text); await manager.runWorker('fixture','probe','print("python-layout-ok")',{}); assert.match(logs,/python-layout-ok/); console.log('python-layout-ok'); process.exit(0); })().catch(e=>{console.error(e);process.exit(1)});`, { NODE_ENV: 'test' });
  assert.match(output, /python-layout-ok/);
});

test('forked compiled worker responds over IPC from another cwd', async () => {
  const child = fork(path.join(install, 'dist/src/worker.js'), [], { cwd: sandbox, env: { ...env, MINEPANEL_PROCESS: 'worker' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', d => output += d);
  child.stderr.on('data', d => output += d);
  try {
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(output || 'Worker IPC timeout')), 10000);
      child.on('message', message => { if (message.type === 'pong') { clearTimeout(timeout); resolve(message); } });
    });
    child.send({ type: 'ping', requestId: 'layout-check' });
    assert.equal((await response).requestId, 'layout-check');
  } finally {
    if (child.connected) child.disconnect();
    if (child.exitCode === null) await once(child, 'exit');
  }
});

test('production entrypoint starts backend and worker, serves health/static files, and leaves dist data-free', async () => {
  const port = await freePort();
  const before = files(path.join(install, 'dist')).sort();
  const child = spawn(process.execPath, ['dist/minepanel_main.js'], { cwd: install, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
  let output = '';
  child.stdout.on('data', d => output += d);
  child.stderr.on('data', d => output += d);
  try {
    let health;
    for (let i = 0; i < 100; i++) {
      health = await get(port, '/health').catch(() => null);
      if (health?.status === 200 && output.includes('[Worker] Started')) break;
      if (child.exitCode !== null) assert.fail(output);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(health?.status, 200, output);
    assert.equal(JSON.parse(health.body).version, require('../package.json').version);
    const page = await get(port, '/login');
    assert.equal(page.status, 200);
    assert.match(page.body, /dist-layout-static-marker/);
    assert.match(output, /[\\/]dist[\\/]src[\\/]worker\.js/);
    assert.doesNotMatch(output, /MODULE_NOT_FOUND|ENOENT|Certificate files not found/);
  } finally { await stop(child); }
  assert.deepEqual(files(path.join(install, 'dist')).sort(), before);
  assert.ok(fs.existsSync(path.join(install, 'logs/minepanel.log')));
  assert.ok(fs.existsSync(path.join(install, 'ADMIN_CREDENTIALS.txt')), 'First-run credentials belong in the installation root');
  assert.equal(fs.existsSync(path.join(install, 'dist/ADMIN_CREDENTIALS.txt')), false);

});
for (const override of [undefined, '/custom/admin/']) {
  test(`configured base path mounts HTTP, authentication and WebSocket (${override || 'saved /panel/'})`, async () => {
    const settingsFile = path.join(install, 'settings.json');
    const previous = fs.readFileSync(settingsFile, 'utf8');
    fs.writeFileSync(settingsFile, JSON.stringify({ ftpEnabled: false, basePath: '/panel' }));
    const prefix = override || '/panel/';
    const port = await freePort();
    const child = spawn(process.execPath, ['dist/minepanel_main.js'], { cwd: install, env: { ...env, PORT: String(port), ...(override ? { BASE_PATH: override } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    let output = '';
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => output += d);
    try {
      let health;
      for (let i = 0; i < 100; i++) {
        health = await get(port, prefix + 'health').catch(() => null);
        if (health?.status === 200) break;
        if (child.exitCode !== null) assert.fail('Sandbox panel exited before becoming ready');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(health?.status, 200, 'Sandbox panel must become ready');
      assert.equal((await get(port, '/health')).status, 404);
      assert.equal((await get(port, prefix.slice(0, -1))).status, 302);
      assert.equal((await get(port, prefix)).status, 200, 'The canonical base path must not redirect to itself');
      assert.equal((await get(port, prefix + '?source=bookmark')).status, 200, 'Query strings must not trigger a redirect loop');
      const followed = await fetch(`http://127.0.0.1:${port}${prefix.slice(0, -1)}?source=bookmark`);
      assert.equal(followed.status, 200, 'Following the slash redirect must terminate successfully');
      assert.equal(new URL(followed.url).pathname, prefix);
      assert.equal(new URL(followed.url).search, '?source=bookmark');
      for (const route of ['login', 'server/1/files', 'index.html']) {
        const page = await get(port, prefix + route);
        assert.equal(page.status, 200);
        assert.ok(page.body.includes(`<base href="${prefix}" />`));
        const asset = page.body.match(/src="\.\/(assets\/[^\"]+\.js)"/)[1];
        assert.equal((await get(port, prefix + asset)).status, 200);
      }
      assert.equal((await get(port, prefix + 'api/users/me')).status, 401);
      const credentials = fs.readFileSync(path.join(install, 'ADMIN_CREDENTIALS.txt'), 'utf8');
      const login = await fetch(`http://127.0.0.1:${port}${prefix}api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: credentials.match(/Password\s*:\s*(.+)/)[1].trim() }) });
      assert.equal(login.status, 200);
      const { token } = await login.json();
      assert.ok(token, 'Normal login issues a token');
      const settingsUrl = `http://127.0.0.1:${port}${prefix}api/system/settings`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const settings = await (await fetch(settingsUrl, { headers })).json();
      assert.equal(settings.activeBasePath, prefix);
      assert.equal(settings.basePathFromEnvironment, !!override);
      const invalid = await fetch(settingsUrl, { method: 'POST', headers, body: JSON.stringify({ basePath: '/a/../b', ftpEnabled: false }) });
      assert.equal(invalid.status, 400);
      const saved = await fetch(settingsUrl, { method: 'POST', headers, body: JSON.stringify({ basePath: '/next', ftpEnabled: false }) });
      assert.equal(saved.status, 200);
      assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).basePath, '/next/');
      assert.equal((await get(port, prefix + 'health')).status, 200, 'Saving does not change the active path until restart');
      const WebSocket = require('ws');
      await new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}${prefix}ws?serverId=1`);
        const timeout = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket timeout')); }, 5000);
        socket.on('error', reject);
        socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token: 'invalid-token' })));
        socket.on('close', code => { clearTimeout(timeout); try { assert.equal(code, 4001, 'Console retains token validation'); resolve(); } catch (err) { reject(err); } });
      });
    } finally { await stop(child); fs.writeFileSync(settingsFile, previous); }
  });
}
