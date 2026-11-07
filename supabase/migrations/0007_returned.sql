-- 入庫管理：「返却済み」ボタン（お客様に車を返した）
alter table public.nyuko_bookings
  add column returned_at timestamptz,
  add column returned_by_name text not null default '' check (length(returned_by_name) <= 50);
alter table public.nyuko_walkin_flags
  add column returned_at timestamptz,
  add column returned_by_name text not null default '' check (length(returned_by_name) <= 50);
comment on column public.nyuko_bookings.returned_at is '「返却済み」ボタン（お客様に車を返した）を押した日時';
comment on column public.nyuko_walkin_flags.returned_at is '「返却済み」ボタン（お客様に車を返した）を押した日時';
