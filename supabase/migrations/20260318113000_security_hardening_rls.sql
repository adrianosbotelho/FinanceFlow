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
revoke all on table public.investments from anon, authenticated;
revoke all on table public.monthly_returns from anon, authenticated;
revoke all on table public.monthly_closures from anon, authenticated;
revoke all on table public.monthly_positions from anon, authenticated;
revoke all on table public.monthly_macro from anon, authenticated;
revoke all on table public.investment_goals from anon, authenticated;
revoke all on table public.investment_goals_monthly from anon, authenticated;
revoke all on table public.investment_goals_annual from anon, authenticated;
revoke all on table public.investment_cash_events from anon, authenticated;
revoke all on table public.insight_daily_runs from anon, authenticated;
