# Fase 11 - Seguranca Single User (Login)

Objetivo: restringir o web/mobile a um unico usuario autenticado.

## O que foi implementado

- Login single-user por email/senha (`/login`)
- Sessao por cookie httpOnly assinado (JWT HS256)
- Middleware global bloqueando paginas e APIs sem sessao
- Rotas de auth:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/session`
- Rate limit simples no endpoint de login (tentativas por janela)

## Variaveis obrigatorias

- `AUTH_LOGIN_EMAIL`
- `AUTH_LOGIN_PASSWORD`
- `AUTH_SESSION_SECRET`

## Comportamento esperado

- sem sessao:
  - paginas protegidas redirecionam para `/login`
  - APIs protegidas retornam `401`
- com sessao valida:
  - acesso liberado

## Observacao operacional

Scripts de gate/smoke foram adaptados para funcionar em 2 modos:
- `guard-check` (sem credenciais): valida que o bloqueio esta ativo
- `autenticado` (com `AUTH_EMAIL` e `AUTH_PASSWORD`): valida uso completo autenticado
