'use client';
// Session + toast context shared by every page.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post } from '@/lib/client.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function Providers({ children }) {
  const [user, setUser] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const me = await get('/api/auth/me');
      setUser(me.user);
      setCartCount(me.cartCount ?? 0);
      setUnread(me.unread ?? 0);
    } catch {
      setUser(null);
      setCartCount(0);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toast = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const logout = useCallback(async () => {
    await post('/api/auth/logout').catch(() => {});
    setUser(null);
    setCartCount(0);
    window.location.href = '/';
  }, []);

  return (
    <Ctx.Provider value={{ user, cartCount, setCartCount, unread, setUnread, ready, refresh, toast, logout }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </Ctx.Provider>
  );
}
