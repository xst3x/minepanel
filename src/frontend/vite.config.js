import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

// Proxy API + static asset routes to your existing Express backend.
// Backend default port is 8082 (see backend config.js).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8082';

export default defineConfig(({ mode, command }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, root, 'VITE_');
  const demo = (process.env.VITE_DEMO_MODE ?? env.VITE_DEMO_MODE) === 'true';
  const configuredPath = (process.env.VITE_BASE_PATH ?? env.VITE_BASE_PATH ?? '/').trim();
  if (configuredPath.length > 256 || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\/?$|^\/$/.test(configuredPath)) throw new Error('Invalid VITE_BASE_PATH. Use / or a path such as /panel/.');
  const basePath = configuredPath.replace(/\/?$/, '/');
  const proxy = (routes) => Object.fromEntries(routes.map(route => [basePath + route, { target: BACKEND, changeOrigin: true, ...(route === 'ws' ? { ws: true } : {}) }]));
  return {
    // Production assets remain relocatable: Express supplies the runtime <base>.
    base: command === 'build' && !demo ? './' : basePath,
    resolve: { alias: { '#backend': fileURLToPath(new URL(demo ? './src/lib/backend/mock.ts' : './src/lib/backend/real.ts', import.meta.url)) } },
    plugins: [react(), {
      name: 'installation-base-path',
      transformIndexHtml: { order: 'post', handler: html => html.replace('<base href="/" />', `<base href="${basePath}" />`) },
    }, ...(demo ? [{
      name: 'demo-network-isolation',
      transformIndexHtml: { order: 'post', handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: "connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'self'" }, injectTo: 'head-prepend' }] },
      generateBundle() {
        if ([...this.getModuleIds()].some(id => /[\\/]backend[\\/]real\.ts$/.test(id))) this.error('Demo bundle must never include the real backend provider');
      },
    }] : [])],
    server: {
      port: 5173,
      historyApiFallback: true,
      proxy: demo ? {} : proxy(['api', 'ws', 'avatars', 'js']),
    },
    // Preview serves compiled assets locally; only runtime endpoints need a proxy.
    preview: {
      proxy: demo ? {} : proxy(['api', 'ws', 'avatars', 'js']),
    },
    build: {
      ...(demo ? { modulePreload: { polyfill: false } } : {}),
      outDir: demo ? 'dist-demo' : '../public',
      // Retain Vite 5's browser coverage after the security upgrade.
      target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
      emptyOutDir: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'codemirror-core': [
              '@codemirror/state', '@codemirror/view', '@codemirror/commands',
              '@codemirror/language', '@codemirror/theme-one-dark',
            ],
            'codemirror-langs': [
              '@codemirror/lang-javascript', '@codemirror/lang-css',
              '@codemirror/lang-html', '@codemirror/lang-json',
              '@codemirror/lang-xml', '@codemirror/lang-yaml',
              '@codemirror/lang-java', '@codemirror/lang-python',
            ],
          },
        },
      },
    },
  };
});
