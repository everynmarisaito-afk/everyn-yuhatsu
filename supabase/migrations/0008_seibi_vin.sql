-- 入庫管理：メンバーサービス加入の判定用に、整備伝票の車両の車台番号を持つ
alter table public.nyuko_seibi add column vin text not null default '';
comment on column public.nyuko_seibi.vin is '車台番号（JOCAR ShataiNo を半角・大文字・記号なしにそろえたもの）。会員システムの vehicles.vin と突き合わせる';
