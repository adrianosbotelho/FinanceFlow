-- FinanceFlow database schema

create extension if not exists "pgcrypto";

create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('CDB', 'FII')),
  institution text not null,
  name text not null,
  amount_invested numeric(15,2) not null,
  created_at timestamptz default now()
);

create table if not exists monthly_returns (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references investments(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year smallint not null,
  income_value numeric(15,2) not null,
  created_at timestamptz default now(),
  unique (investment_id, month, year)
);

create index if not exists idx_monthly_returns_year_month
  on monthly_returns (year, month);

create index if not exists idx_monthly_returns_investment
  on monthly_returns (investment_id);
