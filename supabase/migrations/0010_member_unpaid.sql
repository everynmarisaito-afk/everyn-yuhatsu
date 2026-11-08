-- 入庫管理：メンバーサービスの手動指定に「未払い」を追加
alter table public.nyuko_bookings drop constraint if exists nyuko_bookings_member_override_check;
alter table public.nyuko_bookings add constraint nyuko_bookings_member_override_check check (member_override in ('','member','unpaid','none'));
alter table public.nyuko_walkin_flags drop constraint if exists nyuko_walkin_flags_member_override_check;
alter table public.nyuko_walkin_flags add constraint nyuko_walkin_flags_member_override_check check (member_override in ('','member','unpaid','none'));
