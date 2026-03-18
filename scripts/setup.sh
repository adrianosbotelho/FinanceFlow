#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==> Installing npm dependencies"
npm install

if [ ! -f ".env.local" ]; then
  echo "==> Creating .env.local"
  cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
EOF
  echo "   - Preencha NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_ANON_KEY com os dados do seu projeto Supabase."
fi

echo
echo "Setup concluído."
echo "Próximos passos:"
echo "1) Aplique supabase/schema.sql e supabase/seed.sql no Supabase (SQL Editor)."
echo "2) Rode: npm run dev"
