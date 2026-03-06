# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

FinanceFlow is a Next.js 14 (App Router) passive income dashboard for Brazilian investments (CDBs and FIIs). It uses Supabase (PostgreSQL) as the backend, Recharts for charts, and Tailwind CSS for styling. The UI is in Brazilian Portuguese.

### Running services

- **Next.js dev server**: `npm run dev` (port 3000)
- **Local Supabase**: requires Docker. Run `supabase start` from the repo root to start a local Supabase instance (API on port 54321, Studio on 54323, DB on 54322). The CLI reads `supabase/config.toml`.

### Database setup

Before `supabase start` will succeed, the schema migration must exist at `supabase/migrations/20240101000000_init.sql` (copied from `supabase/schema.sql`). Seed data is automatically loaded from `supabase/seed.sql`.

### Environment variables

The app reads from `.env.local`. For local Supabase, use:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start output>
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Standard commands

See `package.json` scripts: `npm run dev`, `npm run build`, `npm run lint`, `npm run setup`.

### Known issues

- `supabase/seed.sql` line 143 had a malformed UUID (`55555555-5555-5555-555555555555` missing the `5555-` segment). This was fixed.
- The `.eslintrc.json` file was missing from the repo; `next lint` prompts interactively without it. It was created with `{"extends": "next/core-web-vitals"}`.

### Docker in Cloud VM

Docker must be started with `sudo dockerd` before `supabase start`. The Docker daemon requires fuse-overlayfs storage driver and iptables-legacy (already configured during initial setup). Run `sudo chmod 666 /var/run/docker.sock` after starting dockerd to allow non-root access.
