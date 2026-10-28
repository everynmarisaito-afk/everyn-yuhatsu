-- GARAGE EVE.RYN 車検誘発ボード
-- 会員システムの Supabase に相乗りする。テーブルはすべて yuhatsu_ で始める。
--
-- 方針
--  * ブラウザから Supabase へ直接アクセスしない。すべて Next.js のサーバー（service_role）経由。
--  * 全テーブルで RLS を有効にし、anon / authenticated には何も許可しない。
--  * ログインは会員システムのスタッフアカウント（auth.users + public.staff_users）を使う。
--  * 車両・顧客の情報は JOCAR（ジョーカー）から取り込んだ写し。正はジョーカー側。
--  * 誘発の状況は「車両 × 車検満了日」ごとに持つ。車検を受けて満了日が変われば新しい周期として最初から。

begin;

-- ---------------------------------------------------------------
-- JOCAR から取り込んだ車両＋保有者の写し（車輌取得API の結果）
-- ---------------------------------------------------------------
create table public.yuhatsu_vehicles (
  car_no            text primary key check (car_no ~ '^[A-Z]{2}[0-9]{8}$'),
  shkn_day          date not null,
  plate_area        text not null default '',
  plate_class       text not null default '',
  plate_kana        text not null default '',
  plate_number      text not null default '',
  maker             text not null default '',
  car_name          text not null default '',
  grade             text not null default '',
  model_year        text not null default '',      -- 年式 yyyymm
  mileage_km        integer,
  koky_no           text,
  customer_name     text not null default '',
  customer_kana     text not null default '',
  tel               text not null default '',
  mobile            text not null default '',
  email             text not null default '',
  email2            text not null default '',
  mobile_email      text not null default '',
  dm_kbn            text not null default '',      -- 案内送付区分 1:要 2:不要 3:拒否
  prefer_tel        boolean not null default false,
  prefer_mail       boolean not null default false,
  prefer_days       text not null default '',      -- 例 "月火水木金"
  prefer_from       text not null default '',      -- HHMM
  prefer_to         text not null default '',
  sales_staff       text not null default '',      -- 営業担当（顧客カルテ）
  service_staff     text not null default '',      -- 作業担当（顧客カルテ）
  is_sample         boolean not null default false,
  synced_at         timestamptz not null default now()
);
create index yuhatsu_vehicles_shkn_idx on public.yuhatsu_vehicles (shkn_day);

-- ---------------------------------------------------------------
-- 誘発の状況（車両 × 満了日）
-- ---------------------------------------------------------------
create table public.yuhatsu_followups (
  car_no           text not null,
  shkn_day         date not null,
  status           text not null default 'none' check (status in ('none','sent','wait','book','done','skip')),
  next_contact_on  date,
  version          integer not null default 1,
  updated_at       timestamptz not null default now(),
  updated_by_name  text not null default '',
  primary key (car_no, shkn_day)
);

-- ---------------------------------------------------------------
-- 連絡記録
-- ---------------------------------------------------------------
create table public.yuhatsu_logs (
  id          uuid primary key default gen_random_uuid(),
  car_no      text not null,
  shkn_day    date not null,
  method      text not null check (method in ('電話','SMS','メール','LINE','DM','来店','その他')),
  memo        text not null default '' check (length(memo) <= 2000),
  staff_id    uuid references public.staff_users(id) on delete set null,
  staff_name  text not null default '',
  created_at  timestamptz not null default now()
);
create index yuhatsu_logs_target_idx on public.yuhatsu_logs (car_no, shkn_day, created_at desc);
create index yuhatsu_logs_staff_idx on public.yuhatsu_logs (staff_id);

-- ---------------------------------------------------------------
-- ログインセッション（クッキーのトークンはハッシュだけ保存）
-- ---------------------------------------------------------------
create table public.yuhatsu_sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique check (length(token_hash) = 64),
  staff_id      uuid not null references public.staff_users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index yuhatsu_sessions_staff_idx on public.yuhatsu_sessions (staff_id);

-- ---------------------------------------------------------------
-- JOCAR 同期の記録
-- ---------------------------------------------------------------
create table public.yuhatsu_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  mode         text not null check (mode in ('sample','jocar')),
  trigger      text not null check (trigger in ('cron','manual')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  fetched      integer not null default 0,
  error        text check (length(error) <= 2000)
);
create index yuhatsu_sync_runs_started_idx on public.yuhatsu_sync_runs (started_at desc);

-- RLS：有効化のみ（ポリシーなし＝ service_role 以外は読めない・書けない）
alter table public.yuhatsu_vehicles  enable row level security;
alter table public.yuhatsu_followups enable row level security;
alter table public.yuhatsu_logs      enable row level security;
alter table public.yuhatsu_sessions  enable row level security;
alter table public.yuhatsu_sync_runs enable row level security;

revoke all on public.yuhatsu_vehicles, public.yuhatsu_followups, public.yuhatsu_logs, public.yuhatsu_sessions, public.yuhatsu_sync_runs from anon, authenticated;

comment on table public.yuhatsu_vehicles  is '車検誘発ボード：JOCAR車輌取得APIから取り込んだ車両と保有者の写し';
comment on table public.yuhatsu_followups is '車検誘発ボード：車両×満了日ごとの誘発ステータス';
comment on table public.yuhatsu_logs      is '車検誘発ボード：連絡記録';
comment on table public.yuhatsu_sessions  is '車検誘発ボード：ログインセッション（トークンのハッシュ）';
comment on table public.yuhatsu_sync_runs is '車検誘発ボード：JOCAR同期の実行記録';

commit;
