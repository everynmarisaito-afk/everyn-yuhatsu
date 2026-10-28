import { addDays } from '../shared/dates.js';

// JOCAR の API キーが届くまで使う架空のデータ。実在の人物・車両ではない。
// 電話番号は 0000 を含む存在しない番号、メールは example.com。

const RAW = [
  // [満了日までの日数, メーカー, 車名, グレード, 年式, 走行距離, [陸支,分類,かな,番号], 顧客名, カナ, 電話, 携帯, メール, 案内送付区分, TEL希望, メール希望, 担当, 希望時間]
  [-12, 'アウディ', 'RS3スポーツバック', 'ベースグレード', '202104', 28400, ['品川', '300', 'さ', '1208'], '高橋 健一', 'タカハシ ケンイチ', '', '090-0000-0101', 'k.takahashi@example.com', '1', true, false, '斎藤', ''],
  [-3, 'BMW', 'M3', 'コンペティション', '202011', 41200, ['世田谷', '330', 'ら', '3303'], '山本 彩', 'ヤマモト アヤ', '03-0000-0102', '080-0000-0102', '', '1', true, false, '斎藤', '18002000'],
  [5, 'ポルシェ', '911', 'カレラS', '201907', 35800, ['品川', '300', 'ほ', '9110'], '株式会社ミナトトレーディング', 'ミナトトレーディング', '03-0000-0103', '', 'fleet@example.com', '1', false, true, '中村', ''],
  [9, 'メルセデス・ベンツ', 'Cクラス', 'C200 アバンギャルド', '202010', 52100, ['練馬', '330', 'む', '5420'], '佐藤 大輔', 'サトウ ダイスケ', '', '090-0000-0104', 'd.sato@example.com', '1', true, true, '中村', ''],
  [14, 'アウディ', 'RS6アバント', 'パフォーマンス', '202305', 18900, ['横浜', '300', 'ゆ', '6600'], '伊藤 真理', 'イトウ マリ', '', '080-0000-0105', 'mari.ito@example.com', '1', false, true, '斎藤', ''],
  [20, 'BMW', 'X5', 'xDrive35d Mスポーツ', '202106', 47300, ['品川', '330', 'た', '5050'], '小林 修', 'コバヤシ オサム', '', '090-0000-0106', '', '3', false, false, '中村', ''],
  [21, 'BMW', '3シリーズ', '320i Mスポーツ (F30)', '201610', 88200, ['多摩', '300', 'ち', '3200'], '渡辺 陽子', 'ワタナベ ヨウコ', '042-000-0107', '090-0000-0107', '', '1', true, false, '斎藤', '10001700'],
  [27, 'アウディ', 'R8', 'V10 パフォーマンス', '202207', 9800, ['品川', '300', 'あ', '8888'], '加藤 直樹', 'カトウ ナオキ', '', '090-0000-0108', 'n.kato@example.com', '1', true, true, '斎藤', ''],
  [33, 'フォルクスワーゲン', 'ゴルフ', 'GTI', '202008', 39600, ['世田谷', '300', 'と', '7007'], '吉田 沙織', 'ヨシダ サオリ', '', '080-0000-0109', 'saori.y@example.com', '1', false, true, '中村', ''],
  [38, 'BMW', 'i8', 'ロードスター', '201912', 21400, ['品川', '300', 'み', '8008'], '山田 剛', 'ヤマダ ツヨシ', '', '090-0000-0110', 't.yamada@example.com', '1', true, false, '斎藤', '19002100'],
  [45, 'アウディ', 'RS4アバント', 'ベースグレード', '202009', 45500, ['川崎', '300', 'さ', '4040'], '松本 恵', 'マツモト メグミ', '', '090-0000-0111', '', '1', true, false, '中村', ''],
  [52, 'BMW', '5シリーズ', '523d (E60)', '200903', 132000, ['相模', '300', 'せ', '5230'], '井上 誠', 'イノウエ マコト', '0463-00-0112', '090-0000-0112', '', '1', true, false, '斎藤', ''],
  [58, 'メルセデスAMG', 'GLC', '43 4MATIC クーペ', '202102', 36700, ['品川', '330', 'め', '4343'], '木村 亮', 'キムラ リョウ', '', '080-0000-0113', 'ryo.k@example.com', '1', false, true, '中村', ''],
  [64, 'アウディ', 'RS Q8', 'ベースグレード', '202209', 16200, ['横浜', '300', 'ろ', '8800'], '林 美咲', 'ハヤシ ミサキ', '', '090-0000-0114', 'misaki.h@example.com', '1', true, true, '斎藤', ''],
  [71, 'ミニ', 'クーパーS', 'クロスオーバー', '201811', 67400, ['練馬', '300', 'こ', '2525'], '清水 拓也', 'シミズ タクヤ', '', '090-0000-0115', '', '2', true, false, '中村', ''],
  [77, 'ポルシェ', 'マカン', 'GTS', '202011', 42900, ['世田谷', '300', 'ま', '1001'], '森 千尋', 'モリ チヒロ', '', '080-0000-0116', 'chihiro.m@example.com', '1', false, true, '斎藤', ''],
  [83, 'BMW', 'M4', 'クーペ (F82)', '201705', 58300, ['品川', '300', 'え', '4004'], '池田 翔', 'イケダ ショウ', '', '090-0000-0117', 'sho.ikeda@example.com', '1', true, true, '中村', ''],
  [88, 'アウディ', 'TT RS', 'クーペ', '201908', 33100, ['多摩', '330', 'て', '7777'], '橋本 和也', 'ハシモト カズヤ', '', '090-0000-0118', '', '1', true, false, '斎藤', ''],
];

/** サンプル車両の行（満了日は今日からの日数で決める）。車輌№は実在と重ならないよう "SM" で始める */
export function sampleVehicles(today) {
  return RAW.map((r, i) => ({
    car_no: `SM${String(i + 1).padStart(8, '0')}`,
    shkn_day: addDays(today, r[0]),
    plate_area: r[6][0],
    plate_class: r[6][1],
    plate_kana: r[6][2],
    plate_number: r[6][3],
    maker: r[1],
    car_name: r[2],
    grade: r[3],
    model_year: r[4],
    mileage_km: r[5],
    koky_no: `SM${String(i + 501).padStart(8, '0')}`,
    customer_name: r[7],
    customer_kana: r[8],
    tel: r[9],
    mobile: r[10],
    email: r[11],
    email2: '',
    mobile_email: '',
    dm_kbn: r[12],
    prefer_tel: r[13],
    prefer_mail: r[14],
    prefer_days: '',
    prefer_from: r[16] ? r[16].slice(0, 4) : '',
    prefer_to: r[16] ? r[16].slice(4) : '',
    sales_staff: r[15],
    service_staff: i % 2 === 0 ? '田中' : '大西',
    is_sample: true,
  }));
}

// ---- 入庫管理のサンプル（架空）。予約は is_sample=true、伝票は "SS" で始まる番号 ----
export function sampleNyuko(today) {
  const d = (n) => addDays(today, n);
  const booking = (b) => ({
    source: 'manual', car_no: null, shkn_day: null, customer_kana: '', phone: '', plate: '', maker: '', car_name: '',
    work_detail: '', store: '大阪店', planned_time: '', return_planned_date: null, loaner: false, sales_staff: '', work_staff: '',
    memo: '', state: 'booked', hold_reason: '', is_sample: true, created_by_name: 'サンプル', updated_by_name: 'サンプル', ...b,
  });
  const bookings = [
    // 誘発ボードのサンプル顧客（ポルシェ 911）から入った車検予約
    booking({ source: 'yuhatsu', car_no: 'SM00000003', shkn_day: d(5), customer_name: '株式会社ミナトトレーディング', phone: '03-0000-0103', plate: '品川 300 ほ 9110', maker: 'ポルシェ', car_name: '911', work_type: '車検', planned_date: d(2), planned_time: '10:00', return_planned_date: d(4), loaner: true, sales_staff: '中村', work_staff: '田中', memo: '法人車両。代車はセダン希望。' }),
    // 誘発ボードのサンプル顧客（Cクラス）。昨日入庫してジョーカーに伝票あり → 自動で結び付く
    booking({ source: 'yuhatsu', car_no: 'SM00000004', shkn_day: d(9), customer_name: '佐藤 大輔', phone: '090-0000-0104', plate: '練馬 330 む 5420', maker: 'メルセデス・ベンツ', car_name: 'Cクラス', work_type: '車検', planned_date: d(-1), planned_time: '09:30', return_planned_date: d(2), sales_staff: '中村', work_staff: '大西' }),
    booking({ car_no: 'SM00000021', customer_name: '岡田 恵子', phone: '090-0000-0121', plate: '堺 300 な 2101', maker: 'BMW', car_name: 'X3', work_type: '一般整備', work_detail: 'ブレーキ鳴き点検・パッド交換見積', planned_date: d(0), planned_time: '11:00', return_planned_date: d(1), store: '堺店', sales_staff: '斎藤', work_staff: '田中' }),
    booking({ customer_name: '前田 隼人', phone: '080-0000-0122', plate: '大阪 330 り 3322', maker: 'フォルクスワーゲン', car_name: 'ゴルフ ヴァリアント', work_type: '点検', work_detail: '12ヶ月点検', planned_date: d(1), planned_time: '14:00', sales_staff: '斎藤', work_staff: '大西' }),
    booking({ customer_name: '西川 美穂', phone: '090-0000-0123', plate: '世田谷 300 ひ 4321', maker: 'アウディ', car_name: 'A4 アバント', work_type: '一般整備', work_detail: 'エンジン警告灯点灯', planned_date: d(4), planned_time: '10:30', loaner: true, store: '世田谷店', sales_staff: '中村', work_staff: '' }),
    booking({ customer_name: '小川 剛', phone: '090-0000-0124', plate: '大阪 300 す 5005', maker: 'ミニ', car_name: 'クーパー', work_type: '一般整備', work_detail: 'エアコン効き悪い', planned_date: d(-2), planned_time: '13:00', sales_staff: '斎藤', work_staff: '田中', memo: '来店確認できず。伝票も未作成。' }),
    booking({ customer_name: '長谷川 誠', phone: '080-0000-0125', plate: '堺 330 さ 6060', maker: 'ボルボ', car_name: 'XC60', work_type: '車検', planned_date: d(6), store: '堺店', state: 'cancelled', memo: 'お客様都合でキャンセル。来月再連絡。' }),
  ];
  const seibi = (s) => ({
    work_sub: '', gm_status: '0', uke_day: null, nko_y_day: null, nko_y_time: '', nko_day: null, sgy_st_day: null, sgy_ed_day: null,
    nsh_y_day: null, nsh_y_time: '', nsh_day: null, loaner_out_day: null, loaner_back_day: null, sales_staff: '', work_staff: '',
    reception_staff: '', memo: '', jocar_created_at: null, is_sample: true, ...s,
  });
  const slips = [
    seibi({ seibi_no: 'SS00000001', car_no: 'SM00000004', work_type: '車検', uke_day: d(-1), nko_day: d(-1), sgy_st_day: d(0), nsh_y_day: d(2), nsh_y_time: '1700', sales_staff: '中村', work_staff: '大西', customer_name: '佐藤 大輔', phone: '090-0000-0104', plate: '練馬 330 む 5420', maker: 'メルセデス・ベンツ', car_name: 'Cクラス' }),
    seibi({ seibi_no: 'SS00000002', car_no: 'SM00000030', work_type: '一般整備', work_sub: 'オイル漏れ修理', uke_day: d(-3), nko_day: d(-3), sgy_st_day: d(-2), sgy_ed_day: d(0), nsh_y_day: d(0), nsh_y_time: '1800', sales_staff: '斎藤', work_staff: '田中', customer_name: '森本 亮介', phone: '090-0000-0130', plate: '大阪 300 ゆ 8080', maker: 'BMW', car_name: '320d' }),
    seibi({ seibi_no: 'SS00000003', car_no: 'SM00000031', work_type: '一般整備', work_sub: '足回り異音', uke_day: d(-10), nko_day: d(-10), sgy_st_day: d(-9), nsh_y_day: d(-2), sales_staff: '中村', work_staff: '大西', memo: '部品取り寄せ中（ドイツから）', customer_name: '竹内 陽子', phone: '080-0000-0131', plate: '堺 330 ま 1717', maker: 'アウディ', car_name: 'Q5' }),
    seibi({ seibi_no: 'SS00000004', car_no: 'SM00000032', work_type: '点検', uke_day: d(-6), nko_day: d(-6), sgy_st_day: d(-6), sgy_ed_day: d(-5), nsh_y_day: d(-5), nsh_day: d(-5), sales_staff: '斎藤', work_staff: '田中', customer_name: '石井 拓海', phone: '090-0000-0132', plate: '大阪 300 あ 2468', maker: 'ポルシェ', car_name: 'カイエン' }),
  ];
  return { bookings, seibi: slips };
}
