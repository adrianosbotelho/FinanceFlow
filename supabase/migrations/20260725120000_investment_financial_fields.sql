-- Add financial fields to investments table for per-investment forecast and analysis
alter table investments
  add column if not exists cdi_rate numeric(6,2) default null,
  add column if not exists benchmark text default null,
  add column if not exists start_date date default null,
  add column if not exists liquidity text default null,
  add column if not exists maturity_date date default null;

comment on column investments.cdi_rate is 'Percentage of CDI for this CDB (e.g. 110 means 110% CDI). NULL uses portfolio default.';
comment on column investments.benchmark is 'Benchmark description (e.g. "110% CDI", "IPCA+6%")';
comment on column investments.start_date is 'Investment start date';
comment on column investments.liquidity is 'Liquidity type (e.g. "diária", "no vencimento", "D+30")';
comment on column investments.maturity_date is 'Maturity/expiration date of the investment';
