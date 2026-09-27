"use client";

import { useEffect, useState } from "react";
import { PerformancePayload } from "@/types";
import { formatCurrency, monthLabel } from "@/lib/format";

// Mesma leitura da página Performance do desktop: patrimônio, de onde veio o crescimento,
// rentabilidade vs CDI e IPCA, IR estimado e limite do FGC.

function pct2(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function pct0(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(0)}%`;
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

export function PerformanceClient({ initialYear, envReady }: { initialYear: number; envReady: boolean }) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!envReady) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/performance?year=${year}`, { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Erro ao carregar performance.");
        setData(payload as PerformancePayload);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar performance.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [year, envReady]);

  if (!envReady) {
    return (
      <div className="card">
        <h1 className="text-lg font-bold">Performance</h1>
        <p className="mt-2 text-sm text-slate-400">Configure as variáveis do Supabase.</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
  const period = kpis?.closedThroughMonth ? `jan–${monthLabel(kpis.closedThroughMonth).toLowerCase()}` : "—";
  const growth = kpis
    ? [
        { label: "Saldo em 01/01", value: kpis.openingBalance, className: "bg-slate-500" },
        { label: "Aportes líquidos", value: kpis.netContributions, className: "bg-cyan-500" },
        ...(kpis.unrecordedApplications > 1
          ? [{ label: "Aplicações iniciais", value: kpis.unrecordedApplications, className: "bg-violet-500" }]
          : []),
        { label: "Rendimento bruto", value: kpis.grossIncome, className: "bg-emerald-500" },
      ]
    : [];
  const growthMax = Math.max(1, kpis?.currentBalance ?? 1);

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Performance</h1>
          <p className="text-sm text-slate-400">Renda fixa: crescimento, rentabilidade vs CDI e IPCA, IR e FGC</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </header>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-400">Carregando...</p> : null}

      {data?.warnings.length ? (
        <section className="card">
          <ul className="space-y-1 text-xs text-amber-300">
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {kpis ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <article className="card">
            <p className="card-title">Patrimônio</p>
            <p className="card-value">{formatCurrency(kpis.currentBalance)}</p>
            <p className="text-xs text-slate-500">01/01: {formatCurrency(kpis.openingBalance)}</p>
          </article>
          <article className="card">
            <p className="card-title">Rendimento no ano</p>
            <p className="card-value text-emerald-300">{formatCurrency(kpis.grossIncome)}</p>
            <p className="text-xs text-slate-500">Líquido est.: {formatCurrency(kpis.netIncomeAfterTax)}</p>
          </article>
          <article className="card">
            <p className="card-title">Rentabilidade ({period})</p>
            <p className="card-value">{pct2(kpis.returnPercent)}</p>
            <p className="text-xs text-slate-500">
              CDI {pct2(kpis.cdiPercent)} ·{" "}
              <span className={`font-semibold ${cdiTone(kpis.percentOfCdi)}`}>{pct0(kpis.percentOfCdi)} do CDI</span>
            </p>
          </article>
          <article className="card">
            <p className="card-title">Ganho real</p>
            <p className={`card-value ${(kpis.realReturnPercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {pct2(kpis.realReturnPercent)}
            </p>
            <p className="text-xs text-slate-500">IPCA {pct2(kpis.ipcaPercent)}</p>
          </article>
          <article className="card">
            <p className="card-title">Aportes no ano</p>
            <p className="card-value text-cyan-300">{formatCurrency(kpis.netContributions)}</p>
          </article>
          <article className="card">
            <p className="card-title">IR se resgatar hoje</p>
            <p className="card-value text-rose-300">{formatCurrency(kpis.estimatedTaxOnRedemption)}</p>
            <p className="text-xs text-slate-500">
              Alíquota efetiva {kpis.estimatedTaxRatePercent.toFixed(1)}% · líquido {formatCurrency(kpis.balanceAfterTax)}
            </p>
          </article>
        </section>
      ) : null}

      {kpis ? (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">De onde veio o crescimento</h2>
          <div className="space-y-2 text-xs">
            {growth.map((step) => (
              <div key={step.label}>
                <div className="flex justify-between text-slate-300">
                  <span>{step.label}</span>
                  <span className="font-semibold text-slate-100">{formatCurrency(step.value)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-800">
                  <div
                    className={`h-2 rounded-full ${step.className}`}
                    style={{ width: `${Math.min(100, (Math.abs(step.value) / growthMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-700 pt-2 font-semibold text-slate-100">
              <span>Patrimônio atual</span>
              <span>{formatCurrency(kpis.currentBalance)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold">Mês a mês</h2>
          <table className="min-w-[520px] text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-2 py-2">Mês</th>
                <th className="px-2 py-2">Rendimento</th>
                <th className="px-2 py-2">Carteira</th>
                <th className="px-2 py-2">CDI</th>
                <th className="px-2 py-2">% CDI</th>
                <th className="px-2 py-2">IPCA</th>
              </tr>
            </thead>
            <tbody>
              {data.monthlySeries
                .filter((point) => point.status !== "future")
                .map((point) => (
                  <tr key={point.month} className="border-b border-slate-800">
                    <td className="px-2 py-1.5">
                      {monthLabel(point.month)}
                      {point.status === "in_progress" ? <span className="text-slate-500">*</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-emerald-300">{formatCurrency(point.grossIncome)}</td>
                    <td className="px-2 py-1.5 font-semibold">{pct2(point.returnPercent)}</td>
                    <td className="px-2 py-1.5 text-slate-400">{pct2(point.cdiPercent)}</td>
                    <td className={`px-2 py-1.5 font-semibold ${cdiTone(point.percentOfCdi)}`}>{pct0(point.percentOfCdi)}</td>
                    <td className="px-2 py-1.5 text-amber-300">{pct2(point.ipcaPercent)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">* mês em andamento (parcial)</p>
        </section>
      ) : null}

      {data ? (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Por investimento</h2>
          <div className="space-y-2 text-sm">
            {data.investments.map((item) => (
              <div key={item.investmentId} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{item.label}</p>
                    <p className="text-xs text-slate-500">
                      {item.institution} · {item.sharePercent.toFixed(1)}% da carteira
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-slate-100">{formatCurrency(item.balance)}</p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-300">
                  <span>Rendimento: {formatCurrency(item.grossIncome)}</span>
                  <span>
                    Rentab.: {pct2(item.returnPercent)} ({item.returnMonths} m)
                  </span>
                  <span>
                    % CDI:{" "}
                    <span className={`font-semibold ${cdiTone(item.percentOfCdi)}`}>{pct0(item.percentOfCdi)}</span>
                    {item.contractedCdiPercent !== null ? ` / ${pct0(item.contractedCdiPercent)} contratado` : ""}
                  </span>
                  <span className="text-rose-300">IR est.: {formatCurrency(item.estimatedTax)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data ? (
        <section className="card">
          <h2 className="mb-1 text-sm font-semibold">Limite do FGC por instituição</h2>
          <p className="mb-3 text-xs text-slate-500">Garantia de até R$ 250 mil por CPF em cada instituição.</p>
          <div className="space-y-3 text-xs">
            {data.institutions.map((item) => (
              <div key={item.institution}>
                <div className="flex justify-between text-slate-300">
                  <span className="font-semibold text-slate-100">{item.institution}</span>
                  <span>
                    {formatCurrency(item.balance)} · {item.fgcUsagePercent.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-800">
                  <div
                    className={`h-2 rounded-full ${fgcBarClass(item.fgcStatus)}`}
                    style={{ width: `${Math.min(100, item.fgcUsagePercent)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Folga: {formatCurrency(Math.max(0, item.fgcLimit - item.balance))}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
