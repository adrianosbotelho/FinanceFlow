import { ContributionFlowPayload, DashboardKPIs } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";

interface KPIAdvancedGridProps {
  kpis: DashboardKPIs;
  /** Proventos + aportes por mês (sem ele, o card mostra só os proventos). */
  flow?: ContributionFlowPayload;
}

function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "text-slate-100";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-slate-100";
}

function arrow(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "•";
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "•";
}

function formatSignedCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value === 0) return formatCurrencyBRL(0);
  const abs = formatCurrencyBRL(Math.abs(value));
  return `${value > 0 ? "+" : "-"}${abs}`;
}

function deriveMomDelta(
  currentValue: number,
  momPercent: number | null | undefined,
): number | null {
  if (momPercent === null || momPercent === undefined || Number.isNaN(momPercent)) return null;
  if (momPercent <= -100) return null;
  const previousValue = currentValue / (1 + momPercent / 100);
  if (!Number.isFinite(previousValue)) return null;
  return currentValue - previousValue;
}

const CDB_COLORS = ["text-orange-300", "text-rose-300", "text-sky-300", "text-violet-300", "text-amber-300"];

// Proventos recebidos + aportes líquidos: quanto entrou na carteira por mês.
function ContributionFlowCard({ flow }: { flow: ContributionFlowPayload }) {
  const max = Math.max(1, ...flow.months.map((item) => item.income + Math.max(0, item.netContributions)));
  const current = flow.months[flow.months.length - 1];
  const rows = [
    { label: "No ano (YTD)", totals: flow.ytd },
    {
      label: `Média mensal (${flow.averageMonths} meses fechados)`,
      totals: {
        income: flow.monthlyAverage.income,
        netContributions: flow.monthlyAverage.netContributions,
        total: flow.monthlyAverage.total,
      },
    },
  ];
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
      <p className="text-sm font-semibold text-slate-200">Proventos e aportes (12M)</p>
      <p className="text-[11px] text-slate-500">Quanto entrou na carteira: proventos recebidos + aportes líquidos</p>
      <p className="mt-2 text-3xl font-extrabold text-slate-50">{formatCurrencyBRL(flow.last12.total)}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
            Proventos
          </p>
          <p className="text-base font-semibold text-emerald-300">{formatCurrencyBRL(flow.last12.income)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-slate-400">
            <span className="inline-block h-2 w-2 rounded-sm bg-indigo-400" />
            Aportes líquidos
          </p>
          <p className="text-base font-semibold text-indigo-300">{formatCurrencyBRL(flow.last12.netContributions)}</p>
          {flow.last12.withdrawals > 0 ? (
            <p className="text-[10px] text-slate-500">
              aportes {formatCurrencyBRL(flow.last12.contributions)} − resgates {formatCurrencyBRL(flow.last12.withdrawals)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex h-28 items-end gap-1">
        {flow.months.map((item) => {
          const incomeHeight = (item.income / max) * 100;
          const contributionHeight = (Math.max(0, item.netContributions) / max) * 100;
          return (
            <div
              key={`${item.year}-${item.month}`}
              className={`flex h-full flex-1 flex-col justify-end ${item.inProgress ? "opacity-60" : ""}`}
              title={`${monthLabel(item.month)}/${item.year}${item.inProgress ? " (parcial)" : ""}: proventos ${formatCurrencyBRL(
                item.income,
              )} + aportes líquidos ${formatCurrencyBRL(item.netContributions)} = ${formatCurrencyBRL(item.total)}`}
            >
              <div className="rounded-t-sm bg-indigo-400" style={{ height: `${contributionHeight}%` }} />
              <div className="bg-emerald-400" style={{ height: `${incomeHeight}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {flow.months.map((item) => (
          <span key={`${item.year}-${item.month}`} className="flex-1 text-center text-[9px] text-slate-500">
            {monthLabel(item.month).slice(0, 3)}
            {item.inProgress ? "*" : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-slate-400">{row.label}</span>
            <span className="text-slate-300">
              <span className="text-emerald-300">{formatCurrencyBRL(row.totals.income)}</span>
              {" + "}
              <span className="text-indigo-300">{formatCurrencyBRL(row.totals.netContributions)}</span>
              {" = "}
              <span className="font-semibold text-slate-100">{formatCurrencyBRL(row.totals.total)}</span>
            </span>
          </div>
        ))}
        {current ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-slate-400">
              {monthLabel(current.month)}/{current.year}
              {current.inProgress ? " (parcial)" : ""}
            </span>
            <span className="text-slate-300">
              <span className="text-emerald-300">{formatCurrencyBRL(current.income)}</span>
              {" + "}
              <span className="text-indigo-300">{formatCurrencyBRL(current.netContributions)}</span>
              {" = "}
              <span className="font-semibold text-slate-100">{formatCurrencyBRL(current.total)}</span>
            </span>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Barras: proventos (verde) e aportes líquidos (azul) de cada mês; passe o mouse para ver os valores.
        {current?.inProgress ? " * mês em andamento." : ""}
      </p>
    </article>
  );
}

export function KPIAdvancedGrid({ kpis, flow }: KPIAdvancedGridProps) {
  const marketTone = toneClass(kpis.capitalGainPct);
  const profitTone = toneClass(kpis.totalProfit);
  const incomeVariationTone = toneClass(kpis.momGrowth);
  const returnTone = toneClass(kpis.portfolioYield);
  const isProjection = kpis.comparisonBasis === "projection";
  const monthlyIncomeDelta =
    kpis.momDeltaValue !== undefined
      ? kpis.momDeltaValue
      : deriveMomDelta(kpis.totalPassiveIncomeCurrentMonth, kpis.momGrowth);
  const rolling12MonthlyAverage = kpis.rolling12Months / 12;

  const cdbCount = kpis.cdbItems.length;
  // Tailwind requires literal class strings for purge detection
  const cdbGridClass =
    cdbCount <= 2 ? "grid-cols-1 sm:grid-cols-2" :
    cdbCount === 3 ? "grid-cols-1 sm:grid-cols-3" :
    "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-6">
      {/* Row 1: Patrimônio + Lucro */}
      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
        <p className="text-sm font-semibold text-slate-200">Patrimônio total</p>
        <div className="mt-2 flex items-center gap-2">
          <p className="text-3xl font-extrabold text-slate-50">
            {formatCurrencyBRL(kpis.currentMarketValue)}
          </p>
          <span
            className={`inline-flex items-center rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold ${marketTone}`}
          >
            {formatPercentage(kpis.capitalGainPct)} {arrow(kpis.capitalGainPct)}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">Valor investido</p>
        <p className="text-lg font-semibold text-slate-200">
          {formatCurrencyBRL(kpis.investedCapital)}
        </p>
      </article>

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
        <p className="text-sm font-semibold text-slate-200">Lucro total</p>
        <p className={`mt-2 text-3xl font-extrabold ${profitTone}`}>
          {formatCurrencyBRL(kpis.totalProfit)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400">Ganho de Capital</p>
            <p className={`text-base font-semibold ${toneClass(kpis.capitalGain)}`}>
              {formatCurrencyBRL(kpis.capitalGain)}
            </p>
          </div>
          <div>
            <p className="text-slate-400">Dividendos Recebidos</p>
            <p className="text-base font-semibold text-slate-200">
              {formatCurrencyBRL(kpis.rolling12Months)}
            </p>
          </div>
        </div>
      </article>

      {/* Row 2: CDB cards (linha própria, distribuídos igualmente) */}
      <div className={`col-span-1 grid gap-4 lg:col-span-2 xl:col-span-6 ${cdbGridClass}`}>
        {kpis.cdbItems.map((cdb, idx) => {
          const colorClass = CDB_COLORS[idx % CDB_COLORS.length];
          const tone = toneClass(cdb.momGrowth);
          return (
            <article key={cdb.investment_id} className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-200">{cdb.label} (M/M)</p>
              <p className={`mt-2 text-2xl font-extrabold ${tone}`}>
                {formatPercentage(cdb.momGrowth)} {arrow(cdb.momGrowth)}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {isProjection ? "Mês atual (realizado)" : "Mês atual"}
              </p>
              <p className={`text-base font-semibold ${colorClass}`}>
                {formatCurrencyBRL(cdb.currentMonth)}
              </p>
              <p className={`mt-1 text-xs font-semibold ${toneClass(cdb.momDelta)}`}>
                Δ M/M: {formatSignedCurrency(cdb.momDelta)}
              </p>
              {isProjection && cdb.projectedMonth !== undefined ? (
                <p className="mt-1 text-xs text-slate-400">
                  Projeção: <span className="font-semibold text-slate-200">{formatCurrencyBRL(cdb.projectedMonth)}</span>
                  {cdb.projectedMomGrowth !== null && cdb.projectedMomGrowth !== undefined ? (
                    <span className={`ml-1 font-semibold ${toneClass(cdb.projectedMomGrowth)}`}>
                      ({cdb.projectedMomGrowth > 0 ? "+" : ""}
                      {formatPercentage(cdb.projectedMomGrowth)} vs mês anterior)
                    </span>
                  ) : null}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {/* Row 3: Proventos (+ aportes) + Variação/Rentabilidade */}
      {flow ? (
        <ContributionFlowCard flow={flow} />
      ) : (
      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
        <p className="text-sm font-semibold text-slate-200">Proventos Recebidos (12M)</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-50">
          {formatCurrencyBRL(kpis.rolling12Months)}
        </p>
        <p className="mt-2 text-xs text-slate-400">No ano (YTD)</p>
        <p className="text-lg font-semibold text-slate-200">
          {formatCurrencyBRL(kpis.ytdPassiveIncome)}
        </p>
        <p className="mt-1 text-xs text-slate-400">Média mensal (12M)</p>
        <p className="text-sm font-semibold text-slate-300">
          {formatCurrencyBRL(rolling12MonthlyAverage)}
        </p>
      </article>
      )}

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Variação da renda (M/M)
            </p>
            <p className={`mt-2 text-3xl font-extrabold ${incomeVariationTone}`}>
              {formatPercentage(kpis.momGrowth)} {arrow(kpis.momGrowth)}
            </p>
            <p className={`text-lg font-semibold ${toneClass(monthlyIncomeDelta)}`}>
              Δ R$: {formatSignedCurrency(monthlyIncomeDelta)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Comparação com mês anterior</p>
            {isProjection && kpis.projectedCurrentMonth !== undefined ? (
              <p className="mt-1 text-xs text-slate-400">
                Projeção: <span className="font-semibold text-slate-200">{formatCurrencyBRL(kpis.projectedCurrentMonth)}</span>
                {kpis.projectedMomGrowth !== null && kpis.projectedMomGrowth !== undefined ? (
                  <span className={`ml-1 font-semibold ${toneClass(kpis.projectedMomGrowth)}`}>
                    ({kpis.projectedMomGrowth > 0 ? "+" : ""}
                    {formatPercentage(kpis.projectedMomGrowth)}; {formatSignedCurrency(kpis.projectedMomDelta)})
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">Rentabilidade (12M)</p>
            <p className={`mt-2 text-3xl font-extrabold ${returnTone}`}>
              {formatPercentage(kpis.portfolioYield)} {arrow(kpis.portfolioYield)}
            </p>
            <p className="text-lg font-semibold text-slate-200">
              Base: {formatCurrencyBRL(kpis.investedCapital)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Proventos 12M / capital investido</p>
          </div>
        </div>
      </article>
    </section>
  );
}
