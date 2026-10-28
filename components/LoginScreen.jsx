'use client';
import { useState } from 'react';
import { api } from './api';

export default function LoginScreen({ startupError, onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(startupError || '');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setPassword('');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">GARAGE EVE.RYN</span>
          <h1>車検誘発ボード</h1>
        </div>
        <p className="small muted" style={{ margin: 0 }}>会員システムのスタッフ用メールアドレスとパスワードでログインします。</p>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="field" htmlFor="email">
          <span className="label">メールアドレス</span>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field" htmlFor="password">
          <span className="label">パスワード</span>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? '確認しています…' : 'ログイン'}</button>
      </form>
    </main>
  );
}
