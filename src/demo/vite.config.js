import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Demo mode — fully static, no proxy, no backend required.
// Built files go to ./dist and can be deployed to GitHub Pages directly.
export default defineConfig({
  plugins: [react()],
  base: '/minepanel/',
  server: {
    port: 5173,
    historyApiFallback: true,
  },
  build: {
    outDir: 'dist',
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
