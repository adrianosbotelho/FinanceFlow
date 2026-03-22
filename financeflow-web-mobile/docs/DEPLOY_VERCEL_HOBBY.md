# Deploy no Vercel Hobby (.vercel.app)

Objetivo: publicar apenas `financeflow-web-mobile` sem impacto no desktop.

## 1) Criar projeto no Vercel

- Importar o repositorio `FinanceFlow`.
- Em `Root Directory`, selecionar: `financeflow-web-mobile`.
- Framework detectado: Next.js.
- Opcional: manter `Production Branch = main`.

Se o projeto foi criado antes sem Root Directory correto:
- ajustar via API/CLI para `rootDirectory = financeflow-web-mobile`.

## 2) Variaveis de ambiente

Configurar no Vercel (Project Settings > Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL=https://<seu-projeto>.vercel.app`

Observacao:
- `SUPABASE_SERVICE_ROLE_KEY` fica apenas no servidor (API routes).
- nao usar service key no cliente.

## 3) Build settings

- Build command: `npm run build`
- Output: default Next.js
- Install command: `npm install`
- Arquivo de apoio presente no projeto: `vercel.json`

## 4) Validacao pos-deploy

- Rodar local antes do primeiro deploy:
  - `npm run check:env`
  - `npm run lint`
  - `npm run build`
- Abrir `/` e validar cards do dashboard.
- Abrir `/retornos` e inserir um lancamento de teste.
- Confirmar reflexo no dashboard.
- Testar `/investimentos` e `/metas`.
- Testar `/api/health` (deve retornar `status: ok` e checks true).
- Rodar smoke (com app local no ar):
  - `npm run smoke`
- Rodar smoke remoto (apos deploy):
  - `SMOKE_BASE_URL=https://<seu-projeto>.vercel.app npm run smoke:remote`
- Testar PWA (manifest + install).

## Preview por branch (Git)

- Exemplo de branch: `codex/preview-env`.
- Configurar env de preview para a branch desejada.
- Em contas com protecao de preview ativa, a URL preview pode responder `401` sem sessao autenticada no Vercel.

## 5) Regra de seguranca operacional

- Quaisquer ajustes de deploy ficam em `financeflow-web-mobile/`.
- Nao alterar `macos-app/` neste fluxo.
