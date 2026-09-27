"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PerformancePayload } from "../../types";
import { formatCurrencyBRL, formatPercentage, monthLabel } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  initialYear: number;
}

const TOOLTIP_STYLE = { backgroundColor: "#020617", borderColor: "#1f2937" };

function percentTwoDecimals(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function signedCurrency(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCurrencyBRL(Math.abs(value))}`;
}

function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-slate-300";
  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}

function cdiTone(percentOfCdi: number | null | undefined): string {
  if (percentOfCdi === null || percentOfCdi === undefined) return "text-slate-400";
  if (percentOfCdi >= 98) return "text-emerald-300";
  if (percentOfCdi >= 90) return "text-amber-300";
  return "text-rose-300";
}

function fgcBarClass(status: "ok" | "atencao" | "acima"): string {
  if (status === "acima") return "bg-rose-500";
  if (status === "atencao") return "bg-amber-400";
  return "bg-emerald-500";
}

function fgcLabel(status: "ok" | "atencao" | "acima"): string {
  if (status === "acima") return "Acima do limite";
  if (status === "atencao") return "Perto do limite";
  return "Dentro do limite";
}

export function PerformancePageClient({ initialYear }: Props) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/performance?year=${year}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erro ao carregar dados de performance.");
      }
      setData((await res.json()) as PerformancePayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = data?.kpis;
  const periodLabel =
    kpis?.closedThroughMonth ? `jan–${monthLabel(kpis.closedThroughMonth).toLowerCase()}` : "sem meses fechados";

  const monthlyChart = (data?.monthlySeries ?? [])
    .filter((point) => point.status !== "future")
    .map((point) => ({
      name: `${monthLabel(point.month)}${point.status === "in_progress" ? "*" : ""}`,
      carteira: point.returnPercent,
      cdi: point.cdiPercent,
      ipca: point.ipcaPercent,
    }));

  const accumulatedChart = (data?.monthlySeries ?? [])
    .filter((point) => point.status === "closed")
    .map((point) => ({
      name: monthLabel(point.month),
      carteira: point.accumulatedReturnPercent,
      cdi: point.accumulatedCdiPercent,
      ipca: point.accumulatedIpcaPercent,
    }));

  const growthSteps = kpis
    ? [
        { label: "Saldo em 01/01", value: kpis.openingBalance, className: "bg-slate-500" },
        { label: "Aportes líquidos", value: kpis.netContributions, className: "bg-cyan-500" },
        ...(kpis.unrecordedApplications > 1
          ? [{ label: "Aplicações iniciais (sem aporte lançado)", value: kpis.unrecordedApplications, className: "bg-violet-500" }]
          : []),
        { label: "Rendimento bruto", value: kpis.grossIncome, className: "bg-emerald-500" },
      ]
    : [];
  const growthMax = Math.max(1, kpis?.currentBalance ?? 1, ...growthSteps.map((step) => Math.abs(step.value)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Performance Financeira</h2>
          <p className="text-sm text-slate-400">
            Quanto o patrimônio cresceu, de onde veio o crescimento e quanto a renda fixa rendeu frente ao CDI e à
            inflação.
          </p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-400">Carregando performance...</p> : null}

      {data?.warnings?.length ? (
        <Card>
          <ul className="space-y-1 text-xs text-amber-300">
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <p className="text-xs text-slate-400">Patrimônio em renda fixa</p>
            <p className="text-2xl font-bold text-slate-50">{formatCurrencyBRL(kpis.currentBalance)}</p>
            <p className="mt-1 text-xs text-slate-400">
              Em 01/01: {formatCurrencyBRL(kpis.openingBalance)}{" "}
              <span className={toneClass(kpis.currentBalance - kpis.openingBalance)}>
                ({signedCurrency(kpis.currentBalance - kpis.openingBalance)})
              </span>
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Rendimento bruto no ano</p>
            <p className="text-2xl font-bold text-emerald-300">{formatCurrencyBRL(kpis.grossIncome)}</p>
            <p className="mt-1 text-xs text-slate-400">
              Líquido estimado: {formatCurrencyBRL(kpis.netIncomeAfterTax)} (IR efetivo {kpis.estimatedTaxRatePercent.toFixed(1)}%)
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Aportes líquidos no ano</p>
            <p className="text-2xl font-bold text-cyan-300">{formatCurrencyBRL(kpis.netContributions)}</p>
            {kpis.unrecordedApplications > 1 ? (
              <p className="mt-1 text-xs text-slate-400">
                + {formatCurrencyBRL(kpis.unrecordedApplications)} em aplicações iniciais sem aporte lançado
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">Aportes − resgates lançados em Retornos Mensais</p>
            )}
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Rentabilidade no ano ({periodLabel})</p>
            <p className="text-2xl font-bold text-slate-50">{percentTwoDecimals(kpis.returnPercent)}</p>
            <p className="mt-1 text-xs text-slate-400">
              CDI no período: {percentTwoDecimals(kpis.cdiPercent)} ·{" "}
              <span className={`font-semibold ${cdiTone(kpis.percentOfCdi)}`}>
                {kpis.percentOfCdi === null ? "—" : `${kpis.percentOfCdi.toFixed(0)}% do CDI`}
              </span>
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Ganho real (acima da inflação)</p>
            <p className={`text-2xl font-bold ${toneClass(kpis.realReturnPercent)}`}>
              {percentTwoDecimals(kpis.realReturnPercent)}
            </p>
            <p className="mt-1 text-xs text-slate-400">IPCA no período: {percentTwoDecimals(kpis.ipcaPercent)}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">IR estimado se resgatar hoje</p>
            <p className="text-2xl font-bold text-rose-300">{formatCurrencyBRL(kpis.estimatedTaxOnRedemption)}</p>
            <p className="mt-1 text-xs text-slate-400">
              Patrimônio líquido de IR: {formatCurrencyBRL(kpis.balanceAfterTax)}
            </p>
            <p className="text-[11px] text-slate-500">
              Tabela regressiva de IR (22,5% a 15%) por aplicação + IOF abaixo de 30 dias; alíquota efetiva{" "}
              {kpis.estimatedTaxRatePercent.toFixed(1)}%.
            </p>
          </Card>
        </div>
      ) : null}

      {kpis ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">De onde veio o crescimento</h3>
          <p className="mb-3 text-xs text-slate-400">Composição do patrimônio atual a partir do saldo em 01/01.</p>
          <div className="space-y-2">
            {growthSteps.map((step) => (
              <div key={step.label} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="text-slate-300">{step.label}</span>
                <div className="h-3 rounded-full bg-slate-800">
                  <div
                    className={`h-3 rounded-full ${step.className}`}
                    style={{ width: `${Math.min(100, (Math.abs(step.value) / growthMax) * 100)}%` }}
                  />
                </div>
                <span className="w-32 text-right font-semibold text-slate-100">{formatCurrencyBRL(step.value)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 border-t border-slate-800 pt-2 text-xs">
              <span className="font-semibold text-slate-100">Patrimônio atual</span>
              <div className="h-3 rounded-full bg-slate-800">
                <div
                  className="h-3 rounded-full bg-accent"
                  style={{ width: `${Math.min(100, (kpis.currentBalance / growthMax) * 100)}%` }}
                />
              </div>
              <span className="w-32 text-right font-bold text-slate-50">{formatCurrencyBRL(kpis.currentBalance)}</span>
            </div>
          </div>
        </Card>
      ) : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-200">Rentabilidade mês a mês</h3>
            <p className="mb-2 text-xs text-slate-400">
              Carteira vs CDI (barras) e IPCA (linha), em % no mês. * mês em andamento (parcial).
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(value: number) => `${value.toFixed(1)}%`} />
                  <Tooltip
                    formatter={(value: number) => percentTwoDecimals(value)}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="carteira" name="Carteira" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cdi" name="CDI" fill="#64748b" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="ipca" name="IPCA" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-200">Acumulado no ano</h3>
            <p className="mb-2 text-xs text-slate-400">
              Rentabilidade encadeada mês a mês (só meses fechados): carteira vs CDI vs inflação.
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accumulatedChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(value: number) => `${value.toFixed(0)}%`} />
                  <Tooltip
                    formatter={(value: number) => percentTwoDecimals(value)}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="carteira" name="Carteira" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cdi" name="CDI" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line type="monotone" dataKey="ipca" name="IPCA" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Detalhe mensal</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2">Mês</th>
                  <th className="py-2">Patrimônio (fim)</th>
                  <th className="py-2">Aportes líquidos</th>
                  <th className="py-2">Rendimento bruto</th>
                  <th className="py-2">Carteira</th>
                  <th className="py-2">CDI</th>
                  <th className="py-2">% do CDI</th>
                  <th className="py-2">IPCA</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlySeries
                  .filter((point) => point.status !== "future")
                  .map((point) => (
                    <tr key={point.month} className="border-t border-slate-800 text-slate-200">
                      <td className="py-2">
                        {monthLabel(point.month)}
                        {point.status === "in_progress" ? (
                          <span className="ml-1 text-[10px] text-slate-500">(em andamento)</span>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {point.closingBalance === null ? "—" : formatCurrencyBRL(point.closingBalance)}
                      </td>
                      <td className={`py-2 ${point.netContributions === 0 ? "text-slate-500" : "text-cyan-300"}`}>
                        {point.netContributions === 0 ? "—" : signedCurrency(point.netContributions)}
                      </td>
                      <td className="py-2 text-emerald-300">{formatCurrencyBRL(point.grossIncome)}</td>
                      <td className="py-2 font-semibold">{percentTwoDecimals(point.returnPercent)}</td>
                      <td className="py-2 text-slate-400">{percentTwoDecimals(point.cdiPercent)}</td>
                      <td className={`py-2 font-semibold ${cdiTone(point.percentOfCdi)}`}>
                        {point.percentOfCdi === null ? "—" : formatPercentage(point.percentOfCdi)}
                      </td>
                      <td className="py-2 text-amber-300">{percentTwoDecimals(point.ipcaPercent)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <h3 className="text-sm font-semibold text-slate-200">Por investimento</h3>
            <p className="mb-2 text-xs text-slate-400">
              Rentabilidade no ano considera os meses após a estreia de cada investimento.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2">Investimento</th>
                    <th className="py-2">Saldo</th>
                    <th className="py-2">Peso</th>
                    <th className="py-2">Rendimento no ano</th>
                    <th className="py-2">Rentabilidade</th>
                    <th className="py-2">% do CDI (realizado / contratado)</th>
                    <th className="py-2">IR estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.investments.map((item) => (
                    <tr key={item.investmentId} className="border-t border-slate-800 text-slate-200">
                      <td className="py-2">
                        <p className="font-semibold text-slate-100">{item.label}</p>
                        <p className="text-[11px] text-slate-500">{item.institution}</p>
                      </td>
                      <td className="py-2">{formatCurrencyBRL(item.balance)}</td>
                      <td className="py-2 text-slate-400">{formatPercentage(item.sharePercent)}</td>
                      <td className="py-2 text-emerald-300">{formatCurrencyBRL(item.grossIncome)}</td>
                      <td className="py-2">
                        {percentTwoDecimals(item.returnPercent)}
                        <span className="ml-1 text-[10px] text-slate-500">
                          ({item.returnMonths} {item.returnMonths === 1 ? "mês" : "meses"})
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`font-semibold ${cdiTone(item.percentOfCdi)}`}>
                          {item.percentOfCdi === null ? "—" : `${item.percentOfCdi.toFixed(0)}%`}
                        </span>
                        <span className="text-slate-500">
                          {" "}
                          / {item.contractedCdiPercent === null ? "—" : `${item.contractedCdiPercent.toFixed(0)}%`}
                        </span>
                      </td>
                      <td className="py-2 text-rose-300">{formatCurrencyBRL(item.estimatedTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-200">Concentração e garantia do FGC</h3>
            <p className="mb-3 text-xs text-slate-400">
              O FGC garante até {formatCurrencyBRL(250_000)} por CPF em cada instituição (principal + rendimento).
            </p>
            <div className="space-y-3">
              {data.institutions.map((item) => (
                <div key={item.institution} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{item.institution}</span>
                    <span className="text-slate-300">
                      {formatCurrencyBRL(item.balance)} · {formatPercentage(item.sharePercent)} da carteira
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-800">
                    <div
                      className={`h-2 rounded-full ${fgcBarClass(item.fgcStatus)}`}
                      style={{ width: `${Math.min(100, item.fgcUsagePercent)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.fgcUsagePercent.toFixed(0)}% do limite · {fgcLabel(item.fgcStatus)} · folga de{" "}
                    {formatCurrencyBRL(Math.max(0, item.fgcLimit - item.balance))}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {kpis && kpis.fiiDividends > 0 ? (
        <p className="text-[11px] text-slate-500">
          Dividendos de FIIs no ano (isentos, fora da rentabilidade acima): {formatCurrencyBRL(kpis.fiiDividends)}.
        </p>
      ) : null}
    </div>
  );
}
