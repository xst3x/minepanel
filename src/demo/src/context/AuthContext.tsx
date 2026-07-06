import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { setToken } from '../lib/api.js';

const AuthCtx = createContext(null);

const DEMO_LOGGED_OUT_KEY = 'mp_demo_logged_out';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const initialLoadRef = useRef(true);

  const refresh = useCallback(async (skipAutoLogin = false) => {
    const token = localStorage.getItem('mp_token');
    const loggedOut = localStorage.getItem(DEMO_LOGGED_OUT_KEY) === 'true';

    if (!token && !skipAutoLogin && !loggedOut && initialLoadRef.current) {
      // Auto-login as Admin only on first mount if not logged out
      localStorage.setItem('mp_token', 'demo-token-abc123');
    }

    const newToken = localStorage.getItem('mp_token');
    if (!newToken) {
      setUser(null);
      setReady(true);
      return;
    }

    try {
      const me = await api('/api/users/me');
      setUser(me?.user || me || null);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
      initialLoadRef.current = false;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (username, password, twoFactorCode) => {
    localStorage.removeItem(DEMO_LOGGED_OUT_KEY);
    initialLoadRef.current = false;
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password, twoFactorCode },
    });
    if (res?.token) setToken(res.token);
    await refresh(true);
    return res;
  };

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setToken(null);
    setUser(null);
    localStorage.setItem(DEMO_LOGGED_OUT_KEY, 'true');
    initialLoadRef.current = false;
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
