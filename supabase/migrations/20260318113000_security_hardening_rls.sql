-- Security hardening for Supabase Security Advisor findings
-- Goal: prevent public Data API exposure from tables in public schema.

-- 1) Enable RLS on all application tables in public schema.
alter table if exists public.investments enable row level security;
alter table if exists public.monthly_returns enable row level security;
alter table if exists public.monthly_closures enable row level security;
alter table if exists public.monthly_positions enable row level security;
alter table if exists public.monthly_macro enable row level security;
alter table if exists public.investment_goals enable row level security;
alter table if exists public.investment_goals_monthly enable row level security;
alter table if exists public.investment_goals_annual enable row level security;
alter table if exists public.investment_cash_events enable row level security;
alter table if exists public.insight_daily_runs enable row level security;

-- 2) Revoke direct table access from API roles.
-- App access should happen via server backend with SUPABASE_SERVICE_ROLE_KEY.
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'investments', 'monthly_returns', 'monthly_closures',
      'monthly_positions', 'monthly_macro', 'investment_goals',
      'investment_goals_monthly', 'investment_goals_annual',
      'investment_cash_events', 'insight_daily_runs'
    ])
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = tbl) then
      execute format('revoke all on table public.%I from anon, authenticated', tbl);
    end if;
  end loop;
end;
$$;
