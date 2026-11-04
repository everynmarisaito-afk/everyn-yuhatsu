-- 入庫管理：「入庫未定」（見積だけ送って、まだ入庫していない）
alter table public.nyuko_bookings drop constraint if exists nyuko_bookings_hold_reason_check;
alter table public.nyuko_bookings add constraint nyuko_bookings_hold_reason_check
  check (hold_reason in ('','部品待ち','保留','入庫未定','お客様確認待ち','見積待ち','外注待ち','その他'));
alter table public.nyuko_walkin_flags drop constraint if exists nyuko_walkin_flags_hold_reason_check;
alter table public.nyuko_walkin_flags add constraint nyuko_walkin_flags_hold_reason_check
  check (hold_reason in ('','部品待ち','保留','入庫未定'));
