'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useSession } from './AppShell';
import BookingPanel from './BookingPanel';
import { STORES, WORK_TYPES } from '@/lib/shared/constants';
import { addDays, jpDate, shortDate } from '@/lib/shared/dates';
import { isDeliveryOverdue, isInShop, normalizeWorkType, progress, seibiArrival } from '@/lib/shared/nyuko';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const dow = (iso) => WEEK[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const hm = (v) => (/^\d{4}$/.test(v || '') ? `${v.slice(0, 2)}:${v.slice(2)}` : v || '');

const TILES = [
  { id: 'schedule', label: '入庫予定（2週間）', dot: 'navy' },
  { id: 'today', label: '本日の入庫', dot: 'navy' },
  { id: 'inshop', label: '入庫中', dot: 'warn' },
  { id: 'overdue', label: '納車予定超過', dot: 'late' },
  { id: 'attention', label: '要確認', dot: 'late' },
  { id: 'member', label: '会員アプリ予約', dot: 'good' },
];

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 予約・予約なし入庫を同じ形にそろえる */
function toEntries(data) {
  const today = data.today;
  const fromBookings = data.items.map((b) => {
    const p = progress(b, b.seibi, today);
    return {
      key: `b:${b.id}`, kind: 'booking', booking: b, seibi: b.seibi, p,
      date: b.planned_date, time: b.planned_time,
      plate: b.plate || b.seibi?.plate || '', maker: b.maker || b.seibi?.maker || '', car: b.car_name || b.seibi?.car_name || '',
      customer: b.customer_name || b.seibi?.customer_name || '',
      workType: b.work_type, detail: b.work_detail || b.seibi?.work_sub || '',
      store: b.store, loaner: b.loaner || Boolean(b.seibi?.loaner_out_day),
      workStaff: b.seibi?.work_staff || b.work_staff, salesStaff: b.seibi?.sales_staff || b.sales_staff,
      deliveryDue: b.seibi?.nsh_y_day || b.return_planned_date, hold: b.hold_reason,
      overdue: isDeliveryOverdue(b, b.seibi, today),
    };
  });
  const walkIns = data.walkIns.map((s) => {
    const p = progress(null, s, today);
    return {
      key: `s:${s.seibi_no}`, kind: 'walkin', booking: null, seibi: s, p,
      date: seibiArrival(s), time: hm(s.nko_y_time),
      plate: s.plate, maker: s.maker, car: s.car_name, customer: s.customer_name,
      workType: normalizeWorkType(s.work_type), detail: s.work_sub, store: '', loaner: Boolean(s.loaner_out_day),
      workStaff: s.work_staff, salesStaff: s.sales_staff, deliveryDue: s.nsh_y_day, hold: '',
      overdue: isDeliveryOverdue(null, s, today),
    };
  });
  return [...fromBookings, ...walkIns];
}

export default function NyukoBoard() {
  const { signOut } = useSession();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tile, setTile] = useState('schedule');
  const [workType, setWorkType] = useState('');
  const [store, setStore] = useState('');
  const [workStaff, setWorkStaff] = useState('');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState(null); // {mode:'new', prefill} | {mode:'edit', id} | {mode:'walkin', seibiNo}
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
      setData(await api('/api/nyuko'));
      setLoadError('');
    } catch (e) {
      if (e?.status === 401) { signOut({ silent: true }); return; }
      setLoadError(e.message);
    }
  }, [signOut]);
  useEffect(() => { load(); }, [load]);

  // URL から開く：?booking=<id>（誘発ボードから）／?from=yuhatsu&car=..&shkn=..（誘発から新規予約）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('booking')) setPanel({ mode: 'edit', id: p.get('booking') });
    else if (p.get('from') === 'yuhatsu' && p.get('car') && p.get('shkn')) {
      setPanel({ mode: 'new', prefill: { source: 'yuhatsu', car_no: p.get('car'), shkn_day: p.get('shkn'), work_type: '車検' } });
    }
    if (p.toString()) window.history.replaceState(null, '', '/nyuko');
  }, []);

  const today = data?.today;
  const entries = useMemo(() => (data ? toEntries(data) : []), [data]);

  const filtered = useMemo(() => {
    const kw = query.trim().toLowerCase().replace(/\s+/g, '');
    return entries.filter((e) => {
      if (workType && e.workType !== workType) return false;
      if (store && e.store !== store) return false;
      if (workStaff && e.workStaff !== workStaff) return false;
      if (kw && !(e.customer + e.plate + e.maker + e.car + (e.booking?.phone || e.seibi?.phone || '')).toLowerCase().replace(/\s+/g, '').includes(kw)) return false;
      return true;
    });
  }, [entries, workType, store, workStaff, query]);

  const views = useMemo(() => {
    if (!today) return {};
    const end = addDays(today, 13);
    const booked = (e) => e.kind === 'booking' && e.booking.state === 'booked';
    return {
      schedule: filtered.filter((e) => e.kind === 'booking' && e.date >= today && e.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99')),
      today: filtered.filter((e) => e.date === today && (e.kind === 'walkin' || e.booking.state !== 'cancelled'))
        .sort((a, b) => (a.time || '99').localeCompare(b.time || '99')),
      inshop: filtered.filter((e) => isInShop(e.p) && (e.kind === 'walkin' || booked(e)))
        .sort((a, b) => (a.deliveryDue || '9999').localeCompare(b.deliveryDue || '9999')),
      overdue: filtered.filter((e) => e.overdue && (e.kind === 'walkin' || booked(e)))
        .sort((a, b) => (a.deliveryDue || '').localeCompare(b.deliveryDue || '')),
      attention: filtered.filter((e) => booked(e) && (e.p.key === 'missing' || (!e.booking.car_no && e.date <= today)))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [filtered, today]);

  const memberApp = useMemo(() => {
    const kw = query.trim().toLowerCase().replace(/\s+/g, '');
    return (data?.memberApp || []).filter((r) => (!workType || r.work_type === workType)
      && (!kw || (r.customer_name + r.plate + r.maker + r.car_name).toLowerCase().replace(/\s+/g, '').includes(kw)));
  }, [data, workType, query]);

  const workNames = useMemo(() => [...new Set([...(data?.staffNames?.work || []), ...entries.map((e) => e.workStaff)].filter(Boolean))], [data, entries]);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api('/api/sync', { method: 'POST' });
      showToast(r.mode === 'sample' ? 'サンプルデータを確認しました' : 'ジョーカーから最新の伝票を取り込みました');
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
      : <p className="muted">入庫予定を読み込んでいます…</p>;
  }

  const counts = { ...Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v.length])), member: memberApp.length };
  const list = tile === 'member' ? null : views[tile] || [];
  const run = data.lastSync;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="small muted">本日 {jpDate(today)}（{dow(today)}）</div>
          <div className="small muted">予約はここで、入庫後の進み具合はジョーカーの伝票から</div>
        </div>
        <div className="row">
          <div className="syncbar">
            <span>{run?.finished_at ? `ジョーカー取込 ${fmtDateTime(run.finished_at)}${run.ok ? '' : '（失敗）'}` : '未取込'}</span>
            <button type="button" className="btn small" onClick={syncNow} disabled={syncing}>{syncing ? '更新中…' : '今すぐ更新'}</button>
          </div>
          <button type="button" className="btn primary" onClick={() => setPanel({ mode: 'new', prefill: {} })}>＋ 入庫予約</button>
        </div>
      </div>

      {data.mode === 'sample' && (
        <div className="notice sample" role="note">
          <span><b>サンプルデータで表示中。</b>予約・伝票はすべて架空です。ジョーカーの API キーを設定すると、毎朝6時にジョーカーの整備伝票を取り込み、予約と自動で結び付けます。</span>
        </div>
      )}
      {run && run.ok === false && <div className="notice fail" role="alert">前回の取り込みに失敗しました：{run.error}</div>}

      <div className="summary">
        {TILES.map((t) => (
          <button key={t.id} type="button" className="tile" aria-pressed={tile === t.id} onClick={() => setTile(t.id)}>
            <span className="lbl"><span className={`dot ${t.dot}`} />{t.label}</span>
            <span className="n">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <input className="input" type="search" placeholder="お客様名・ナンバー・車名・電話で検索" aria-label="検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" aria-label="作業区分" value={workType} onChange={(e) => setWorkType(e.target.value)}>
          <option value="">すべての作業</option>
          {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
        </select>
        <select className="select" aria-label="店舗" value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="">全店舗</option>
          {STORES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="select" aria-label="作業担当" value={workStaff} onChange={(e) => setWorkStaff(e.target.value)}>
          <option value="">作業担当：全員</option>
          {workNames.map((n) => <option key={n} value={n}>作業：{n}</option>)}
        </select>
      </div>

      {tile === 'member' ? (
        <div className="list">
          {memberApp.length === 0 && <div className="empty">取り込んでいない会員アプリの予約はありません。</div>}
          {memberApp.map((r) => (
            <div key={r.id} className="entry" style={{ cursor: 'default' }}>
              <span className="when">{r.time || '—'}<span className="d">{shortDate(r.date)}（{dow(r.date)}）</span></span>
              <span className="car">
                <div style={{ fontWeight: 700 }}>{r.maker} {r.car_name}</div>
                <div className="sub">{r.plate}</div>
              </span>
              <span className="cust">
                <div>{r.customer_name} 様</div>
                <div className="sub">{r.phone}</div>
              </span>
              <span className="staff">
                <span className={`wt ${r.work_type}`}>{r.reservation_type}</span>
                <div className="flags">
                  {r.loaner && <span className="flag loaner">代車</span>}
                  <span className="flag walkin">{r.confirmed ? '日時確定' : r.status === 'change_requested' ? '変更希望' : '希望日'}</span>
                </div>
                {r.note && <div className="sub">{r.note}</div>}
              </span>
              <span className="st">
                <button type="button" className="btn small primary" onClick={() => setPanel({
                  mode: 'new',
                  prefill: {
                    source: 'member_app', member_reservation_id: r.id, customer_name: r.customer_name, customer_kana: r.customer_kana,
                    phone: r.phone, plate: r.plate, maker: r.maker, car_name: r.car_name, work_type: r.work_type,
                    planned_date: r.date, planned_time: r.time, loaner: r.loaner, memo: r.note, sales_staff: r.staff_name,
                  },
                })}>予約に取り込む</button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {list.length === 0 && <div className="empty">{tile === 'schedule' ? 'この2週間の入庫予約はありません。' : '該当する車両はありません。'}</div>}
          {list.map((e, i) => {
            const showHead = tile === 'schedule' && (i === 0 || list[i - 1].date !== e.date);
            const dayCount = showHead ? list.filter((x) => x.date === e.date).length : 0;
            return (
              <Fragment key={e.key}>
                {showHead && (
                  <div className={`dayhead ${e.date === today ? 'today' : ''}`}>
                    <span>{e.date === today ? '今日 ' : ''}{shortDate(e.date)}（{dow(e.date)}）</span>
                    <span className="cnt">{dayCount}台</span>
                  </div>
                )}
                <Entry e={e} today={today} showDate={tile !== 'schedule'} onOpen={() => setPanel(e.kind === 'booking' ? { mode: 'edit', id: e.booking.id } : { mode: 'walkin', seibiNo: e.seibi.seibi_no })} />
              </Fragment>
            );
          })}
        </div>
      )}

      {panel && (
        <BookingPanel
          key={panel.mode === 'edit' ? panel.id : panel.mode === 'walkin' ? panel.seibiNo : JSON.stringify(panel.prefill)}
          panel={panel}
          data={data}
          onClose={() => setPanel(null)}
          onSaved={(msg, next) => { showToast(msg); load(); setPanel(next || null); }}
          onApiError={(e) => { onApiError(e); if (e?.status === 409) load(); }}
          toast={showToast}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Entry({ e, today, showDate, onOpen }) {
  const dim = e.kind === 'booking' && e.booking.state !== 'booked';
  return (
    <button type="button" className={`entry ${dim ? 'dim' : ''}`} onClick={onOpen}>
      <span className="when">
        {e.time || '—'}
        {showDate && e.date && <span className="d">{e.date === today ? '今日' : `${shortDate(e.date)}（${dow(e.date)}）`}</span>}
      </span>
      <span className="car">
        <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{e.maker} {e.car}</div>
        <div><span className="plate-text">{e.plate || 'ナンバー未入力'}</span></div>
      </span>
      <span className="cust">
        <div>{e.customer ? `${e.customer} 様` : 'お客様未入力'}</div>
        <div className="sub">{[e.store, e.detail].filter(Boolean).join(' ・ ')}</div>
      </span>
      <span className="staff">
        <span className={`wt ${e.workType}`}>{e.workType}</span>
        <div className="flags">
          {e.loaner && <span className="flag loaner">代車</span>}
          {e.hold && <span className="flag hold">{e.hold}</span>}
          {e.kind === 'walkin' && <span className="flag walkin">予約なし入庫</span>}
          {e.kind === 'booking' && e.booking.source === 'yuhatsu' && <span className="flag walkin">誘発から</span>}
          {e.kind === 'booking' && e.booking.source === 'member_app' && <span className="flag walkin">会員アプリ</span>}
        </div>
        <div className="sub">{[e.workStaff && `作業 ${e.workStaff}`, e.salesStaff && `営業 ${e.salesStaff}`].filter(Boolean).join(' ・ ')}</div>
      </span>
      <span className="st">
        <span className={`prog ${e.p.key}`}>{e.p.label}</span>
        {e.deliveryDue && !['delivered', 'cancelled', 'no_show'].includes(e.p.key) && (
          <span className={e.overdue ? 'due' : 'sub'}>納車予定 {shortDate(e.deliveryDue)}{e.overdue ? '（超過）' : ''}</span>
        )}
      </span>
    </button>
  );
}
