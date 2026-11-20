-- Parâmetros editáveis na página Configurações (/settings): chave → valor.
-- As chaves válidas e seus limites ficam em lib/app-settings.ts; sem linha, vale o padrão.
create table if not exists public.app_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
