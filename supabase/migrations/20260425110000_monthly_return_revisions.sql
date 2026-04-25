create table if not exists public.monthly_return_revisions (
  id uuid primary key default gen_random_uuid(),
  monthly_return_id uuid references public.monthly_returns(id) on delete set null,
  investment_id uuid not null references public.investments(id) on delete cascade,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  previous_income_value numeric(15,2),
  new_income_value numeric(15,2) not null,
  delta_income_value numeric(15,2) not null,
  action text not null check (action in ('CREATE', 'UPDATE')),
  created_at timestamptz default now()
);

create index if not exists idx_monthly_return_revisions_year_month
  on public.monthly_return_revisions (year, month);

create index if not exists idx_monthly_return_revisions_investment
  on public.monthly_return_revisions (investment_id, year, month);
