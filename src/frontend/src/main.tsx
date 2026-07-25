import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './components/Toast.tsx';
import './styles/style.css';
import './styles/global.css';
import './styles/automation-visual.css';

// Self-hosted fonts (no Google Fonts network request)
import '@fontsource/sora/300.css';
import '@fontsource/sora/400.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '@fontsource/fira-code/600.css';

import log from './lib/logger.ts';

// Apply saved accent color on boot
(function() {
  try {
    const a = localStorage.getItem('mp_accent');
    if (a) {
      const m = a.match(/hsl\((\d+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
      if (m) {
        const [,h,s,l] = m;
        const lh = Math.min(100, parseFloat(l) + 8);
        const r = document.documentElement;
        r.style.setProperty('--accent', a);
        r.style.setProperty('--accent-hover', `hsl(${h},${s}%,${lh}%)`);
        r.style.setProperty('--accent-glow', `hsla(${h},${s}%,${l}%,0.15)`);
        r.style.setProperty('--accent-subtle', `hsla(${h},${s}%,${l}%,0.08)`);
        r.style.setProperty('--green', a);
      }
    }
  } catch(e) {}
})();

// ── Boot messages ──────────────────────────────────────────────────────────
log.info('MinePanel frontend initializing...');
log.info(`Build env: ${import.meta.env.MODE} | React ${React.version}`);
log.debug('Accent color restored from localStorage');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
