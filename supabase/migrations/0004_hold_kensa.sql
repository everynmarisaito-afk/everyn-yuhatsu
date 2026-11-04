-- 入庫管理：見積後の「部品待ち」「保留」と、車検の「検査ライン済み」
alter table public.nyuko_bookings drop constraint if exists nyuko_bookings_hold_reason_check;
alter table public.nyuko_bookings add constraint nyuko_bookings_hold_reason_check
  check (hold_reason in ('','部品待ち','保留','お客様確認待ち','見積待ち','外注待ち','その他'));
alter table public.nyuko_bookings
  add column kensa_at timestamptz,
  add column kensa_by_name text not null default '' check (length(kensa_by_name) <= 50);
comment on column public.nyuko_bookings.kensa_at is '車検：検査ライン済みボタンを押した日時';

-- 予約なし入庫（ジョーカー伝票だけの車）にも同じ印を付けるための表
create table public.nyuko_walkin_flags (
  seibi_no         text primary key check (seibi_no ~ '^[A-Z]{2}[0-9]{8}$'),
  hold_reason      text not null default '' check (hold_reason in ('','部品待ち','保留')),
  kensa_at         timestamptz,
  kensa_by_name    text not null default '' check (length(kensa_by_name) <= 50),
  version          integer not null default 1,
  updated_by_name  text not null default '',
  updated_at       timestamptz not null default now()
);
alter table public.nyuko_walkin_flags enable row level security;
revoke all on public.nyuko_walkin_flags from anon, authenticated;
comment on table public.nyuko_walkin_flags is '入庫管理：予約なし入庫（ジョーカー伝票のみ）の部品待ち・保留・検査ライン済み';
