# QA iPhone / PWA

## Pre-condicoes

- deploy publicado em `https://<projeto>.vercel.app`
- envs do Supabase corretas no Vercel

## Checklist funcional

- Dashboard carrega sem erro.
- Retornos lista dados do ano atual.
- Inserir retorno mensal e confirmar persistencia.
- Editar retorno e confirmar atualizacao.
- Excluir retorno e confirmar remocao.
- Investimentos carrega carteira e percentuais.
- Metas carrega mensal e anual.

## Checklist iPhone

- Abrir no Safari iOS.
- `Compartilhar > Adicionar a Tela de Inicio`.
- Abrir app instalado em modo standalone.
- Navegar pelas 4 telas pelo menu inferior.
- Fechar e reabrir o app, mantendo sessao de uso.

## Checklist offline

- Com app aberto, desativar internet.
- Reabrir e validar fallback `/offline`.
- Reativar internet e confirmar recuperacao.

## Criterio de aceite

- Nenhum erro 500 nas APIs internas.
- CRUD de retornos funcional no iPhone.
- App instalavel como PWA.
