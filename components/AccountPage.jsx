'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './AppShell';

const MIN = 8;

function PasswordFields({ prefix, next, confirm, setNext, setConfirm, show }) {
  return (
    <>
      <label className="field" htmlFor={`${prefix}-next`}>
        <span className="label">新しいパスワード（{MIN}文字以上）</span>
        <input id={`${prefix}-next`} className="input" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={MIN} maxLength={72}
          value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="field" htmlFor={`${prefix}-confirm`}>
        <span className="label">新しいパスワード（確認）</span>
        <input id={`${prefix}-confirm`} className="input" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={MIN} maxLength={72}
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
    </>
  );
}

function OwnPassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setDone(false);
    if (next !== confirm) { setError('新しいパスワードが確認用と一致しません。'); return; }
    setBusy(true);
    try {
      await api('/api/account/password', { method: 'POST', body: { current, next, confirm } });
      setCurrent(''); setNext(''); setConfirm(''); setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>自分のパスワードを変更</h2>
      <p className="small muted" style={{ margin: 0 }}>
        会員システム・車検シミュレーター管理画面と同じアカウントなので、そちらのパスワードも変わります。
        ほかの端末でこのアプリにログインしている場合は、ログアウトされます。
      </p>
      {error && <div className="error" role="alert">{error}</div>}
      {done && <div className="done" role="status">パスワードを変更しました。次回から新しいパスワードでログインしてください。</div>}
      <label className="field" htmlFor="own-current">
        <span className="label">今のパスワード</span>
        <input id="own-current" className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <PasswordFields prefix="own" next={next} confirm={confirm} setNext={setNext} setConfirm={setConfirm} />
      <div><button type="submit" className="btn primary" disabled={busy}>{busy ? '変更しています…' : 'パスワードを変更'}</button></div>
    </form>
  );
}

/** 読み間違えやすい文字（0/O, 1/l/I）を除いた 12 文字 */
function makePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

function StaffPassword() {
  const [staff, setStaff] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [id, setId] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    api('/api/staff').then((d) => setStaff(d.staff)).catch((e) => setLoadError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(''); setDone('');
    if (!id) { setError('スタッフを選んでください。'); return; }
    if (next !== confirm) { setError('新しいパスワードが確認用と一致しません。'); return; }
    setBusy(true);
    try {
      const r = await api(`/api/staff/${id}/password`, { method: 'POST', body: { next, confirm } });
      setDone(`${r.name}さんのパスワードを変更しました。新しいパスワードを本人に伝えてください。`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function generate() {
    const p = makePassword();
    setNext(p); setConfirm(p); setShow(true); setDone('');
  }

  const others = (staff || []).filter((s) => !s.self);

  return (
    <form className="card" onSubmit={submit}>
      <h2>スタッフのパスワードを再設定（管理者）</h2>
      <p className="small muted" style={{ margin: 0 }}>
        パスワードを忘れたスタッフ用です。今のパスワードは不要です。変更すると、そのスタッフはこのアプリからログアウトされます。
        会員システム・車検シミュレーター管理画面のパスワードも同じく変わります。
      </p>
      {loadError && <div className="error" role="alert">{loadError}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      {done && <div className="done" role="status">{done}</div>}
      <label className="field" htmlFor="staff-id">
        <span className="label">スタッフ</span>
        <select id="staff-id" className="select" required value={id} onChange={(e) => { setId(e.target.value); setDone(''); setError(''); }} disabled={!staff}>
          <option value="">{staff ? '選んでください' : '読み込んでいます…'}</option>
          {others.map((s) => <option key={s.id} value={s.id}>{s.name || '（名前なし）'}　{s.email}</option>)}
        </select>
      </label>
      <PasswordFields prefix="staff" next={next} confirm={confirm} setNext={setNext} setConfirm={setConfirm} show={show} />
      <div className="row">
        <button type="button" className="btn small" onClick={generate}>パスワードを自動で作る</button>
        <label className="small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> 入力内容を表示</label>
      </div>
      <div><button type="submit" className="btn primary" disabled={busy || !staff}>{busy ? '変更しています…' : 'パスワードを再設定'}</button></div>
    </form>
  );
}

export default function AccountPage() {
  const { name, role } = useSession();
  return (
    <div className="account">
      <h1>アカウント</h1>
      <p className="small muted" style={{ margin: 0 }}>{name} さんでログイン中</p>
      <OwnPassword />
      {role === 'admin' && <StaffPassword />}
    </div>
  );
}
