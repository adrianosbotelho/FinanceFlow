-- Daily insights agent runs (Nível 4)

create table if not exists insight_daily_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  year smallint not null,
  radar_status text not null check (radar_status in ('VERDE', 'AMARELO', 'VERMELHO')),
  confidence_percent numeric(5,2) not null check (confidence_percent >= 0 and confidence_percent <= 100),
  generated_by text not null check (generated_by in ('rule', 'llm')),
  llm_model text,
  headline text not null,
  report jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (run_date, year)
);

create index if not exists idx_insight_daily_runs_year_date
  on insight_daily_runs (year, run_date desc);
