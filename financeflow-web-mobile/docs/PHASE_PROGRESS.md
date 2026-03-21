# Progresso por fase

## Fase 0 - Isolamento

Status: CONCLUIDA
- projeto separado em `financeflow-web-mobile/`
- nenhum arquivo de `macos-app/` alterado

## Fase 1/2 - Base funcional web/mobile

Status: CONCLUIDA
- Dashboard: leitura de KPIs e historico mensal
- Retornos: CRUD mensal (listar, inserir, editar, excluir)
- Investimentos: carteira e exposicao
- Metas: leitura mensal e anual
- APIs dedicadas em `app/api/*`

## Fase 3 - PWA

Status: CONCLUIDA
- `public/manifest.webmanifest`
- `public/sw.js`
- pagina offline em `/offline`
- registro de service worker no layout

## Fase 4 - Deploy Vercel Hobby

Status: CONCLUIDA (readiness tecnica)
- checklist completo em `DEPLOY_VERCEL_HOBBY.md`
- `vercel.json` adicionado
- `app/api/health` para validacao rapida
- scripts `check:env` e `smoke` adicionados

## Fase 5 - QA iPhone/PWA

Status: EM ANDAMENTO
- checklist completo em `QA_IPHONE_PWA.md`
