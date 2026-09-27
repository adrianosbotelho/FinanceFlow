# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

## Projeto

**FinanceFlow** — dashboard pessoal de renda passiva para investimentos brasileiros (CDBs e FIIs).
Next.js 14 (App Router) + Supabase (PostgreSQL) + Recharts + Tailwind. **UI inteiramente em pt-BR.**

Três superfícies no mesmo repositório:

| Superfície | Diretório | Observação |
|---|---|---|
| Web desktop | raiz (`app/`, `components/`, `lib/`) | superfície principal |
| App macOS | `macos-app/` (Electron) | serve `.next/standalone/` |
| PWA mobile | `financeflow-web-mobile/` | subprojeto independente (Next 14.2.35, Recharts 3) |

## Regras críticas

1. **Nunca modificar `financeflow-web-mobile/`** sem instrução explícita. É um subprojeto separado, com dependências e CI próprios.
2. **Libs financeiras compartilhadas com o mobile**: `financeflow-web-mobile/lib/finance/` contém cópias fiéis de `lib/business-days.ts`, `lib/month-pace.ts`, `lib/balance-history.ts`, `lib/goals-math.ts`, `lib/redemption-tax.ts`, `lib/cdi-reference.ts` e `lib/daily-income.ts` (com os mesmos testes em `financeflow-web-mobile/tests/`). Ao mudar uma dessas libs no desktop, abrir em seguida um PR só do mobile replicando a mudança.
3. **Nunca misturar desktop e mobile no mesmo commit/PR** — o Boundary Guard (`npm run guard:boundary`) reprova no CI.
4. **Buildar ao final de cada alteração** com `node macos-app/build-standalone.js` (não apenas `npm run build` — este não copia `.next/static/` para o standalone, e o Electron quebra).
5. **Não quebrar o que funciona**: dashboard, gráficos, tabelas e análises precisam continuar operando. Na dúvida, perguntar.
6. **Tailwind sem classes dinâmicas** — jamais construir nomes de classe por interpolação (`grid-cols-${n}`). Usar strings literais ou adicionar ao `safelist` em `tailwind.config.ts`.
7. `main` exige PR + status checks; o merge é feito pelo dono do repositório via UI do GitHub.
8. **Fluxo de entrega de toda alteração desktop**: branch → commit → `npm run lint` + `npm run guard:boundary` + `node macos-app/build-standalone.js` → push + PR → merge (dono) → **compilar o app macOS** (`cd macos-app && npx electron-builder --mac`). Após o merge, voltar para `main` (`git pull --ff-only`) e apagar a branch local. O dono usa sempre o `.app` empacotado.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento (porta 3000) |
| `npm run build` | build de produção (standalone) |
| `npm run build:desktop` | build + cópia de static/public para o Electron |
| `npm run desktop` | build + abre o app Electron |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm test` | testes dos cálculos financeiros (Vitest, `tests/`) |
| `npm run guard:boundary` | verifica isolamento desktop/mobile |
| `npm run smoke:api` | smoke test das rotas de API (servidor rodando) |
| `npm run smoke:macos` | smoke test do build macOS |
| `npm run release:check` | checklist de release (web + macOS) |

Verificação: `npm test` (Vitest) + `npm run lint` + build + smoke tests. Os testes cobrem as libs de cálculo (`business-days`, `redemption-tax`, `balance-history`, `goals-math`, `month-pace`, `daily-income`, `quick-entry`, `compare-offers`, importação) com **dados fictícios**; o CI roda `npm test` em todo PR do desktop (`.github/workflows/desktop-tests.yml`). Lógica de cálculo nova vai para `lib/` (função pura) com teste, não para dentro da rota.

O `.app` empacotado em `macos-app/dist/mac-arm64/` é um artefato **separado**: só incorpora código novo após `cd macos-app && npx electron-builder --mac`. Para o dia a dia, `npm run desktop` é mais rápido.

## Arquitetura

### Fluxo de dados

Server components buscam as próprias rotas `/api/*` via `fetch` com `cache: "no-store"`, e cada página/rota declara `dynamic = "force-dynamic"` e `revalidate = 0` — **toda rota nova de `app/api/` precisa dessas duas linhas**. A URL base vem dos headers da requisição, com fallback para `NEXT_PUBLIC_BASE_URL` (ver `app/page.tsx`).

O Next 14 guarda respostas de `fetch` no Data Cache por padrão; sem `force-dynamic`, as consultas do Supabase ficavam congeladas (bug já corrigido). Por segurança, o cliente em `lib/supabase.ts` força `cache: "no-store"` em todo `fetch` que faz.

O Supabase só é acessado no servidor: `lib/supabase.ts` é `server-only` e usa a service-role key. As tabelas têm RLS habilitado e acesso revogado de `anon`/`authenticated` (`supabase/migrations/20260318113000_security_hardening_rls.sql`) — **nunca** consultar o Supabase direto de um client component; criar uma rota de API.

Mutations chamam `revalidatePath()` nas rotas afetadas e o cliente publica um evento de sincronização (`lib/client-data-sync.ts` + `components/layout/DataRefreshBridge.tsx`), que atualiza outras abas via `localStorage`.

### Diretórios

- `app/` — páginas (`/`, `/insights`, `/history-performance`, `/health`, `/performance`, `/goals`, `/investments`, `/returns`) e rotas de API.
- `components/` — organizados por feature (`dashboard/`, `returns/`, `goals/`, `insights/`, `forms/`, `layout/`, `ui/`).
- `lib/` — lógica compartilhada:
  - `supabase.ts` (server-only), `calculations.ts` (KPIs, MoM/YoY, CAGR), `formatters.ts` (BRL e meses em pt-BR);
  - `monthly-closures.ts`, `monthly-return-revisions.ts`;
  - `business-days.ts` — **única** fonte de dias úteis (feriados nacionais + Páscoa, dia útil anterior, contagem entre datas); usável em client e server;
  - `month-pace.ts` — ritmo do mês e projeção de fechamento por investimento (server; usa o Supabase);
  - `cdi-reference.ts` — CDI do BCB com cache e fallback (server);
  - `daily-insights-agent.ts` — motor do agente diário (Nível 4);
  - `investment-payload.ts` — validação do cadastro de investimentos.
- `supabase/` — `schema.sql` (setup manual), `seed.sql` e `migrations/`.
- `types/index.ts` — **fonte única de verdade** dos tipos de domínio e dos payloads de API. Ao mudar o formato de uma rota, atualizar aqui primeiro.

### Regras de negócio

- **Fechamento mensal** — `isMonthClosed()` bloqueia escritas em períodos fechados com HTTP 409. Toda rota que grava dados de um mês precisa checar isso.
- **Trilha de auditoria** — alterações em retornos mensais gravam em `monthly_return_revisions` (valor anterior, novo, delta, CREATE/UPDATE) via `logMonthlyReturnRevision()`.
- **Data-base D−1** — o valor de renda lançado no dia D é o acumulado até o **dia útil anterior**. Todo cálculo de "dias úteis corridos" usa a data-base (via `previousBusinessDay()`), nunca a data de hoje. Nunca contar dias úteis fora de `lib/business-days.ts`.
- **Ritmo do mês** (`lib/month-pace.ts`) — projeção de fechamento = realizado + ganho diário recente (das revisões, janela de 5 dias úteis) × dias úteis restantes, por investimento. Comparações com outros meses são por dia útil e só contra meses fechados. O mês em andamento **nunca** é comparado como se estivesse fechado. É a base de Insights (Níveis 3–5) e das projeções do Dashboard.
- **`amount_invested` é o saldo atual** (principal + renda reinvestida). Eventos de caixa `APORTE`/`RESGATE` o atualizam. O saldo de um mês passado = saldo atual − aportes/resgates − renda lançada a partir daquele mês.
- **Previsão** (`app/api/investments/forecast/route.ts`) — juros compostos por dia útil (base 252) sobre o saldo de abertura de cada mês, com o % do CDI de cada investimento (`cdi_rate`; sem cadastro, o % efetivo dos últimos 3 meses fechados). Aportes rendem a partir de `event_date`. Meses fechados usam o CDI realizado (BCB 4391); o atual e os futuros, o CDI de referência ou o cenário da tela.
- **Performance** (`app/api/performance/route.ts`) — renda fixa (CDBs): saldo de cada mês reconstruído a partir do saldo atual; rentabilidade mensal = renda ÷ (saldo de abertura + ½ fluxo do mês), encadeada no ano só com meses fechados, contra CDI (BCB 4391) e IPCA (BCB 433, valores com **ponto decimal**). IR estimado a 15% sobre a renda acumulada; FGC de R$ 250 mil por instituição. O mês de estreia de cada investimento fica fora da rentabilidade.
- **Histórico de Performance** (`app/api/performance/history/route.ts`) — renda lançada mês a mês por investimento desde o primeiro lançamento, com a projeção do mês em andamento (`lib/month-pace.ts`); o cliente agrega pelo filtro (últimos 12 meses fechados, renda por ano com projeção, média móvel de 12 meses, composição por ano, comparação entre anos sem o mês em andamento nos totais) e sinaliza lacunas (meses sem renda entre a primeira e a última renda de um investimento).
- **Metas** (`app/api/goals/overview/route.ts`) — meta mensal de renda: status pela projeção do mês (atingida, no ritmo, perto ≥ 95%, abaixo) e necessário por dia útil; meta anual de patrimônio: aporte necessário/mês até dezembro = (falta − rendimento esperado) ÷ meses restantes (incluindo o atual), prazo no ritmo dos aportes dos últimos 3 meses fechados + renda do mês. Saldos mês a mês via `lib/balance-history.ts` (compartilhado com Performance).
- **IR no resgate** (`lib/redemption-tax.ts`) — tabela regressiva (≤180 dias 22,5%; ≤360 20%; ≤720 17,5%; acima 15%) por lote (aplicação inicial em `start_date`, ou estimada pelo primeiro mês com renda, + cada aporte; resgates consomem lotes FIFO), IOF regressivo abaixo de 30 dias; rendimento distribuído entre lotes por valor × dias. Usado em Performance e em Liquidez e Vencimentos (`app/api/liquidity`). Nunca usar alíquota fixa.
- **Liquidez** — `investments.liquidity` usa as opções do formulário ("Diária", "D+1", "D+30", "D+90", "No vencimento"), interpretadas por `parseLiquidity()`; "No vencimento" usa `maturity_date` para o prazo.
- **Importação** (`/import`, `app/api/import/{preview,commit}`) — rendimentos em CSV (`investimento;ano;mes;rendimento`) e aportes/resgates em CSV (`data;investimento;tipo;valor`) ou OFX da conta (saída com termo de aplicação = aporte; entrada de resgate/vencimento = resgate). Parsers em `lib/import-parsers.ts`, validação em `lib/import-validation.ts` (puras, testadas), acesso a dados em `lib/import-service.ts`. O commit **revalida o arquivo no servidor** e grava só linhas selecionadas ainda importáveis; respeita mês fechado; rendimentos gravam revisão. Aportes importados **não alteram o saldo** por padrão (histórico já está no `amount_invested`).
- **Onde Aportar** (`/compare`, `lib/compare-offers.ts`) — simula ofertas (CDB pós/pré/IPCA+, LCI/LCA, Tesouro Selic/Pré/IPCA+, poupança) por valor e prazo: IR regressivo, IOF, isenção, custódia do Tesouro (0,20% a.a.; Selic isento até R$ 10 mil) e "% do CDI equivalente" de um CDB tributado. Referências de mercado em `/api/market/reference` (BCB: CDI, meta Selic 432, IPCA 12m 13522). Ofertas do usuário ficam no localStorage; os investimentos da carteira entram com a taxa do cadastro.
- **Retornos Mensais** (`/returns`) — lançamento rápido do mês da data-base (D−1) com todos os investimentos ativos: valor atual, data-base do último lançamento, diferença e ritmo implícito por dia útil com alertas (`lib/quick-entry.ts`); grava um `POST /api/returns` por investimento (fechamento e auditoria preservados). A previsão de fechamento usa `lib/month-pace.ts` via `/api/returns/pace` — **nunca** outro cálculo de projeção. Valores digitados passam por `parseBrNumber()` (`lib/import-parsers.ts`).
- **Ganho por dia útil** (Dashboard, `app/api/dashboard/daily-income`, `lib/daily-income.ts`) — renda de cada CDB no mês ÷ dias úteis em que rendeu (estreia a partir de `start_date`; sem ela, mês marcado como parcial e fora das variações; mês em andamento até a data-base do último lançamento do investimento) e o mesmo valor por R$ 10 mil sobre o capital que rendeu (saldo de abertura + ½ fluxo, via `lib/balance-history.ts`). FIIs ficam de fora.
- **Taxas contratadas** — ficam em `investments.cdi_rate` (% do CDI); têm prioridade sobre o % efetivo estimado pelo histórico.
- **Meta anual de renda (Dashboard/Insights)** — é a **soma das metas mensais** do ano (`investment_goals_monthly`), comparada com a projeção dos mesmos meses; `FINANCEFLOW_ANNUAL_INCOME_TARGET` só vale sem metas cadastradas. A tabela `investment_goals` (metas fixas) é legado.
- **Investimentos sem posição** — investimento com valor aplicado 0 e sem renda no mês (ex.: FIIs encerrados) fica fora do motor de insights e das telas (cards, stress test, reinvestimento); o histórico de renda continua valendo nos totais passados.
- **Motor de insights** — `INSIGHTS_ENGINE_VERSION` (`lib/month-pace.ts`) é gravado em `insight_daily_runs` e `insight_professional_runs`, e o histórico exibido é filtrado pela versão. **Ao mudar qualquer cálculo dos insights, incrementar a versão.**
- **Dados de mercado** — `lib/cdi-reference.ts` (SGS 12 = CDI diário, 4391 = CDI mensal) e as rotas de insights (13522 = IPCA 12m, Yahoo para IBOV/IFIX) usam cache em memória com TTLs distintos para sucesso e fallback. Sempre prever fallback quando a API externa falhar.

### Apresentação de números

- **Real em destaque, projeção como apoio**: nos cards, o percentual, a seta, a cor e o Δ refletem a variação **realizada** mês contra mês; a projeção do mês em andamento aparece como linha secundária rotulada "Projeção" (campos `projected*` em `DashboardKPIs`/`CdbKpiEntry` e `projected_total` na série).
- **Benchmark** — rendimento sobre o capital vs CDI acumulado nos dias úteis do mês, e % do CDI realizado vs contratado; IFIX/Ibov são só contexto (variação de preço não é comparável com renda fixa).

## Convenções de código

- **Nunca colocar dados reais** (saldos, rendas, rentabilidades, taxas, metas, nomes de investimentos/instituições da carteira, datas de lançamentos) em descrições e comentários de PR, mensagens de commit ou arquivos versionados — **o repositório é público**. Descrever verificações de forma genérica ou com valores fictícios.

- **Imports relativos** (`../../lib/supabase`) em todo o código; o alias `@/*` existe no `tsconfig.json` mas não é usado — seguir o padrão vigente.
- Server components por padrão; `"use client"` só quando há estado, efeitos ou Recharts.
- Valores monetários via `formatCurrencyBRL()` e percentuais via `formatPercentage()`; nunca formatar à mão.
- Textos visíveis sempre em português. Comentários acompanham o arquivo (a maioria em português).
- Rotas de API validam as entradas e retornam `{ error: "mensagem em pt-BR" }` com o status adequado (400 inválido, 404 não encontrado, 409 período fechado, 500 erro). **Nunca** gravar o corpo cru (`insert(body)`, `update(body)`, `upsert(body)`): montar o objeto só com as colunas permitidas.
- Paleta de cores no `tailwind.config.ts`: `background`, `surface`, `accent`, `success`, `danger`. Tema escuro.

## Dívidas técnicas conhecidas

- **Componentes muito grandes**: `InsightsPageClient.tsx` (~1850 linhas), `ReturnsPageClient.tsx` (~1720), `GoalsPageClient.tsx` (~1260), `app/api/insights/professional/route.ts` (~1170), `app/api/dashboard/route.ts` (~960).
- **Datas de início ausentes**: investimentos abertos no meio de um mês sem `start_date` (nem aporte inicial lançado) distorcem a previsão e a performance do mês de abertura até que a data seja preenchida no cadastro.
- **Histórico antigo dos insights**: as linhas de `insight_daily_runs`/`insight_professional_runs` de versões anteriores do motor seguem no banco (ocultas pelo filtro de versão). Remoção manual, se desejado: `delete from <tabela> where report->>'engineVersion' is distinct from '<versão atual>';`.

### Resolvidas

- Rotas sem `force-dynamic` servindo dados congelados do Data Cache (PR #48).
- Motor de insights comparando mês parcial com meses cheios, "melhor fonte" sempre FIIs, grupos fixos por instituição (PR #49).
- KPIs do Dashboard e selo de dias úteis sem feriados (PRs #50–#52).
- Mass assignment em `app/api/returns` (PR #53).
- Drift de schema e falta de RLS em `supabase/schema.sql` (PR #54).
- Dias úteis duplicados sem feriados — todos migrados para `lib/business-days.ts` (PRs #49–#55).
- Previsão com CDI fixo de 10,65%, 100% do CDI para todos e renda contada duas vezes; painel de Retornos com filtro "todos" (PRs #56–#57).
- Cadastro de investimentos descartava `cdi_rate`, `benchmark`, `start_date`, `liquidity` e `maturity_date` (PR #57).

## Ambiente

`.env.local` na raiz:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Opcionais: `FINANCEFLOW_CDI_ANNUAL_RATE` (fallback do CDI quando o BCB falha; padrão 10,65), `FINANCEFLOW_ANNUAL_INCOME_TARGET` (meta anual quando não há metas mensais; padrão 12.000), `FINANCEFLOW_DAILY_PLANNED_APORTE` (aporte simulado nas recomendações; padrão 1.000).

Supabase local (requer Docker): `supabase start` na raiz — API em 54321, Studio em 54323, DB em 54322. As migrations de `supabase/migrations/` são aplicadas automaticamente.

Para setup inicial do zero: `npm run setup` e, no SQL Editor do Supabase, rodar `supabase/schema.sql` e depois `supabase/seed.sql`. O `schema.sql` é idempotente, inclui as colunas financeiras de `investments` e aplica RLS + revoke de `anon`/`authenticated` em todas as tabelas; ao criar uma migration nova, refletir a mudança nele também.
