# Fase 9 - Release Gate e Evidencias

Objetivo: ter um criterio objetivo de liberacao com evidencias tecnicas + checklist manual.

## Comando unico

```bash
SMOKE_BASE_URL=https://financeflow-web-mobile.vercel.app npm run release:gate
```

Resultado:
- gera `reports/release-gate-<timestamp>.md`
- atualiza `reports/release-gate-latest.md`
- status `APROVADO` ou `BLOQUEADO`

## Regra de aprovacao

- Gate tecnico:
  - rotas principais 200
  - `health` com env OK
  - `health` com db OK
- Gate manual:
  - checklist iPhone preenchido

## Quando bloquear release

- qualquer rota falhar
- env incompleto
- db indisponivel

## Relacao com fases anteriores

- complementa a Fase 5 (QA manual)
- usa instrumentacao da Fase 6 e Fase 7
