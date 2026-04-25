alter table if exists public.monthly_return_revisions enable row level security;

revoke all on table public.monthly_return_revisions from anon, authenticated;
