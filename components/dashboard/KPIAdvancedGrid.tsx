import { DashboardKPIs } from "../../types";
import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";

interface KPIAdvancedGridProps {
  kpis: DashboardKPIs;
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

export function KPIAdvancedGrid({ kpis }: KPIAdvancedGridProps) {
  const marketTone = toneClass(kpis.capitalGainPct);
  const profitTone = toneClass(kpis.totalProfit);
  const returnTone = toneClass(kpis.totalProfitPct);
  const itauTone = toneClass(kpis.cdbItauMomGrowth);
  const santanderTone = toneClass(kpis.cdbSantanderMomGrowth);

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-6">
      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-2">
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

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-2">
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

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-200">CDB Itaú (M/M)</p>
        <p className={`mt-2 text-2xl font-extrabold ${itauTone}`}>
          {formatPercentage(kpis.cdbItauMomGrowth)} {arrow(kpis.cdbItauMomGrowth)}
        </p>
        <p className="mt-2 text-xs text-slate-400">Mês atual</p>
        <p className="text-base font-semibold text-slate-200">
          {formatCurrencyBRL(kpis.cdbItauCurrentMonth)}
        </p>
        <p className={`mt-1 text-xs font-semibold ${toneClass(kpis.cdbItauMomDelta)}`}>
          Δ M/M: {formatSignedCurrency(kpis.cdbItauMomDelta)}
        </p>
      </article>

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-200">CDB Santander (M/M)</p>
        <p className={`mt-2 text-2xl font-extrabold ${santanderTone}`}>
          {formatPercentage(kpis.cdbSantanderMomGrowth)} {arrow(kpis.cdbSantanderMomGrowth)}
        </p>
        <p className="mt-2 text-xs text-slate-400">Mês atual</p>
        <p className="text-base font-semibold text-slate-200">
          {formatCurrencyBRL(kpis.cdbSantanderCurrentMonth)}
        </p>
        <p className={`mt-1 text-xs font-semibold ${toneClass(kpis.cdbSantanderMomDelta)}`}>
          Δ M/M: {formatSignedCurrency(kpis.cdbSantanderMomDelta)}
        </p>
      </article>

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
        <p className="text-sm font-semibold text-slate-200">Proventos Recebidos (12M)</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-50">
          {formatCurrencyBRL(kpis.rolling12Months)}
        </p>
        <p className="mt-2 text-xs text-slate-400">Total</p>
        <p className="text-lg font-semibold text-slate-200">
          {formatCurrencyBRL(kpis.ytdPassiveIncome)}
        </p>
      </article>

      <article className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-sm xl:col-span-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-200">Variação</p>
            <p className={`mt-2 text-3xl font-extrabold ${marketTone}`}>
              {formatPercentage(kpis.capitalGainPct)} {arrow(kpis.capitalGainPct)}
            </p>
            <p className={`text-lg font-semibold ${toneClass(kpis.capitalGain)}`}>
              {formatCurrencyBRL(kpis.capitalGain)}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">Rentabilidade</p>
            <p className={`mt-2 text-3xl font-extrabold ${returnTone}`}>
              {formatPercentage(kpis.totalProfitPct)} {arrow(kpis.totalProfitPct)}
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
