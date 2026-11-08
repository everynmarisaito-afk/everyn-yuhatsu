-- 入庫管理：メンバーサービス加入を手動で指定（自動の突き合わせで判定できない車のため）
alter table public.nyuko_bookings
  add column member_override text not null default '' check (member_override in ('','member','none'));
alter table public.nyuko_walkin_flags
  add column member_override text not null default '' check (member_override in ('','member','none'));
comment on column public.nyuko_bookings.member_override is 'メンバーサービス加入を手動で指定（空=自動判定）';
comment on column public.nyuko_walkin_flags.member_override is 'メンバーサービス加入を手動で指定（空=自動判定）';
