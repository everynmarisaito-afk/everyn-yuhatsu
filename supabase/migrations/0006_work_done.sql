-- 入庫管理：「作業済み」ボタン
alter table public.nyuko_bookings
  add column work_done_at timestamptz,
  add column work_done_by_name text not null default '' check (length(work_done_by_name) <= 50);
alter table public.nyuko_walkin_flags
  add column work_done_at timestamptz,
  add column work_done_by_name text not null default '' check (length(work_done_by_name) <= 50);
comment on column public.nyuko_bookings.work_done_at is '「作業済み」ボタンを押した日時';
comment on column public.nyuko_walkin_flags.work_done_at is '「作業済み」ボタンを押した日時';
