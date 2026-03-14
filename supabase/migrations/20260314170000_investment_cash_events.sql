-- Performance simplification: cash events table for aportes/resgates/impostos/taxas

create table if not exists investment_cash_events (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references investments(id) on delete cascade,
  event_date date not null,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  type text not null check (type in ('APORTE', 'RESGATE', 'IMPOSTO', 'TAXA')),
  amount numeric(15,2) not null check (amount >= 0),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_investment_cash_events_year_month
  on investment_cash_events (year, month);

create index if not exists idx_investment_cash_events_investment
  on investment_cash_events (investment_id, year, month);

