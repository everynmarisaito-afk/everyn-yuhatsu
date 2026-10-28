-- 入庫管理：アプリの「入庫済み」ボタン用
alter table public.nyuko_bookings
  add column arrived_at timestamptz,
  add column arrived_by_name text not null default '' check (length(arrived_by_name) <= 50);
comment on column public.nyuko_bookings.arrived_at is 'アプリの「入庫済み」ボタンを押した日時（ジョーカー伝票が来る前の入庫記録）';
