# Go-Live Runbook (Web/Mobile)

Objetivo: publicar com seguranca no Vercel Hobby sem impacto no desktop.

## Etapa 1 - Gate local (obrigatorio)

No diretorio `financeflow-web-mobile/`:

1. `npm run check:env`
2. `npm run qa:preflight`

Se qualquer comando falhar, nao publicar.

## Etapa 2 - Deploy

1. Push para `main`.
2. Confirmar deploy verde no Vercel.
3. Confirmar envs do projeto no painel do Vercel.

## Etapa 3 - Gate remoto (obrigatorio)

Executar:

```bash
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run smoke:remote
```

Criterio:
- todas as rotas `OK`
- health com `env=OK` e `db=OK`

## Etapa 4 - QA manual iPhone

Seguir `docs/QA_IPHONE_PWA.md`.

## Etapa 5 - Operacao apos publicacao

No primeiro dia de producao:

```bash
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run ops:check
```

Se falhar:

```bash
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run ops:report
```

## Rollback

Se o gate remoto falhar ou QA iPhone tiver regressao:

1. Reverter para o deploy anterior no Vercel (Promote previous deployment).
2. Abrir issue com data/hora + erro + rota.
3. Corrigir no branch e repetir gates.
