# Estrategia de isolamento: repositorio proprio vs pasta isolada

## Decisao recomendada (agora)

Usar **pasta isolada** dentro do repositorio atual:
- caminho: `financeflow-web-mobile/`
- motivo: entrega mais rapida, reaproveita CI local, mesma base de dados, menor overhead operacional
- risco desktop: baixo, desde que alteracoes fiquem restritas a essa pasta

## Quando migrar para repositorio proprio

Migrar para repo proprio quando ocorrer pelo menos 2 itens:
- time separado para web/mobile
- ciclo de release independente do desktop
- necessidade de politicas/permissions diferentes
- volume alto de PRs cruzando desktop e web

## Modo de falha e mitigacao

- Falha: alteracao acidental no desktop.
  - Mitigacao: revisar `git status` e commitar somente `financeflow-web-mobile/*`.
- Falha: conflito de env entre apps.
  - Mitigacao: manter `.env.local` separado por projeto.
- Falha: deploy quebrar por falta de chave service role.
  - Mitigacao: checklist em `DEPLOY_VERCEL_HOBBY.md`.
