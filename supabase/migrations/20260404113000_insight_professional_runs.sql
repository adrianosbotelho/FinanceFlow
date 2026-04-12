create table if not exists public.insight_professional_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  hit_rate_percent numeric(5,2),
  cumulative_edge_value numeric(15,2) not null default 0,
  risk_score numeric(6,2) not null default 0,
  risk_regime text not null check (risk_regime in ('ESTAVEL', 'ATENCAO', 'ESTRESSADO')),
  headline text not null,
  report jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (run_date, year, month)
);

create index if not exists idx_insight_prof_runs_year_month_date
  on public.insight_professional_runs (year, month, run_date desc);

alter table if exists public.insight_professional_runs enable row level security;
revoke all on table public.insight_professional_runs from anon, authenticated;
