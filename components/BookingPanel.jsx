'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { BOOKING_STATES, HOLD_REASONS, STORES, WORK_TYPES } from '@/lib/shared/constants';
import { jpDate, shortDate } from '@/lib/shared/dates';
import { progress } from '@/lib/shared/nyuko';

const EMPTY = {
  customer_name: '', customer_kana: '', phone: '', plate: '', maker: '', car_name: '', work_type: '一般整備', work_detail: '',
  store: '大阪店', planned_date: '', planned_time: '', return_planned_date: '', loaner: false, sales_staff: '', work_staff: '', memo: '',
};
const EDITABLE = Object.keys(EMPTY);
const fmtTime = (iso) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const hm = (v) => (/^\d{4}$/.test(v || '') ? `${v.slice(0, 2)}:${v.slice(2)}` : v || '');

function useEscape(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') ref.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

export default function BookingPanel({ panel, data, onClose, onSaved, onApiError, toast }) {
  useEscape(onClose);
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  let title = '入庫予約';
  let body = null;
  if (panel.mode === 'walkin') {
    const s = data.walkIns.find((w) => w.seibi_no === panel.seibiNo);
    title = 'ジョーカー伝票（予約なし入庫）';
    body = s ? <WalkIn seibi={s} data={data} onSaved={onSaved} onApiError={onApiError} /> : <p className="muted">伝票が見つかりません。画面を更新してください。</p>;
  } else if (panel.mode === 'edit') {
    const b = data.items.find((x) => x.id === panel.id);
    title = '入庫予約の確認・変更';
    body = b
      ? <BookingForm booking={b} data={data} onSaved={onSaved} onApiError={onApiError} toast={toast} />
      : <p className="muted">予約が見つかりません。60日より前の予約か、削除された可能性があります。</p>;
  } else {
    title = panel.prefill?.source === 'member_app' ? '会員アプリの予約を取り込む' : '入庫予約を入れる';
    body = <BookingForm prefill={panel.prefill || {}} data={data} onSaved={onSaved} onApiError={onApiError} toast={toast} />;
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <div className="dh">
          <h2 id="panel-title">{title}</h2>
          <button ref={closeRef} type="button" className="close" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <div className="db">{body}</div>
      </aside>
    </>
  );
}

// ------------------------------------------------------------------
// 予約フォーム（新規・変更）
// ------------------------------------------------------------------
function BookingForm({ booking, prefill, data, onSaved, onApiError, toast }) {
  const isNew = !booking;
  const [form, setForm] = useState(() => {
    if (booking) return Object.fromEntries(EDITABLE.map((k) => [k, booking[k] ?? EMPTY[k]]));
    return { ...EMPTY, planned_date: data.today, ...Object.fromEntries(Object.entries(prefill).filter(([k]) => k in EMPTY)) };
  });
  const [car, setCar] = useState(booking?.car_no ? { car_no: booking.car_no } : null); // 選んだジョーカー車両
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  // 誘発から来たときは車両情報を読み込んで埋める
  useEffect(() => {
    if (!isNew || !prefill.car_no) return;
    api(`/api/vehicles/search?car=${prefill.car_no}`)
      .then((r) => { const v = r.results?.[0]; if (v) pick(v); })
      .catch(onApiError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(v) {
    setCar(v);
    setForm((f) => ({
      ...f,
      customer_name: v.customer_name || f.customer_name,
      customer_kana: v.customer_kana || f.customer_kana,
      phone: v.phone || f.phone,
      plate: v.plate || f.plate,
      maker: v.maker || f.maker,
      car_name: [v.car_name, v.grade].filter(Boolean).join(' ') || f.car_name,
      sales_staff: f.sales_staff || v.sales_staff || '',
      work_staff: f.work_staff || v.work_staff || '',
    }));
  }

  async function save() {
    setBusy(true);
    try {
      if (isNew) {
        await api('/api/nyuko/bookings', {
          method: 'POST',
          body: {
            ...form, source: prefill.source || 'manual', car_no: car?.car_no || null,
            shkn_day: prefill.shkn_day, member_reservation_id: prefill.member_reservation_id,
          },
        });
        onSaved(`${shortDate(form.planned_date)} の入庫予約を入れました`);
      } else {
        await api(`/api/nyuko/bookings/${booking.id}`, { method: 'PATCH', body: { ...form, version: booking.version } });
        onSaved('予約を更新しました', { mode: 'edit', id: booking.id });
      }
    } catch (e) {
      onApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function patch(fields, msg) {
    setBusy(true);
    try {
      await api(`/api/nyuko/bookings/${booking.id}`, { method: 'PATCH', body: { ...fields, version: booking.version } });
      onSaved(msg, { mode: 'edit', id: booking.id });
    } catch (e) {
      onApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function arrive(arrived) {
    setBusy(true);
    try {
      await api(`/api/nyuko/bookings/${booking.id}/arrive`, { method: 'POST', body: { arrived, version: booking.version } });
      onSaved(arrived ? '入庫済みにしました（作業待ち）' : '入庫済みを取り消しました', { mode: 'edit', id: booking.id });
    } catch (e) {
      onApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function link(action, seibiNo) {
    setBusy(true);
    try {
      await api(`/api/nyuko/bookings/${booking.id}/link`, { method: 'POST', body: { action, seibi_no: seibiNo, version: booking.version } });
      onSaved(action === 'link' ? 'ジョーカーの伝票と結び付けました' : '結び付けを外しました', { mode: 'edit', id: booking.id });
    } catch (e) {
      onApiError(e);
    } finally {
      setBusy(false);
    }
  }

  const p = booking ? progress(booking, booking.seibi, data.today) : null;
  const candidates = booking && !booking.seibi_no
    ? data.walkIns.filter((s) => !booking.car_no || s.car_no === booking.car_no)
    : [];
  const workNames = data.staffNames?.work || [];
  const salesNames = data.staffNames?.sales || [];

  return (
    <>
      {booking && (
        <section className="sec">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className={`prog ${p.key}`}>{p.label}</span>
            <span className="xs muted">
              {booking.source === 'yuhatsu' ? '誘発ボードから' : booking.source === 'member_app' ? '会員アプリから' : '手入力'}
              ・登録 {booking.created_by_name}{booking.updated_by_name && booking.updated_by_name !== booking.created_by_name ? `・最終更新 ${booking.updated_by_name}` : ''}
            </span>
          </div>
          {!booking.seibi && booking.state === 'booked' && (
            booking.arrived_at ? (
              <div className="row">
                <span className="small">入庫済み：{fmtTime(booking.arrived_at)}（{booking.arrived_by_name}）</span>
                <button type="button" className="btn small" disabled={busy} onClick={() => arrive(false)}>取り消す</button>
              </div>
            ) : (
              <div className="row">
                <button type="button" className="btn primary" disabled={busy} onClick={() => arrive(true)}>入庫済み</button>
                <span className="xs muted">押すと「作業待ち」になります。ジョーカーの伝票が取り込まれたら、そちらの日付で進みます。</span>
              </div>
            )
          )}
          {booking.seibi ? (
            <SlipCard seibi={booking.seibi}>
              <button type="button" className="btn small" disabled={busy} onClick={() => link('unlink')}>結び付けを外す</button>
            </SlipCard>
          ) : (
            <div className="slip">
              <div className="small">
                {booking.car_no
                  ? 'ジョーカーの伝票はまだ見つかっていません。入庫して伝票を作ると、次の取り込みで自動で結び付きます。'
                  : 'ジョーカーの車両が選ばれていないため、伝票と自動では結び付きません。下の候補から選ぶか、車両を選び直してください。'}
              </div>
              {candidates.length > 0 && (
                <div className="row">
                  <select className="select" id="link-pick" aria-label="結び付ける伝票" defaultValue="">
                    <option value="" disabled>予約なし入庫の伝票から選ぶ</option>
                    {candidates.map((s) => (
                      <option key={s.seibi_no} value={s.seibi_no}>{s.seibi_no} {shortDate(s.nko_day || s.uke_day)} {s.customer_name} {s.car_name}</option>
                    ))}
                  </select>
                  <button type="button" className="btn small" disabled={busy}
                    onClick={() => { const v = document.getElementById('link-pick').value; if (v) link('link', v); }}>結び付ける</button>
                </div>
              )}
            </div>
          )}
          <div className="seg" aria-label="予約の状態">
            {BOOKING_STATES.map((s) => (
              <button key={s.id} type="button" aria-pressed={booking.state === s.id} disabled={busy}
                onClick={() => booking.state !== s.id && patch({ state: s.id }, `「${s.label}」にしました`)}>{s.label}</button>
            ))}
          </div>
          <div className="row">
            <label className="label" htmlFor="hold">保留の理由</label>
            <select id="hold" className="select" value={booking.hold_reason} disabled={busy}
              onChange={(e) => patch({ hold_reason: e.target.value }, e.target.value ? `「${e.target.value}」にしました` : '保留を外しました')}>
              <option value="">なし</option>
              {HOLD_REASONS.map((h) => <option key={h}>{h}</option>)}
            </select>
          </div>
        </section>
      )}

      <section className="sec">
        <h3>車両・お客様</h3>
        {car?.car_no && (car.plate || car.customer_name) ? (
          <div className="picked">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{car.maker} {car.car_name} <span className="plate-text">{car.plate}</span></div>
              <div className="sub">{car.customer_name} 様 ・ ジョーカー {car.car_no}{car.shkn_day ? ` ・ 車検満了 ${jpDate(car.shkn_day)}` : ''}</div>
            </div>
            {isNew && prefill.source !== 'yuhatsu' && <button type="button" className="btn small" onClick={() => setCar(null)}>選び直す</button>}
          </div>
        ) : car?.car_no ? (
          <div className="sub">ジョーカー車両 {car.car_no}</div>
        ) : (
          isNew && <VehicleSearch onPick={pick} onApiError={onApiError} />
        )}
        <div className="form-grid">
          <Field label="お客様名" id="f-name"><input id="f-name" className="input" value={form.customer_name} onChange={set('customer_name')} maxLength={100} /></Field>
          <Field label="電話番号" id="f-tel"><input id="f-tel" className="input" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={30} /></Field>
          <Field label="ナンバー" id="f-plate"><input id="f-plate" className="input" placeholder="大阪 300 あ 1234" value={form.plate} onChange={set('plate')} maxLength={40} /></Field>
          <Field label="メーカー" id="f-maker"><input id="f-maker" className="input" value={form.maker} onChange={set('maker')} maxLength={50} /></Field>
          <Field label="車名・グレード" id="f-car" full><input id="f-car" className="input" value={form.car_name} onChange={set('car_name')} maxLength={100} /></Field>
        </div>
      </section>

      <section className="sec">
        <h3>入庫の内容</h3>
        <div className="form-grid">
          <Field label="作業区分" id="f-type">
            <select id="f-type" className="select" value={form.work_type} onChange={set('work_type')}>{WORK_TYPES.map((w) => <option key={w}>{w}</option>)}</select>
          </Field>
          <Field label="店舗" id="f-store">
            <select id="f-store" className="select" value={form.store} onChange={set('store')}>{STORES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="入庫予定日" id="f-date"><input id="f-date" type="date" className="input" value={form.planned_date} onChange={set('planned_date')} required /></Field>
          <Field label="時間" id="f-time"><input id="f-time" type="time" className="input" step={900} value={form.planned_time} onChange={set('planned_time')} /></Field>
          <Field label="納車予定日" id="f-ret"><input id="f-ret" type="date" className="input" value={form.return_planned_date || ''} min={form.planned_date} onChange={set('return_planned_date')} /></Field>
          <Field label="代車" id="f-loaner">
            <label className="check" htmlFor="f-loaner"><input id="f-loaner" type="checkbox" checked={form.loaner} onChange={set('loaner')} /> 代車が必要</label>
          </Field>
          <Field label="作業担当" id="f-work">
            <input id="f-work" className="input" list="work-names" value={form.work_staff} onChange={set('work_staff')} maxLength={50} />
            <datalist id="work-names">{workNames.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="営業担当" id="f-sales">
            <input id="f-sales" className="input" list="sales-names" value={form.sales_staff} onChange={set('sales_staff')} maxLength={50} />
            <datalist id="sales-names">{salesNames.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="作業内容・ご依頼" id="f-detail" full>
            <textarea id="f-detail" className="textarea" value={form.work_detail} onChange={set('work_detail')} maxLength={1000} placeholder="例：エンジン警告灯点灯、異音の確認" />
          </Field>
          <Field label="メモ（社内向け）" id="f-memo" full>
            <textarea id="f-memo" className="textarea" value={form.memo} onChange={set('memo')} maxLength={2000} />
          </Field>
        </div>
        <div className="row">
          <button type="button" className="btn primary" disabled={busy || !form.planned_date} onClick={save}>{isNew ? '予約を入れる' : '変更を保存'}</button>
          {booking?.source === 'yuhatsu' && booking.car_no && <Link className="btn ghost small" href="/">誘発ボードへ</Link>}
        </div>
      </section>
    </>
  );
}

function Field({ label, id, full, children }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------
// ジョーカー車両の検索
// ------------------------------------------------------------------
function VehicleSearch({ onPick, onApiError }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);

  async function search(e) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await api(`/api/vehicles/search?q=${encodeURIComponent(q.trim())}`);
      setHits(r.results);
    } catch (err) {
      onApiError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sec" style={{ gap: 6 }}>
      <form className="row" onSubmit={search}>
        <input className="input grow" style={{ flex: '1 1 200px' }} aria-label="ジョーカーの車両を検索" placeholder="ナンバー4桁・電話番号・お客様名" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn" disabled={busy || q.trim().length < 2}>{busy ? '検索中…' : 'ジョーカーから探す'}</button>
      </form>
      <div className="xs muted">ジョーカーの車両を選ぶと、入庫後の伝票と自動で結び付きます。見つからない場合は下の欄に直接入力できます。</div>
      {hits && hits.length === 0 && <div className="small muted">見つかりませんでした。</div>}
      {hits && hits.length > 0 && (
        <div className="hits">
          {hits.map((v) => (
            <button key={v.car_no} type="button" className="hit" onClick={() => { onPick(v); setHits(null); }}>
              <span style={{ fontWeight: 700 }}>{v.maker} {v.car_name} <span className="plate-text">{v.plate}</span></span>
              <span className="sub">{v.customer_name} 様{v.phone ? ` ・ ${v.phone}` : ''}{v.shkn_day ? ` ・ 車検 ${shortDate(v.shkn_day)}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// ジョーカー伝票の表示
// ------------------------------------------------------------------
function SlipCard({ seibi: s, children }) {
  const steps = [
    ['入庫', s.nko_day || s.uke_day],
    ['作業開始', s.sgy_st_day],
    ['作業完了', s.sgy_ed_day],
    ['納車予定', s.nsh_y_day],
    ['納車', s.nsh_day],
  ];
  return (
    <div className="slip">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small"><b>ジョーカー伝票 {s.seibi_no}</b> ・ {s.work_type}{s.work_sub ? `（${s.work_sub}）` : ''}{s.gm_status === '1' ? ' ・ 売上決定' : ''}</span>
        {children}
      </div>
      <div className="steps">
        {steps.map(([label, day]) => (
          <div key={label} className={day && label !== '納車予定' ? 'done' : ''}>{label}<b>{day ? shortDate(day) : '—'}</b></div>
        ))}
      </div>
      <div className="sub">
        {[s.work_staff && `作業 ${s.work_staff}`, s.sales_staff && `営業 ${s.sales_staff}`, s.reception_staff && `受付 ${s.reception_staff}`,
          s.nsh_y_time && `納車予定時間 ${hm(s.nsh_y_time)}`, s.loaner_out_day && `代車 ${shortDate(s.loaner_out_day)}〜${s.loaner_back_day ? shortDate(s.loaner_back_day) : ''}`]
          .filter(Boolean).join(' ・ ')}
      </div>
      {s.memo && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{s.memo}</div>}
    </div>
  );
}

function WalkIn({ seibi, data, onSaved, onApiError }) {
  const [busy, setBusy] = useState(false);
  const p = progress(null, seibi, data.today);
  const bookings = data.items.filter((b) => b.state === 'booked' && !b.seibi_no && (!b.car_no || b.car_no === seibi.car_no));

  async function linkTo(id) {
    const b = data.items.find((x) => x.id === id);
    if (!b) return;
    setBusy(true);
    try {
      await api(`/api/nyuko/bookings/${b.id}/link`, { method: 'POST', body: { action: 'link', seibi_no: seibi.seibi_no, version: b.version } });
      onSaved('予約と結び付けました', { mode: 'edit', id: b.id });
    } catch (e) {
      onApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="sec">
        <span className={`prog ${p.key}`} style={{ justifySelf: 'start' }}>{p.label}</span>
        <div>
          <div style={{ fontWeight: 700 }}>{seibi.maker} {seibi.car_name} <span className="plate-text">{seibi.plate}</span></div>
          <div className="sub">{seibi.customer_name ? `${seibi.customer_name} 様` : ''}{seibi.phone ? ` ・ ${seibi.phone}` : ''}</div>
        </div>
        <SlipCard seibi={seibi} />
        <p className="xs muted" style={{ margin: 0 }}>この伝票はジョーカーの内容をそのまま表示しています。変更はジョーカーで行ってください。</p>
      </section>
      {bookings.length > 0 && (
        <section className="sec">
          <h3>予約と結び付ける</h3>
          <p className="small muted" style={{ margin: 0 }}>アプリで入れた予約の車両がこの伝票なら、結び付けると予約側で進み具合を追えます。</p>
          <div className="hits">
            {bookings.map((b) => (
              <button key={b.id} type="button" className="hit" disabled={busy} onClick={() => linkTo(b.id)}>
                <span style={{ fontWeight: 700 }}>{shortDate(b.planned_date)} {b.planned_time} {b.customer_name} 様</span>
                <span className="sub">{b.maker} {b.car_name} ・ {b.plate || 'ナンバー未入力'} ・ {b.work_type}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
