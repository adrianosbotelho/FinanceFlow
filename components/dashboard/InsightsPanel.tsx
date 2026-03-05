import { DashboardKPIs, FinancialInsights } from "../../types";
import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  kpis: DashboardKPIs;
  insights: FinancialInsights;
}

export function InsightsPanel({ kpis, insights }: Props) {
  const bestSourceLabel =
    insights.bestSource === "CDB_ITAU"
      ? "CDB Itaú"
      : insights.bestSource === "CDB_SANTANDER"
        ? "CDB Santander"
        : "FIIs";

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">
        Insights Financeiros
      </h2>
      <ul className="space-y-2 text-xs text-slate-300 md:text-sm">
        <li>
          <span className="font-medium text-slate-100">
            Tendência de crescimento:
          </span>{" "}
          {insights.growthTrend === "alta"
            ? "Renda passiva em trajetória de alta."
            : insights.growthTrend === "queda"
              ? "Renda passiva em queda, atenção à consistência dos aportes."
              : "Renda passiva estável ao longo dos meses."}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Fonte mais relevante:
          </span>{" "}
          {bestSourceLabel}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Dependência FIIs vs CDBs:
          </span>{" "}
          {formatPercentage(insights.fiiToCdbRatio)}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Renda passiva acumulada 12m:
          </span>{" "}
          {formatCurrencyBRL(kpis.rolling12Months)}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Projeção anual de renda passiva:
          </span>{" "}
          {formatCurrencyBRL(kpis.annualProjection)}
        </li>
        <li className="text-slate-400">{insights.commentary}</li>
      </ul>
    </Card>
  );
}
