"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiquidityInvestmentItem, LiquidityPayload } from "../../types";
import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";
import { Card } from "../ui/Card";

const MISSING_LABELS: Record<LiquidityInvestmentItem["missing"][number], string> = {
  start_date: "data de início",
  maturity_date: "vencimento",
  liquidity: "liquidez",
};

const BUCKET_COLORS: Record<string, string> = {
  d0: "bg-emerald-500",
  ate30: "bg-cyan-500",
  ate90: "bg-sky-500",
  ate365: "bg-violet-500",
  acima365: "bg-slate-400",
  nao_informada: "bg-slate-600",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function maturityBadge(days: number | null): { label: string; className: string } | null {
  if (days === null) return null;
  if (days === 0) return { label: "Vencido", className: "border-rose-700 text-rose-300" };
  if (days <= 30) return { label: `${days} dias`, className: "border-rose-700 text-rose-300" };
  if (days <= 90) return { label: `${days} dias`, className: "border-amber-700 text-amber-300" };
  return { label: `${days} dias`, className: "border-slate-700 text-slate-300" };
}

export function LiquidityPageClient() {
  const [data, setData] = useState<LiquidityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/liquidity", { cache: "no-store" });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "Erro ao carregar liquidez e vencimentos.");
        }
        setData((await res.json()) as LiquidityPayload);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const summary = data?.summary;
  const incomplete = (data?.investments ?? []).filter((item) => item.missing.length > 0);
  const withMaturity = (data?.investments ?? [])
    .filter((item) => item.maturityDate !== null)
    .sort((a, b) => (a.daysToMaturity ?? 0) - (b.daysToMaturity ?? 0));
  const bucketMax = Math.max(1, ...(data?.buckets ?? []).map((bucket) => bucket.gross));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">Liquidez e Vencimentos</h2>
        <p className="text-sm text-slate-400">
          Quanto você teria de fato ao resgatar (IR regressivo e IOF por aplicação), quando o dinheiro fica
          disponível e quais vencimentos se aproximam.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-400">Carregando...</p> : null}

      {incomplete.length > 0 ? (
        <Card className="border-amber-800/60">
          <p className="text-xs font-semibold text-amber-300">Complete o cadastro para esta página ficar precisa</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-300">
            {incomplete.map((item) => (
              <li key={item.investmentId}>
                • <span className="font-semibold">{item.label}</span>: falta{" "}
                {item.missing.map((field) => MISSING_LABELS[field]).join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            Sem data de início, a idade da aplicação inicial é estimada pelo primeiro mês com renda. Edite em{" "}
            <Link href="/investments" className="text-cyan-300 underline">
              Investimentos
            </Link>
            .
          </p>
        </Card>
      ) : null}

      {data?.warnings.length ? (
        <Card>
          <ul className="space-y-1 text-xs text-amber-300">
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <p className="text-xs text-slate-400">Patrimônio líquido de impostos</p>
            <p className="text-2xl font-bold text-slate-50">{formatCurrencyBRL(summary.net)}</p>
            <p className="mt-1 text-xs text-slate-400">Bruto: {formatCurrencyBRL(summary.gross)}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">IR + IOF se resgatar tudo hoje</p>
            <p className="text-2xl font-bold text-rose-300">{formatCurrencyBRL(summary.incomeTax + summary.iof)}</p>
            <p className="mt-1 text-xs text-slate-400">
              IR {formatCurrencyBRL(summary.incomeTax)} · IOF {formatCurrencyBRL(summary.iof)}
              {summary.effectiveTaxRatePercent !== null
                ? ` · ${formatPercentage(summary.effectiveTaxRatePercent)} do rendimento`
                : ""}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Disponível já (líquido)</p>
            <p className="text-2xl font-bold text-emerald-300">{formatCurrencyBRL(summary.availableNowNet)}</p>
            <p className="mt-1 text-xs text-slate-400">Liquidez diária (D+0/D+1)</p>
          </Card>
          <Card>
            <p className="text-xs text-slate-400">Vencendo em até 90 dias</p>
            <p className="text-2xl font-bold text-amber-300">{formatCurrencyBRL(summary.maturingIn90DaysGross)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {summary.maturingIn90DaysCount} aplicação(ões) para reaplicar ou resgatar
            </p>
          </Card>
        </div>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Escada de liquidez</h3>
          <p className="mb-3 text-xs text-slate-400">
            Em quanto tempo o dinheiro pode ser resgatado, pela liquidez cadastrada (ou pelo vencimento, quando a
            liquidez é só no vencimento). Valores líquidos de IR e IOF.
          </p>
          <div className="space-y-2">
            {data.buckets.map((bucket) => (
              <div key={bucket.key} className="grid grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="text-slate-300">{bucket.label}</span>
                <div className="h-3 rounded-full bg-slate-800">
                  <div
                    className={`h-3 rounded-full ${BUCKET_COLORS[bucket.key]}`}
                    style={{ width: `${Math.min(100, (bucket.gross / bucketMax) * 100)}%` }}
                  />
                </div>
                <span className="w-32 text-right font-semibold text-slate-100">{formatCurrencyBRL(bucket.net)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Calendário de vencimentos</h3>
          <p className="mb-2 text-xs text-slate-400">
            Valor no vencimento projetado com o % do CDI contratado e o CDI atual (
            {data.cdiAnnualRatePct.toFixed(2).replace(".", ",")}% a.a.).
          </p>
          {withMaturity.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nenhum investimento com data de vencimento cadastrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2">Investimento</th>
                    <th className="py-2">Vencimento</th>
                    <th className="py-2">Faltam</th>
                    <th className="py-2">Liquidez</th>
                    <th className="py-2">Saldo hoje</th>
                    <th className="py-2">Bruto no vencimento</th>
                    <th className="py-2">Líquido no vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {withMaturity.map((item) => {
                    const badge = maturityBadge(item.daysToMaturity);
                    return (
                      <tr key={item.investmentId} className="border-t border-slate-800 text-slate-200">
                        <td className="py-2">
                          <p className="font-semibold text-slate-100">{item.label}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.institution}
                            {item.contractedCdiPercent !== null ? ` · ${item.contractedCdiPercent.toFixed(0)}% do CDI` : ""}
                          </p>
                        </td>
                        <td className="py-2">{formatDate(item.maturityDate)}</td>
                        <td className="py-2">
                          {badge ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 text-slate-300">{item.liquidityLabel}</td>
                        <td className="py-2">{formatCurrencyBRL(item.balance)}</td>
                        <td className="py-2">
                          {item.maturityGrossValue === null ? "—" : formatCurrencyBRL(item.maturityGrossValue)}
                        </td>
                        <td className="py-2 font-semibold text-emerald-300">
                          {item.maturityNetValue === null ? "—" : formatCurrencyBRL(item.maturityNetValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {data ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Impostos no resgate por investimento</h3>
          <p className="mb-2 text-xs text-slate-400">
            IR pela tabela regressiva (até 180 dias 22,5%; até 360 dias 20%; até 720 dias 17,5%; acima 15%) aplicado
            a cada aplicação/aporte, e IOF nos resgates com menos de 30 dias. O rendimento é distribuído entre as
            aplicações por valor × tempo aplicado.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2">Investimento</th>
                  <th className="py-2">Saldo</th>
                  <th className="py-2">Principal</th>
                  <th className="py-2">Rendimento</th>
                  <th className="py-2">Prazo médio</th>
                  <th className="py-2">Alíquota efetiva</th>
                  <th className="py-2">IR + IOF</th>
                  <th className="py-2">Líquido</th>
                  <th className="py-2">Próxima redução</th>
                </tr>
              </thead>
              <tbody>
                {data.investments.map((item) => (
                  <tr key={item.investmentId} className="border-t border-slate-800 text-slate-200">
                    <td className="py-2">
                      <p className="font-semibold text-slate-100">{item.label}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.institution} · {item.liquidityLabel}
                      </p>
                    </td>
                    <td className="py-2">{formatCurrencyBRL(item.balance)}</td>
                    <td className="py-2 text-slate-300">{formatCurrencyBRL(item.principal)}</td>
                    <td className="py-2 text-emerald-300">{formatCurrencyBRL(item.gain)}</td>
                    <td className="py-2 text-slate-300">
                      {item.averageDaysInvested === null ? "—" : `${Math.round(item.averageDaysInvested)} dias`}
                      {item.hasEstimatedDates ? <span className="ml-1 text-[10px] text-amber-300">(estimado)</span> : null}
                    </td>
                    <td className="py-2">
                      {item.effectiveTaxRatePercent === null ? "—" : formatPercentage(item.effectiveTaxRatePercent)}
                    </td>
                    <td className="py-2 text-rose-300">
                      {formatCurrencyBRL(item.incomeTax + item.iof)}
                      {item.iof > 0 ? (
                        <span className="ml-1 text-[10px] text-slate-500">(IOF {formatCurrencyBRL(item.iof)})</span>
                      ) : null}
                    </td>
                    <td className="py-2 font-semibold text-slate-100">{formatCurrencyBRL(item.net)}</td>
                    <td className="py-2 text-slate-300">
                      {item.nextTaxBracket
                        ? `${formatPercentage(item.nextTaxBracket.ratePercent)} em ${item.nextTaxBracket.inDays} dias`
                        : "Já na menor alíquota"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
