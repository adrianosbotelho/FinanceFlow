# Web Mobile - Automação GitHub

## O que foi automatizado

- CI de qualidade já existente (`Web Mobile CI`)
- Gate operacional diário já existente (`Web Mobile Ops Gate`)
- CodeQL (`Web Mobile CodeQL`)
- Secret scan com gitleaks (`Web Mobile Secret Scan`)
- Workflow para aplicar branch protection via API (`Web Mobile Branch Protection`)

## Como ativar branch protection automática

1. Criar o secret do repositório: `REPO_ADMIN_TOKEN`
2. O token deve ser um PAT com permissão:
   - `Administration: Read and write`
3. Rodar manualmente o workflow:
   - `Web Mobile Branch Protection`

Após a execução, a `main` passa a exigir os checks:
- `Web Mobile CI / Lint + Build (web-mobile)`
- `Web Mobile Secret Scan / gitleaks`
- `Web Mobile CodeQL / Analyze (javascript-typescript)`

