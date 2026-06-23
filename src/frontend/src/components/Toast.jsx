import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import '../styles/components/Toast.css';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

let _toastFn = null;
let _toastProgressFn = null;
let _confirmFn = null;
let _promptFn = null;

export function toast(message, type = 'info') {
  if (_toastFn) _toastFn(message, type);
  else console.warn('[toast]', type, message);
}

/**
 * Show a persistent toast with an animated progress bar.
 * Returns a dismiss() function — call it when the operation finishes.
 * Call dismiss('error message') to turn it into an error toast.
 * Call dismiss(null, 'success message') to turn it into a success toast.
 */
export function toastProgress(message) {
  if (_toastProgressFn) return _toastProgressFn(message);
  return () => {};
}

export function showConfirm(message, title = 'Confirm') {
  if (_confirmFn) return _confirmFn(message, title);
  return Promise.resolve(window.confirm(message));
}

export function showPrompt(message, defaultValue = '', title = 'Input') {
  if (_promptFn) return _promptFn(message, defaultValue, title);
  const result = window.prompt(message, defaultValue);
  return Promise.resolve(result);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [progressToasts, setProgressToasts] = useState([]); // { id, message }
  const [confirm, setConfirm] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const idRef = useRef(0);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const addProgressToast = useCallback((message) => {
    const id = ++idRef.current;
    setProgressToasts(prev => [...prev, { id, message }]);
    // Returns a dismiss function
    return (errorMsg, successMsg) => {
      setProgressToasts(prev => prev.filter(t => t.id !== id));
      if (errorMsg) addToast(errorMsg, 'error');
      else if (successMsg) addToast(successMsg, 'success');
    };
  }, [addToast]);

  const openConfirm = useCallback((message, title) => {
    return new Promise(resolve => {
      setConfirm({ message, title: title || 'Confirm', resolve });
    });
  }, []);

  const openPrompt = useCallback((message, defaultValue, title) => {
    return new Promise(resolve => {
      setPromptValue(defaultValue || '');
      setPrompt({ message, title: title || 'Input', resolve });
    });
  }, []);

  useEffect(() => {
    _toastFn = addToast;
    _toastProgressFn = addProgressToast;
    _confirmFn = openConfirm;
    _promptFn = openPrompt;
    return () => { _toastFn = null; _toastProgressFn = null; _confirmFn = null; _promptFn = null; };
  }, [addToast, addProgressToast, openConfirm, openPrompt]);

  const handleConfirm = (result) => { if (confirm) confirm.resolve(result); setConfirm(null); };
  const handlePromptSubmit = () => { if (prompt) prompt.resolve(promptValue); setPrompt(null); };
  const handlePromptCancel = () => { if (prompt) prompt.resolve(null); setPrompt(null); };

  // Left-border color matching the old style.css exactly:
  // success → var(--green)  |  error → var(--red)  |  info/warning → var(--accent)
  const borderFor = (type) => {
    if (type === 'success') return 'var(--green)';
    if (type === 'error')   return 'var(--red)';
    if (type === 'warning') return 'hsl(45,95%,55%)';
    return 'var(--accent)';
  };

  return (
    <ToastContext.Provider value={{ toast: addToast, confirm: openConfirm }}>
      {children}

      {/* ── Toasts ── */}
      <div style={{
        position: 'fixed', bottom: '2rem', right: '2rem',
        zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.6rem',
        pointerEvents: 'none',
      }}>
        {/* Progress toasts (persistent, with indeterminate bar) */}
        {progressToasts.map(t => (
          <div key={t.id} style={{
            pointerEvents: 'auto',
            display: 'flex', flexDirection: 'column', gap: '0.55rem',
            padding: '0.85rem 1.35rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--accent)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            boxShadow: 'var(--shadow-md)',
            minWidth: 280, maxWidth: 420,
            animation: 'toastIn 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <span>{t.message}</span>
            <div style={{ height: '3px', borderRadius: '2px', background: 'var(--bg-input)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: 'var(--accent)',
                borderRadius: '2px',
                animation: 'progressSlide 1.6s ease-in-out infinite',
              }} />
            </div>
          </div>
        ))}
        {/* Regular toasts */}
        {toasts.map(t => (
          <div key={t.id} style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.85rem 1.35rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${borderFor(t.type)}`,
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            boxShadow: 'var(--shadow-md)',
            minWidth: 280, maxWidth: 420,
            animation: 'toastIn 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 18, lineHeight: 1, flexShrink: 0, marginLeft: 4 }}
            >×</button>
          </div>
        ))}
      </div>

      {/* ── Confirm dialog ── */}
      {confirm && (
        <div className="modal-overlay active" onClick={() => handleConfirm(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirm.title}</h3>
              <button className="close-btn" onClick={() => handleConfirm(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{confirm.message}</p>
            </div>
            <div className="modal-footer">
              <button className="btn outline" onClick={() => handleConfirm(false)}>Cancel</button>
              <button className="btn primary" onClick={() => handleConfirm(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt dialog ── */}
      {prompt && (
        <div className="modal-overlay active" style={{ zIndex: 10001 }} onClick={handlePromptCancel}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{prompt.title}</h3>
              <button className="close-btn" onClick={handlePromptCancel}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{prompt.message}</p>
              <input
                type="text"
                value={promptValue}
                onChange={e => setPromptValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handlePromptSubmit(); if (e.key === 'Escape') handlePromptCancel(); }}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn outline" onClick={handlePromptCancel}>Cancel</button>
              <button className="btn primary" onClick={handlePromptSubmit}>OK</button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
