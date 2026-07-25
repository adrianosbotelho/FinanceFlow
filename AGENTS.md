# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

FinanceFlow is a Next.js 14 (App Router) passive income dashboard for Brazilian investments (CDBs and FIIs). It uses Supabase (PostgreSQL) as the backend, Recharts for charts, and Tailwind CSS for styling. The UI is in Brazilian Portuguese. Three surfaces: desktop web, macOS Electron app, and a mobile PWA (separate subproject).

### Critical rules

1. **Never touch the mobile app** (`financeflow-web-mobile/`) unless explicitly instructed.
2. **Always build at the end of each change**: run `node macos-app/build-standalone.js` (not just `npm run build`).
3. **Don't break what works** — the dashboard, charts, tables, and analyses must keep functioning. When in doubt, ask.
4. **Commit, push, and merge** at the end of each task.
5. **Tailwind dynamic classes** — never construct class names dynamically (e.g., `grid-cols-${n}`). Use literal strings or add to `safelist` in `tailwind.config.ts`.

### Desktop app workflow

The macOS Electron app serves from `.next/standalone/`. Important:

- `npm run build` alone is **NOT enough** for Electron — it doesn't copy `.next/static/` into standalone.
- Use `npm run build:desktop` or `node macos-app/build-standalone.js` which does: build + copy static + copy public + prepare standalone.
- To test: `npm run desktop` (builds + opens Electron).
- The packaged `.app` in `dist/mac-arm64/` is a **separate artifact** — it must be rebuilt with `cd macos-app && npx electron-builder --mac` to include latest code.
- For daily dev/testing, `npm run desktop` or `cd macos-app && npx electron .` is faster.

### Branch protection

- `main` requires PR + status checks (Boundary Guard must pass).
- The Boundary Guard blocks PRs that touch both desktop and mobile files.
- Mobile CI checks (Lint+Build, CodeQL, gitleaks) only trigger on `financeflow-web-mobile/` changes.
- Merge must be done via GitHub UI by the repo owner (admin bypass required for checks that don't trigger).

### Running services

- **Next.js dev server**: `npm run dev` (port 3000)
- **Local Supabase**: requires Docker. Run `supabase start` from the repo root (API on 54321, Studio on 54323, DB on 54322).

### Database setup

Migrations in `supabase/migrations/` are applied automatically by `supabase start`. Seed data from `supabase/seed.sql`.

### Environment variables

The app reads from `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service role key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Standard commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (standalone) |
| `npm run build:desktop` | Build + copy static for Electron |
| `npm run desktop` | Build + open Electron app |
| `npm run lint` | ESLint |
| `npm run guard:boundary` | Check desktop/mobile scope isolation |

### Docker in Cloud VM

Docker must be started with `sudo dockerd` before `supabase start`. Requires fuse-overlayfs storage driver and iptables-legacy. Run `sudo chmod 666 /var/run/docker.sock` after starting dockerd.
