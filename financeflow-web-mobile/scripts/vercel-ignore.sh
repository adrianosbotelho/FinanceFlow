#!/bin/bash
# "Ignored Build Step" da Vercel (vercel.json → ignoreCommand, limitado a 256 caracteres).
# exit 0 = pular o build; exit 1 = buildar.

# Previews do Dependabot fora da main não são buildados.
if [ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ "$VERCEL_GIT_COMMIT_AUTHOR_LOGIN" = "dependabot[bot]" ]; then
  echo "Preview do Dependabot ignorado"
  exit 0
fi

# Só builda quando algo nesta pasta (financeflow-web-mobile/) mudou no commit.
if git diff --quiet HEAD^ HEAD -- . 2>/dev/null; then
  echo "Sem mudancas em financeflow-web-mobile: build ignorado"
  exit 0
fi
exit 1
