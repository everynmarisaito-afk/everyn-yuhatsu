'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import Plate from './Plate';
import { CLOSED_STATUSES, METHODS, STATUSES } from '@/lib/shared/constants';
import { addMonths, jpDate, shortDate } from '@/lib/shared/dates';
import { daysLeft, guidanceMessage, hm, modelYear, severity } from '@/lib/shared/view';

function fmtLogTime(iso) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function copyText(text, toast) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch {
    toast('コピーできませんでした。文字を選択してコピーしてください');
  }
}

export default function Detail({ item, today, onClose, onChanged, onConflict, onApiError, toast }) {
  const [logs, setLogs] = useState(null);
  const [method, setMethod] = useState(item.prefer_mail && !item.prefer_tel ? 'メール' : '電話');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => guidanceMessage(item));
  const closeRef = useRef(null);

  const d = daysLeft(item, today);
  const canInspect = today >= addMonths(item.shkn_day, -2);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let alive = true;
    setLogs(null);
    api(`/api/targets/${item.car_no}/logs?shkn=${item.shkn_day}`)
      .then((r) => { if (alive) setLogs(r.logs); })
      .catch((e) => { if (alive) { setLogs([]); onApiError(e); } });
    return () => { alive = false; };
  }, [item.car_no, item.shkn_day, onApiError]);

  async function save(patch, okMessage) {
    setBusy(true);
    try {
      const r = await api(`/api/targets/${item.car_no}`, {
        method: 'PATCH', body: { shkn_day: item.shkn_day, version: item.version, ...patch },
      });
      onChanged(r.followup);
      if (okMessage) toast(okMessage);
    } catch (e) {
      onApiError(e);
      if (e.status === 409) {
        if (e.data?.current) onChanged(e.data.current);
        else onConflict();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addLog() {
    setBusy(true);
    try {
      const r = await api(`/api/targets/${item.car_no}/logs`, {
        method: 'POST', body: { shkn_day: item.shkn_day, method, memo },
      });
      setLogs(r.logs);
      setMemo('');
      const last = r.logs[0];
      onChanged({ ...(r.followup || {}), last_contact: last ? { method: last.method, staff_name: last.staff_name, at: last.created_at } : item.last_contact });
      toast('連絡を記録しました');
    } catch (e) {
      onApiError(e);
    } finally {
      setBusy(false);
    }
  }

  const contacts = [
    ['携帯', item.mobile, false],
    ['電話', item.tel, false],
    ['メール', item.email, true],
    ['メール2', item.email2, true],
    ['携帯メール', item.mobile_email, true],
  ].filter(([, v]) => v);
  const prefer = [item.prefer_tel && '電話', item.prefer_mail && 'メール'].filter(Boolean).join('・') || '指定なし';
  const time = item.prefer_from ? `${hm(item.prefer_from)}〜${hm(item.prefer_to)}` : '';
  const closed = CLOSED_STATUSES.includes(item.status);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="dh">
          <div>
            <h2 id="detail-title">{item.customer_name ? `${item.customer_name} 様` : '保有者未設定'}</h2>
            <div className="sub">{[item.customer_kana, item.koky_no, item.sales_staff && `営業 ${item.sales_staff}`, item.service_staff && `作業 ${item.service_staff}`].filter(Boolean).join(' ・ ')}</div>
          </div>
          <button ref={closeRef} type="button" className="close" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div className="db">
          <div className="expiry">
            <span className={`big ${severity(d)}`}>{d < 0 ? `+${-d}` : d}</span>
            <div>
              <div><b>{d < 0 ? '日超過' : '日後に満了'}</b> ・ {jpDate(item.shkn_day)}</div>
              <div className="small muted">
                {d < 0 ? '車検が切れています。公道を走れないため至急ご連絡を。' : canInspect ? '受検できる期間に入っています（満了日の2ヶ月前から）。' : `${jpDate(addMonths(item.shkn_day, -2))}から受検できます。`}
              </div>
            </div>
          </div>

          <section className="sec">
            <h3>車両</h3>
            <div className="row">
              <Plate item={item} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{item.maker} {item.car_name}</div>
                <div className="sub">
                  {[item.grade, modelYear(item.model_year), item.mileage_km && `${item.mileage_km.toLocaleString()}km`, item.car_no].filter(Boolean).join(' ・ ')}
                </div>
              </div>
            </div>
          </section>

          <section className="sec">
            <h3>連絡先</h3>
            {contacts.length === 0 && <p className="small muted" style={{ margin: 0 }}>ジョーカーに連絡先が登録されていません。</p>}
            <div>
              {contacts.map(([label, value, mail]) => (
                <div key={label} className="contact">
                  <div style={{ minWidth: 0 }}>
                    <div className="xs muted">{label}</div>
                    {mail
                      ? <a className="v mail" href={`mailto:${value}`}>{value}</a>
                      : <a className="v" href={`tel:${value.replace(/[^\d+]/g, '')}`} style={{ textDecoration: 'none' }}>{value}</a>}
                  </div>
                  <button type="button" className="btn small" onClick={() => copyText(value, toast)}>コピー</button>
                </div>
              ))}
            </div>
            <dl className="kv">
              <dt>希望連絡手段</dt><dd>{prefer}</dd>
              {item.prefer_days && <><dt>希望曜日</dt><dd>{item.prefer_days}</dd></>}
              {time && <><dt>希望時間帯</dt><dd>{time}</dd></>}
              {item.dm_kbn === '2' && <><dt>案内送付</dt><dd>DM不要（電話・メールでの案内のみ）</dd></>}
            </dl>
          </section>

          <section className="sec">
            <h3>ステータス</h3>
            <div className="seg">
              {STATUSES.map((s) => (
                <button key={s.id} type="button" aria-pressed={item.status === s.id} disabled={busy}
                  onClick={() => item.status !== s.id && save({ status: s.id }, `「${s.label}」にしました`)}>
                  {s.label}
                </button>
              ))}
            </div>
            {!closed && (
              <div className="row">
                <label className="label" htmlFor="next-date">次回連絡予定日</label>
                <input id="next-date" type="date" className="input" value={item.next_contact_on || ''} min={today} disabled={busy}
                  onChange={(e) => save({ next_contact_on: e.target.value || null, ...(e.target.value && ['none', 'sent'].includes(item.status) ? { status: 'wait' } : {}) }, e.target.value ? '次回連絡日を設定しました' : '次回連絡日を外しました')} />
                {item.next_contact_on && <button type="button" className="btn small" disabled={busy} onClick={() => save({ next_contact_on: null }, '次回連絡日を外しました')}>外す</button>}
              </div>
            )}
            {item.updated_by_name && <div className="xs muted">最終更新：{item.updated_by_name}</div>}
          </section>

          <section className="sec">
            <h3>入庫予約</h3>
            {item.booking ? (
              <div className="row">
                <span><b>{shortDate(item.booking.planned_date)}{item.booking.planned_time ? ` ${item.booking.planned_time}` : ''}</b> に入庫予定{item.booking.work_staff ? `（作業 ${item.booking.work_staff}）` : ''}</span>
                <Link className="btn small" href={`/nyuko?booking=${item.booking.id}`}>入庫管理で開く</Link>
              </div>
            ) : (
              <div className="row">
                <Link className="btn primary" href={`/nyuko?from=yuhatsu&car=${item.car_no}&shkn=${item.shkn_day}`}>入庫予約を入れる</Link>
                <span className="xs muted">予約を入れると「予約済み」になり、入庫したら自動で「入庫済み」になります</span>
              </div>
            )}
          </section>

          <section className="sec">
            <h3>連絡を記録</h3>
            <div className="row">
              <select className="select" aria-label="連絡手段" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <textarea className="textarea" aria-label="メモ" placeholder="例：不在のため留守電。見積もりリンクをSMSで送付。" maxLength={2000} value={memo} onChange={(e) => setMemo(e.target.value)} />
            <div className="row">
              <button type="button" className="btn primary" disabled={busy} onClick={addLog}>記録する</button>
              {item.status === 'none' && <span className="xs muted">記録すると「案内済み」になります</span>}
            </div>
            <ul className="hist">
              {logs === null && <li className="muted">読み込んでいます…</li>}
              {logs?.length === 0 && <li className="muted" style={{ border: 0, padding: 0 }}>まだ連絡記録はありません。</li>}
              {logs?.map((l) => (
                <li key={l.id}>
                  <div className="when">{fmtLogTime(l.created_at)} ・ {l.method} ・ {l.staff_name}</div>
                  {l.memo || <span className="muted">メモなし</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="sec">
            <h3>案内文（見積もりリンク付き）</h3>
            <textarea className="textarea" rows={10} aria-label="案内文" value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="row">
              <button type="button" className="btn primary" onClick={() => copyText(message, toast)}>案内文をコピー</button>
              <span className="xs muted">SMS・LINE・メールに貼り付けて送れます</span>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
