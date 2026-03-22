# Fase 10 - CI/CD Automation

Objetivo: automatizar qualidade e gate operacional sem impactar o desktop.

## Workflows adicionados

- `.github/workflows/web-mobile-ci.yml`
  - roda em `push` e `pull_request` (somente quando muda `financeflow-web-mobile/**`)
  - executa `npm ci`, `npm run lint`, `npm run build`

- `.github/workflows/web-mobile-ops-gate.yml`
  - roda diariamente e por disparo manual
  - executa `npm run release:gate` contra producao
  - publica artefato com `release-gate-latest.md`

## Beneficio pratico

- evita regressao silenciosa no web/mobile
- deixa evidencia automatica de saude para cada execucao agendada
- mantem separacao do app desktop (macOS)
