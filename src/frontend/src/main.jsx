import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './styles/style.css';

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
