import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../lib/api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return; }
    try {
      const me = await api('/api/users/me');
      setUser(me?.user || me || null);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (username, password, twoFactorCode) => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password, twoFactorCode },
    });
    if (res?.token) setToken(res.token);
    await refresh();
    return res;
  };

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
