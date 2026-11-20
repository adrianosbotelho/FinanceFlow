-- Aparelhos confiáveis do login do mobile (verificação em duas etapas): cada aparelho que confirmou o
-- código de verificação recebe um cookie assinado com este id. Usado por
-- financeflow-web-mobile/lib/trusted-devices.ts; revogar = preencher revoked_at.
create table if not exists public.trusted_devices (
  id uuid primary key,
  label text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.trusted_devices enable row level security;
revoke all on table public.trusted_devices from anon, authenticated;
