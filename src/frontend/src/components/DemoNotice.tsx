import { useEffect, useState } from 'react';
import { demoMode } from '../lib/api';
import { INSTALL_URL, DEMO_MESSAGE } from '../lib/backend/restrictions';
import ModalOverlay from './ModalOverlay';

export default function DemoNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!demoMode) return;
    const show = () => setOpen(true);
    window.addEventListener('minepanel:demo-unavailable', show);
    return () => window.removeEventListener('minepanel:demo-unavailable', show);
  }, []);
  if (!demoMode) return null;
  return <>
    <div role="note" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1rem', padding: '0.5rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
      <span className="status-badge">Demo Mode</span>
      <span>Simulated data · Frontend only · No Minecraft server connected</span>
      <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer">Get MinePanel</a>
    </div>
    {open && <ModalOverlay className="modal-overlay active" style={{ zIndex: 12000 }} onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Full installation required" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Explore the full version</h3><button className="close-btn" aria-label="Close dialog" onClick={() => setOpen(false)}>×</button></div>
        <div className="modal-body"><p>{DEMO_MESSAGE}</p><p className="text-muted">This demo uses local sample data. Nothing has been changed on a real server.</p></div>
        <div className="modal-footer"><button className="btn outline" onClick={() => setOpen(false)}>Keep exploring</button><a className="btn primary" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">Get MinePanel</a></div>
      </div>
    </ModalOverlay>}
  </>;
}
