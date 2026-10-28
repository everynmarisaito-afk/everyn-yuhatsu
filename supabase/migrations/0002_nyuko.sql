-- GARAGE EVE.RYN 入庫管理（車検・一般整備・点検）
-- 予約はこのアプリで持ち、入庫後はジョーカーの整備伝票（整備取得API）を読んで進み具合を出す。
-- 方針は 0001 と同じ：RLS 有効・ポリシーなし（service_role のサーバーからだけ読み書き）。

begin;

-- ---------------------------------------------------------------
-- JOCAR 整備伝票の写し（整備取得API）
-- ---------------------------------------------------------------
create table public.nyuko_seibi (
  seibi_no         text primary key check (seibi_no ~ '^[A-Z]{2}[0-9]{8}$'),
  car_no           text,
  work_type        text not null default '',   -- 作業区分名（車検／点検／一般整備／部品…）
  work_sub         text not null default '',   -- 作業小区分名
  gm_status        text not null default '',   -- 0:見積 1:売上決定
  uke_day          date,                       -- 受付日
  nko_y_day        date,                       -- 入庫予定日
  nko_y_time       text not null default '',
  nko_day          date,                       -- 入庫日
  sgy_st_day       date,                       -- 作業開始日
  sgy_ed_day       date,                       -- 作業終了日
  nsh_y_day        date,                       -- 納車予定日
  nsh_y_time       text not null default '',
  nsh_day          date,                       -- 納車日
  loaner_out_day   date,
  loaner_back_day  date,
  sales_staff      text not null default '',
  work_staff       text not null default '',
  reception_staff  text not null default '',
  memo             text not null default '',
  customer_name    text not null default '',
  phone            text not null default '',
  plate            text not null default '',
  maker            text not null default '',
  car_name         text not null default '',
  jocar_created_at timestamptz,
  is_sample        boolean not null default false,
  synced_at        timestamptz not null default now()
);
create index nyuko_seibi_car_idx on public.nyuko_seibi (car_no);

-- ---------------------------------------------------------------
-- 入庫予約（アプリで管理）
-- ---------------------------------------------------------------
create table public.nyuko_bookings (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null default 'manual' check (source in ('manual','yuhatsu','member_app')),
  car_no                 text check (car_no is null or car_no ~ '^[A-Z]{2}[0-9]{8}$'),
  shkn_day               date,                 -- 誘発から作った場合の車検満了日（誘発の周期と結ぶ）
  member_reservation_id  uuid unique references public.reservations(id) on delete set null,
  customer_name          text not null default '' check (length(customer_name) <= 100),
  customer_kana          text not null default '' check (length(customer_kana) <= 100),
  phone                  text not null default '' check (length(phone) <= 30),
  plate                  text not null default '' check (length(plate) <= 40),
  maker                  text not null default '' check (length(maker) <= 50),
  car_name               text not null default '' check (length(car_name) <= 100),
  work_type              text not null default '一般整備' check (work_type in ('車検','点検','一般整備','その他')),
  work_detail            text not null default '' check (length(work_detail) <= 1000),
  store                  text not null default '大阪店' check (store in ('大阪店','堺店','世田谷店','その他')),
  planned_date           date not null,
  planned_time           text not null default '' check (planned_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or planned_time = ''),
  return_planned_date    date,
  loaner                 boolean not null default false,
  sales_staff            text not null default '' check (length(sales_staff) <= 50),
  work_staff             text not null default '' check (length(work_staff) <= 50),
  memo                   text not null default '' check (length(memo) <= 2000),
  state                  text not null default 'booked' check (state in ('booked','cancelled','no_show')),
  hold_reason            text not null default '' check (hold_reason in ('','部品待ち','お客様確認待ち','見積待ち','外注待ち','その他')),
  seibi_no               text unique,          -- 結び付いたジョーカーの整備伝票
  link_mode              text check (link_mode in ('auto','manual')),
  unlinked_seibi         text[] not null default '{}', -- 手で外した伝票（自動で結び直さない）
  is_sample              boolean not null default false,
  version                integer not null default 1,
  created_by_name        text not null default '',
  updated_by_name        text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index nyuko_bookings_planned_idx on public.nyuko_bookings (planned_date);
create index nyuko_bookings_car_idx on public.nyuko_bookings (car_no);
create index nyuko_bookings_yuhatsu_idx on public.nyuko_bookings (car_no, shkn_day);

alter table public.nyuko_seibi    enable row level security;
alter table public.nyuko_bookings enable row level security;
revoke all on public.nyuko_seibi, public.nyuko_bookings from anon, authenticated;

comment on table public.nyuko_seibi    is '入庫管理：JOCAR整備取得APIから取り込んだ整備伝票の写し';
comment on table public.nyuko_bookings is '入庫管理：入庫予約（車検・一般整備・点検）。ジョーカーの整備伝票と自動で結び付く';

commit;
