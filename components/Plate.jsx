import { plateNumber, plateText } from '@/lib/shared/view';

// 自家用ナンバー（白地・緑字）風の表示
export default function Plate({ item }) {
  if (!item.plate_number) return <span className="plate none">ナンバー未登録</span>;
  return (
    <span className="plate" aria-label={`ナンバー ${plateText(item)}`}>
      <span className="t">{item.plate_area} {item.plate_class}</span>
      <span className="k">{item.plate_kana}</span>
      <span className="no">{plateNumber(item.plate_number)}</span>
    </span>
  );
}
