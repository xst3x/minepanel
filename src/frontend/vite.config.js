import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + static asset routes to your existing Express backend.
// Backend default port is 8082 (see backend config.js).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8082';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    historyApiFallback: true,
    proxy: {
      '/api':     { target: BACKEND, changeOrigin: true, ws: true },
      '/ws':      { target: BACKEND, changeOrigin: true, ws: true },
      '/assets':  { target: BACKEND, changeOrigin: true },
      '/avatars': { target: BACKEND, changeOrigin: true },
      '/js':      { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: '../public',
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
});
