/** メンバーサービス（会員システム）の加入状況の印 */
export default function MemberFlag({ m, long = false }) {
  if (!m) return null;
  if (m.state === 'member') {
    const note = m.unpaid ? '・未払い' : m.expired ? '・期限切れ' : '';
    return (
      <span className={`flag ${note ? 'hold' : 'member'}`} title={m.number ? `会員番号 ${m.number}` : undefined}>
        メンバー{m.rank ? ` ${m.rank}` : ''}{note}{m.manual ? '（手動）' : ''}{long && m.number ? `（会員番号 ${m.number}${m.expiry ? `・${m.expiry.replaceAll('-', '/')}まで` : ''}）` : ''}
      </span>
    );
  }
  if (m.state === 'other_car') return <span className="flag nonmember">未加入（同じお客様の別の車で加入）</span>;
  return <span className="flag nonmember">メンバーサービス未加入{m.manual ? '（手動）' : ''}</span>;
}
