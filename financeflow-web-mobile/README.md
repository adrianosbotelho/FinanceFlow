# FinanceFlow Web Mobile (Projeto Isolado)

Versao web/mobile (PWA) para iPhone, separada do app desktop/macOS.

Objetivo: permitir consulta e atualizacao de:
- Dashboard
- Retornos Mensais (CRUD)
- Investimentos
- Metas

## Regra de isolamento

- Este projeto vive em `financeflow-web-mobile/`.
- Nao altera `macos-app/` nem build desktop.
- Mesma base Supabase, camada de UI/deploy separada.

## Setup rapido

1. Criar `.env.local` com base em `.env.example`.
2. Instalar dependencias:

```bash
npm install
```

3. Rodar em dev:

```bash
npm run dev
```

4. Validar:

```bash
npm run check:env
npm run lint
npm run build
```

Smoke local (com servidor `npm run dev` ativo):

```bash
npm run smoke
```

Smoke remoto (deploy Vercel):

```bash
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run smoke:remote
```

Check operacional continuo (pos go-live):

```bash
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run ops:check
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run ops:report
```

Gate de release com evidencias:

```bash
SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run release:gate
```

CI/CD automatizado:
- CI (lint/build): `.github/workflows/web-mobile-ci.yml`
- Gate operacional diario: `.github/workflows/web-mobile-ops-gate.yml`

Preflight completo (lint + build + smoke):

```bash
npm run qa:preflight
```

## Fases do plano

- Fase 0: isolamento (concluida)
- Fase 1/2: paginas e APIs base (concluida)
- Fase 3: PWA (concluida)
- Fase 4: deploy Vercel Hobby (checklist em docs)
- Fase 5: QA iPhone/PWA (checklist em docs)

## Documentacao

- `docs/REPO_STRATEGY.md`
- `docs/PHASE_PROGRESS.md`
- `docs/DEPLOY_VERCEL_HOBBY.md`
- `docs/QA_IPHONE_PWA.md`
