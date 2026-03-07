# FinanceFlow — app macOS (Electron)

Wrapper Electron para rodar o FinanceFlow (Next.js) como aplicativo nativo no macOS.

## Pré-requisitos

- Node.js instalado (para rodar o servidor Next.js empacotado).
- Na raiz do repositório: dependências instaladas (`npm install`) e variáveis de ambiente configuradas (`.env.local` com Supabase). O build do Next usa essas variáveis; o app empacotado pode ler um `.env` junto ao `.app` ou usar as variáveis do sistema (documente para o usuário final).

## Desenvolvimento (Next em modo dev + janela Electron)

Na pasta **macos-app**:

```bash
npm install
npm run dev
```

Isso sobe o servidor de desenvolvimento Next.js na raiz do projeto e abre uma janela Electron em `http://localhost:3000`.

> Observação: no modo `dev`, o script espera o Next subir na porta `3000` (comportamento padrão do `npm run dev` da raiz).

## Gerar o .app (build standalone + Electron)

1. Na **raiz** do projeto, configure o Supabase em `.env.local` e instale dependências:

   ```bash
   npm install
   npm run build
   ```

2. Na pasta **macos-app**:

   ```bash
   npm install
   npm run build
   ```

O script `build` faz:

- Chama o build Next.js na raiz (se ainda não tiver feito) e gera `.next/standalone`.
- Copia `.next/static` e `public` para dentro do standalone.
- Copia o standalone para `macos-app/standalone`.
- Roda o electron-builder e gera o `.app` (e opcionalmente `.dmg` / `.zip`) em `macos-app/dist/`.

O executável fica em algo como: `macos-app/dist/FinanceFlow.app`.

## Rodar o .app sem empacotar de novo

Se você já fez o build na raiz e só quer abrir a janela Electron usando o standalone local (sem gerar o instalador):

```bash
cd macos-app
npm start
```

O `main.js` usa o standalone em `../.next/standalone` (com `server.js`). Certifique-se de que na raiz já rodou `npm run build` e que existe `.next/standalone/server.js`.

## Variáveis de ambiente no app empacotado

O processo do servidor Next.js (spawnado pelo Electron) herda o ambiente. Para o usuário final, você pode:

- Colocar um `.env` ou `.env.local` no mesmo diretório do `FinanceFlow.app`, ou
- Documentar que é preciso definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (por exemplo no perfil do shell ou em um script que abre o app).

O app usa porta fixa **3000**; não é necessário definir `NEXT_PUBLIC_BASE_URL` para o front (requisições são para a mesma origem).

## Startup robusto (porta, timeout e env)

- O app tenta iniciar na porta preferida `3000`. Se ela estiver ocupada, faz fallback automático para a próxima porta livre (`3001`, `3002`, ...), até 20 tentativas.
- Você pode definir a porta preferida com `FINANCEFLOW_PORT` (ex.: `FINANCEFLOW_PORT=3010`).
- Timeout de boot do servidor: padrão de 30s. Para ajustar, use `FINANCEFLOW_SERVER_START_TIMEOUT_MS`.
- Antes de iniciar, o app valida:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Se faltar alguma variável obrigatória, o app exibe erro claro e encerra.

Arquivos `.env` lidos automaticamente (quando existirem):
- `./.env.local` e `./.env` (diretório atual do processo)
- `standalone/.env.local` e `standalone/.env`
- em app empacotado: `.env.local` e `.env` no diretório que contém o `.app`

## Menu nativo (macOS)

No menu `FinanceFlow`:
- `Abrir Configuração (.env.local)`: abre o arquivo de configuração em `~/Library/Application Support/FinanceFlow/.env.local`.
- `Abrir Logs`: abre `~/Library/Logs/FinanceFlow.log`.
- `Diagnóstico`: mostra status rápido do servidor, porta usada, env obrigatório e paths em uso.
- `Abrir no login`: ativa/desativa inicialização automática do app no login do macOS.
