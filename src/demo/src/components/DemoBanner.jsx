import { useState, useEffect } from 'react';
import { DEMO_WARNINGS, getRestrictionInfo } from '../services/demoRestrictions.js';

// ── Global banner shown at the top of the app ────────────────────────────────
export function DemoGlobalBanner() {
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('mp_demo_banner_dismissed') === 'true'
  );

  if (!visible || dismissed) return null;

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('mp_demo_banner_dismissed', 'true');
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      color: '#000',
      padding: '10px 16px',
      textAlign: 'center',
      fontSize: '0.82rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      position: 'relative',
      zIndex: 9999,
      flexWrap: 'wrap',
    }}>
      <span>⚠️ {DEMO_WARNINGS.general}</span>
      <a
        href="https://github.com/xst3x/minepanel"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#000',
          textDecoration: 'underline',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        Download Full Version ↗
      </a>
      <button
        onClick={handleDismiss}
        style={{
          background: 'rgba(0,0,0,0.15)',
          border: 'none',
          borderRadius: '4px',
          color: '#000',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: '0.75rem',
          fontWeight: 600,
          marginLeft: '8px',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

// ── Demo watermark for the dashboard ─────────────────────────────────────────
export function DemoWatermark() {
  return (
    <div style={{
      position: 'fixed',
      bottom: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9998,
      pointerEvents: 'none',
      fontSize: '0.65rem',
      color: 'var(--text-muted)',
      opacity: 0.5,
      fontWeight: 500,
      letterSpacing: '0.04em',
      textAlign: 'center',
    }}>
      DEMO BUILD · Full version at github.com/xst3x/minepanel
    </div>
  );
}

// ── Show a toast-style demo restriction warning ──────────────────────────────
let restrictionToastFn = null;
export function setRestrictionToastFn(fn) {
  restrictionToastFn = fn;
}

export function showRestrictionWarning(featureKey) {
  const info = getRestrictionInfo(featureKey);
  const msg = `${info.message} Download the full version at github.com/xst3x/minepanel`;
  if (restrictionToastFn) {
    restrictionToastFn(msg, 'warning');
  } else {
    alert(msg);
  }
  return false;
}

// ── Demo badge for cards ──────────────────────────────────────────────────────
export function DemoBadge({ text = 'DEMO' }) {
  return (
    <span style={{
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      background: 'var(--warning)',
      color: '#000',
      border: '1px solid rgba(0,0,0,0.2)',
      textTransform: 'uppercase',
    }}>
      {text}
    </span>
  );
}

export default DemoGlobalBanner;
