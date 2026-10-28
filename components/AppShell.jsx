'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import LoginScreen from './LoginScreen';

const SessionContext = createContext({ name: '', role: 'staff', signOut: () => {} });
export const useSession = () => useContext(SessionContext);

// すべての画面の外枠。ログインしていなければログイン画面を出す。
export default function AppShell({ children }) {
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState('');

  const check = useCallback(() => {
    api('/api/auth/status')
      .then((a) => { setAuth(a); setError(''); })
      .catch((e) => { setError(e.message); setAuth({ authenticated: false }); });
  }, []);
  useEffect(check, [check]);

  const signOut = useCallback(async ({ silent = false } = {}) => {
    if (!silent) await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuth({ authenticated: false });
  }, []);

  if (!auth) return <main className="page"><p className="muted">読み込んでいます…</p></main>;
  if (!auth.authenticated) return <LoginScreen startupError={error} onDone={check} />;

  return (
    <SessionContext.Provider value={{ name: auth.name, role: auth.role, signOut }}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">GARAGE EVE.RYN</span>
            <span className="brand-title">車検誘発ボード</span>
          </div>
          <div className="who">
            <span className="name">{auth.name}</span>
            <button type="button" className="btn ghost small" onClick={() => signOut()}>ログアウト</button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </SessionContext.Provider>
  );
}
