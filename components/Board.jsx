'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useSession } from './AppShell';
import Detail from './Detail';
import Plate from './Plate';
import { STATUSES } from '@/lib/shared/constants';
import { jpDate, shortDate } from '@/lib/shared/dates';
import { bucket, daysLeft, isClosed, isDue, needsAction, severity } from '@/lib/shared/view';

const TILES = [
  { id: 'todo', label: '要対応', dot: 'late' },
  { id: 'over', label: '期限切れ', dot: 'late' },
  { id: 'd30', label: '30日以内', dot: 'warn' },
  { id: 'd60', label: '31〜60日', dot: 'navy' },
  { id: 'd90', label: '61〜90日', dot: 'good' },
  { id: 'all', label: 'すべて', dot: 'muted' },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Board() {
  const { signOut } = useSession();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tile, setTile] = useState('todo');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [staff, setStaff] = useState('');
  const [openNo, setOpenNo] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(showToast.t);
    showToast.t = window.setTimeout(() => setToast(''), 2600);
  }, []);

  const onApiError = useCallback((e) => {
    if (e?.status === 401) { signOut({ silent: true }); return; }
    showToast(e.message);
  }, [signOut, showToast]);

  const load = useCallback(async () => {
    try {
      setData(await api('/api/board'));
      setLoadError('');
    } catch (e) {
      if (e?.status === 401) { signOut({ silent: true }); return; }
      setLoadError(e.message);
    }
  }, [signOut]);
  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const today = data?.today;

  const counts = useMemo(() => {
    const c = { todo: 0, over: 0, d30: 0, d60: 0, d90: 0, all: items.length };
    for (const it of items) {
      c[bucket(daysLeft(it, today))] += 1;
      if (needsAction(it, today)) c.todo += 1;
    }
    return c;
  }, [items, today]);

  const staffNames = useMemo(
    () => [...new Set(items.map((i) => i.sales_staff).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')),
    [items],
  );

  const rows = useMemo(() => {
    const kw = query.trim().toLowerCase().replace(/\s+/g, '');
    return items
      .filter((it) => {
        const d = daysLeft(it, today);
        if (tile === 'todo' && !needsAction(it, today)) return false;
        if (!['todo', 'all'].includes(tile) && bucket(d) !== tile) return false;
        if (status && it.status !== status) return false;
        if (staff && it.sales_staff !== staff) return false;
        if (kw) {
          const hay = [it.customer_name, it.customer_kana, it.maker, it.car_name, it.grade, it.plate_area, it.plate_class, it.plate_kana, it.plate_number, it.tel, it.mobile]
            .join('').toLowerCase().replace(/\s+/g, '');
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => a.shkn_day.localeCompare(b.shkn_day) || a.car_no.localeCompare(b.car_no));
  }, [items, today, tile, status, staff, query]);

  const openItem = items.find((i) => i.car_no === openNo) || null;

  const patchItem = useCallback((carNo, fields) => {
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.car_no === carNo ? { ...i, ...fields } : i)) } : d));
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api('/api/sync', { method: 'POST' });
      showToast(r.mode === 'sample' ? 'サンプルデータを確認しました' : `ジョーカーから${r.fetched}台を取り込みました`);
    } catch (e) {
      onApiError(e);
    } finally {
      setSyncing(false);
      load();
    }
  }

  if (!data) {
    return loadError
      ? <div className="notice fail"><span>{loadError}</span><button type="button" className="btn small" onClick={load}>もう一度読み込む</button></div>
      : <p className="muted">一覧を読み込んでいます…</p>;
  }

  const run = data.lastSync;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="small muted">本日 {jpDate(today)}</div>
          <div className="small muted">満了日が過去60日〜90日先の保有車両</div>
        </div>
        <div className="syncbar">
          <span>
            {run?.finished_at ? `最終更新 ${fmtDateTime(run.finished_at)}${run.ok ? '' : '（失敗）'}` : run ? '更新中…' : 'まだ更新していません'}
          </span>
          <button type="button" className="btn small" onClick={syncNow} disabled={syncing}>{syncing ? '更新中…' : '今すぐ更新'}</button>
        </div>
      </div>

      {data.mode === 'sample' && (
        <div className="notice sample" role="note">
          <span><b>サンプルデータで表示中。</b>表示中の顧客・車両はすべて架空です。ジョーカーの API キーを設定すると、毎朝6時に本番データへ自動で入れ替わります。</span>
        </div>
      )}
      {run && run.ok === false && <div className="notice fail" role="alert">前回の更新に失敗しました：{run.error}</div>}

      <div className="summary">
        {TILES.map((t) => (
          <button key={t.id} type="button" className="tile" aria-pressed={tile === t.id} onClick={() => setTile(t.id)}>
            <span className="lbl"><span className={`dot ${t.dot}`} />{t.label}</span>
            <span className="n">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <input className="input" type="search" placeholder="顧客名・カナ・車名・ナンバー・電話番号で検索" aria-label="検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" aria-label="ステータスで絞り込み" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">すべてのステータス</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="select" aria-label="担当者で絞り込み" value={staff} onChange={(e) => setStaff(e.target.value)}>
          <option value="">全担当者</option>
          {staffNames.map((n) => <option key={n}>{n}</option>)}
        </select>
        <span className="count">{rows.length}件を表示</span>
      </div>

      <div className="list">
        {rows.length === 0 && <div className="empty">{tile === 'todo' ? '要対応の顧客はいません。' : '条件に合う顧客はいません。'}</div>}
        {rows.map((it) => {
          const d = daysLeft(it, today);
          return (
            <button key={it.car_no} type="button" className="item" onClick={() => setOpenNo(it.car_no)}>
              <span className={`days ${severity(d)}`}>
                <span className="n">{d < 0 ? `+${-d}` : d}</span>
                <span className="u">{d < 0 ? '日超過' : '日'}</span>
              </span>
              <span className="pl"><Plate item={it} /></span>
              <span className="car">
                <div className="m">{it.maker} {it.car_name}</div>
                <div className="sub">{[it.grade, it.model_year ? `${it.model_year.slice(0, 4)}年式` : '', it.mileage_km ? `${it.mileage_km.toLocaleString()}km` : ''].filter(Boolean).join(' ・ ')}</div>
                <div className="sub">満了 {jpDate(it.shkn_day)}</div>
              </span>
              <span className="cust">
                <div style={{ fontWeight: 500 }}>{it.customer_name ? `${it.customer_name} 様` : '保有者未設定'}</div>
                <div className="chips">
                  <span className={`chip ${it.prefer_tel ? 'on' : ''}`}>電話</span>
                  <span className={`chip ${it.prefer_mail ? 'on' : ''}`}>メール</span>
                  {it.dm_kbn === '2' && <span className="chip">DM不要</span>}
                  {it.sales_staff && <span className="chip">担当 {it.sales_staff}</span>}
                </div>
              </span>
              <span className="stat">
                <span className={`pill ${it.status}`}>{STATUS_LABEL[it.status]}</span>
                {isDue(it, today) && <span className="due">再連絡予定 {shortDate(it.next_contact_on)}</span>}
                {!isDue(it, today) && it.next_contact_on && !isClosed(it) && <span className="sub">次回 {shortDate(it.next_contact_on)}</span>}
                {it.last_contact && <span className="sub">最終 {shortDate(new Date(new Date(it.last_contact.at).getTime() + 9 * 3600_000).toISOString())} {it.last_contact.method}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {data.refused > 0 && <p className="xs muted">ジョーカーで案内送付区分が「拒否」の顧客 {data.refused}件は一覧に出していません。</p>}

      {openItem && (
        <Detail
          key={`${openItem.car_no}|${openItem.shkn_day}`}
          item={openItem}
          today={today}
          onClose={() => setOpenNo(null)}
          onChanged={(fields) => patchItem(openItem.car_no, fields)}
          onConflict={load}
          onApiError={onApiError}
          toast={showToast}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
