## FinanceFlow - Passive Income Dashboard

### Como iniciar rapidamente

1. **Clonar o repositório** (se ainda não estiver local).
2. No diretório do projeto, execute:

```bash
npm run setup
```

Esse comando:
- instala automaticamente as dependências (`npm install`)
- cria um arquivo `.env.local` com:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_BASE_URL=http://localhost:3000`

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os dados do seu projeto Supabase.

3. No painel do Supabase, no **SQL Editor**, execute em ordem:
   - o conteúdo de `supabase/schema.sql`
   - o conteúdo de `supabase/seed.sql`

4. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O dashboard ficará disponível em `http://localhost:3000`.

### Smoke tests rápidos

- API local (com servidor rodando): `npm run smoke:api`
- App macOS (build + artefatos): `npm run smoke:macos`
- Checklist de release local (web + macOS): `npm run release:check`

---

### Iniciar automaticamente no macOS (opcional)

Para o servidor de desenvolvimento subir sozinho ao fazer login no Mac:

```bash
bash scripts/install-launch-agent.sh
```

- O app passa a iniciar no login e a ficar rodando em segundo plano.
- Logs: `~/Library/Logs/FinanceFlow-dev.log`.
- Para parar: `launchctl unload ~/Library/LaunchAgents/com.financeflow.dev.plist`
- Para desinstalar (não iniciar mais no login): `bash scripts/uninstall-launch-agent.sh`
