import {
  ConsistencyAlert,
  DashboardKPIs,
  FinancialInsights,
  GoalProgress,
} from "../../types";
import { formatCurrencyBRL, formatPercentage } from "../../lib/formatters";
import { Card } from "../ui/Card";

interface Props {
  kpis: DashboardKPIs;
  insights: FinancialInsights;
  goalProgress: GoalProgress;
  alerts: ConsistencyAlert[];
}

export function InsightsPanel({ kpis, insights, goalProgress, alerts }: Props) {
  const bestSourceLabel =
    insights.bestSource === "CDB_ITAU"
      ? "CDB Itaú"
      : insights.bestSource === "CDB_OTHER"
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
            Previsão do próximo mês:
          </span>{" "}
          {formatCurrencyBRL(insights.forecastNextMonth)}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Faixa prevista:
          </span>{" "}
          {formatCurrencyBRL(insights.forecastRangeMin)} a{" "}
          {formatCurrencyBRL(insights.forecastRangeMax)}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Confiança da previsão:
          </span>{" "}
          {formatPercentage(insights.forecastConfidence)}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Sazonalidade esperada:
          </span>{" "}
          {insights.seasonalityFactor.toFixed(2)}x
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Volatilidade recente:
          </span>{" "}
          {formatPercentage(insights.volatilityPercent)}
        </li>
        <li>
          <span className="font-medium text-slate-100">Anomalia detectada:</span>{" "}
          {insights.anomalyDetected ? (
            <span className="font-medium text-amber-300">
              Sim ({insights.anomalyReason})
            </span>
          ) : (
            <span className="text-emerald-300">Não</span>
          )}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            Yield da carteira (12m):
          </span>{" "}
          {formatPercentage(kpis.portfolioYield)}
        </li>
        <li>
          <span className="font-medium text-slate-100">
            CAGR da renda passiva:
          </span>{" "}
          {formatPercentage(kpis.passiveIncomeCAGR)}
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
        <li>
          <span className="font-medium text-slate-100">
            Meta anual de renda passiva:
          </span>{" "}
          {formatCurrencyBRL(goalProgress.annualIncomeTarget)}
        </li>
        <li>
          <span className="font-medium text-slate-100">Progresso da meta:</span>{" "}
          {goalProgress.progressPercent.toFixed(1)}%{" "}
          {goalProgress.onTrack
            ? "(no ritmo)"
            : `(faltam ${formatCurrencyBRL(goalProgress.gapToTarget)})`}
        </li>
        {alerts.length > 0 && (
          <li>
            <span className="font-medium text-slate-100">
              Alertas de consistência:
            </span>
            <ul className="mt-1 space-y-1">
              {alerts.map((alert) => (
                <li
                  key={alert.code}
                  className={
                    alert.severity === "critical"
                      ? "text-rose-300"
                      : alert.severity === "warning"
                        ? "text-amber-300"
                        : "text-slate-300"
                  }
                >
                  • {alert.message}
                </li>
              ))}
            </ul>
          </li>
        )}
        <li className="text-slate-400">{insights.commentary}</li>
      </ul>
    </Card>
  );
}
