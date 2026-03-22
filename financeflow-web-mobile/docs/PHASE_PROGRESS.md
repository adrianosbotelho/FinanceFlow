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
- smoke tecnico local implementado (`npm run smoke`)
- smoke executado com sucesso estrutural (sem env Supabase completo)
- pagina `/health` adicionada para validar backend/env + cliente/PWA
- `qa:preflight` adicionado para execucao rapida de validacao continua

## Fase 6 - Go-Live controlado

Status: CONCLUIDA (readiness tecnica)
- runbook de publicacao e rollback em `GO_LIVE_RUNBOOK.md`
- smoke remoto por URL de deploy (`npm run smoke:remote`)
- health com ping real de banco e latencia

## Fase 7 - Operacao continua

Status: CONCLUIDA (instrumentacao)
- playbook operacional em `OPERACAO_CONTINUA.md`
- check remoto operacional (`npm run ops:check`)
- geracao de relatorio de incidente (`npm run ops:report`)

## Fase 8 - Integracao Git + Preview no Vercel

Status: CONCLUIDA
- repositorio GitHub conectado ao projeto Vercel
- `rootDirectory` configurado para `financeflow-web-mobile`
- env de Preview configuradas para a branch `codex/preview-env`
- deploy Preview validado (com protecao 401 padrao do Vercel em URL nao customizada)

## Fase 9 - Release Gate e evidencias

Status: CONCLUIDA (instrumentacao)
- comando `release:gate` para aprovar/bloquear release
- relatorio Markdown automatico em `reports/`
- playbook da fase em `RELEASE_GATE.md`
