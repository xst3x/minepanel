import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, accountStorageKey } from '../lib/api.ts';

const AuthCtx = createContext(null);

// Saved accounts backing the account switcher. Each entry pairs the JWT with
// the username it belongs to so the switcher can render without extra requests.
// The active account's token is mirrored into the regular `mp_token` slot used
// by the API client, so switching is just a matter of swapping that value.
const ACCOUNTS_KEY = accountStorageKey;
const MAX_ACCOUNTS = 8;

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(a => a && typeof a.token === 'string' && a.token && typeof a.username === 'string' && a.username);
  } catch {
    return [];
  }
}

function persistAccounts(list) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState(loadAccounts);
  const [activeToken, setActiveToken] = useState(() => getToken());

  // Add or refresh a saved account (deduped by token and by username so
  // re-logging into the same account replaces its stale token).
  const upsertAccount = useCallback((token, username) => {
    if (!token || !username) return;
    setAccounts(prev => {
      const next = prev.filter(a => a.token !== token && a.username !== username);
      next.push({ token, username });
      persistAccounts(next.slice(-MAX_ACCOUNTS));
      return next.slice(-MAX_ACCOUNTS);
    });
  }, []);

  const dropAccount = useCallback((token) => {
    setAccounts(prev => {
      const next = prev.filter(a => a.token !== token);
      persistAccounts(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) { setUser(null); setActiveToken(null); setReady(true); return null; }
    try {
      const me = await api('/api/users/me');
      const u = me?.user || me || null;
      setUser(u);
      setActiveToken(token);
      if (u?.username) upsertAccount(token, u.username);
      return u;
    } catch {
      setToken(null);
      setUser(null);
      setActiveToken(null);
      return null;
    } finally {
      setReady(true);
    }
  }, [upsertAccount]);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (username, password, twoFactorCode) => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password, totpCode: twoFactorCode },
    });
    if (!res?.token) {
      // 2FA challenge: the backend asks for a code before issuing a token.
      // Surface it as an error so the login screen reveals the code field.
      const err = new Error('Two-factor authentication required.') as Error & { data: { requires2FA: boolean } };
      err.data = { requires2FA: true };
      throw err;
    }
    setToken(res.token);
    setActiveToken(res.token);
    upsertAccount(res.token, res.username || username);
    setUser(null);
    setReady(false);
    await refresh();
    return res;
  };

  // Switch the active session to a saved account in one call.
  const switchAccount = useCallback(async (token) => {
    if (!token) return false;
    if (token === getToken()) return true;
    const target = loadAccounts().find(a => a.token === token);
    if (!target) return false;
    const fallback = getToken();
    setToken(token);
    setUser(null);
    setReady(false);
    const u = await refresh();
    if (u) return true;
    // Stored token is no longer valid — forget it and fall back if possible.
    dropAccount(token);
    if (fallback) { setToken(fallback); await refresh(); }
    return false;
  }, [refresh, dropAccount]);

  const removeAccount = useCallback(async (token) => {
    const remaining = loadAccounts().filter(a => a.token !== token);
    dropAccount(token);
    if (token !== getToken()) return;
    if (remaining.length) {
      await switchAccount(remaining[0].token);
    } else {
      setToken(null);
      setUser(null);
      setActiveToken(null);
      setReady(true);
    }
  }, [dropAccount, switchAccount]);

  const logout = async () => {
    const token = getToken();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    // Logging out revokes the session server-side, so forget that account.
    if (token) dropAccount(token);
    setToken(null);
    setUser(null);
    setActiveToken(null);
    setReady(true);
  };

  return (
    <AuthCtx.Provider value={{
      user, ready, login, logout, refresh, setUser,
      accounts, activeToken, switchAccount, removeAccount,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
