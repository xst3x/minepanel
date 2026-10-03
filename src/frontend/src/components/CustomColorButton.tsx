/** Shared custom-color trigger for accent and MOTD palettes. */
export default function CustomColorButton({ onClick, label }) {
  return (
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                <button
                  type="button"
                  title="Custom color"
                  aria-label={label}
                  onClick={onClick}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'transparent',
                    cursor: 'pointer', padding: 0,
                    border: '2px dashed var(--border-hover)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)',
                    transition: 'all 0.18s ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Custom</span>
              </div>
  );
}
