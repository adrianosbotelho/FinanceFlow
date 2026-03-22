# Operacao continua (Fase 7)

Objetivo: manter o web/mobile estavel apos publicacao.

## Rotina recomendada

### Diario (antes de abrir o dia)

1. Rodar check remoto:
   - `SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run ops:check`
2. Se falhar, rodar com relatorio:
   - `SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run ops:report`
3. Analisar `reports/ops-report-latest.json`.

### Semanal

1. Revisar latencia media do banco no health.
2. Revisar falhas recorrentes por rota.
3. Atualizar checklist de QA se houver nova funcionalidade.

## Criticidade

- `ok`: todas as rotas OK + env OK + db OK
- `degraded`: uma ou mais rotas com erro
- `critical`: env incompleto ou db indisponivel

## Acoes por status

- `ok`: manter monitoramento.
- `degraded`: investigar rota falha e repetir check.
- `critical`: interromper rollout, corrigir env/db ou executar rollback no Vercel.

## Regra de isolamento

Toda rotina dessa fase ocorre somente em `financeflow-web-mobile/` e nao toca no app desktop.
