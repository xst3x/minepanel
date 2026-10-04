// A watched static build intentionally has no Vite HMR socket or backend proxy.
import { build, preview } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../src/frontend', import.meta.url));
process.env.VITE_DEMO_MODE = 'true';
const outDir = fileURLToPath(new URL('../dist-demo', import.meta.url));
const watcher = await build({ root, mode: 'demo', build: { watch: {}, outDir } });
let server;
watcher.on('event', async event => {
  if (event.code === 'ERROR') console.error(event.error);
  if (event.code !== 'BUNDLE_END') return;
  await event.result.close();
  if (!server) {
    server = await preview({ root, mode: 'demo', build: { outDir }, preview: { port: 5173, strictPort: true, host: '127.0.0.1' } });
    server.printUrls();
  } else console.log('Demo rebuilt. Refresh the browser to see changes.');
});
async function close() { await watcher.close(); server?.httpServer.close(); process.exit(); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
