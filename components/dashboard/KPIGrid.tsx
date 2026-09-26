import { DashboardKPIs } from "../../types";
import { KPICard } from "./KPICard";

interface KPIGridProps {
  kpis: DashboardKPIs;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  // Destaque = variação real; no mês em andamento a projeção de fechamento aparece como linha secundária.
  const isProjection = kpis.comparisonBasis === "projection";
  const momLabel = "vs mês anterior";
  const yoyLabel = "vs mesmo mês do ano anterior";
  const projectionMomLabel = isProjection ? "Projeção do mês vs mês anterior:" : null;
  const projectionYoyLabel = isProjection ? "Projeção vs mesmo mês do ano anterior:" : null;
  const showFii = kpis.hasActiveFii !== false || kpis.fiiDividendsCurrentMonth > 0;

  return (
    <section
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${showFii ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}
    >
      <KPICard
        label="Renda passiva mensal (CDBs + FIIs)"
        value={kpis.totalPassiveIncomeCurrentMonth}
        delta={kpis.momGrowth}
        comparisonLabel={momLabel}
        secondaryLabel={projectionMomLabel}
        secondaryDelta={kpis.projectedMomGrowth}
      />
      <KPICard
        label="Rendimento CDBs (mês, total)"
        value={kpis.cdbTotalYieldCurrentMonth}
        delta={kpis.cdbMomGrowth}
        comparisonLabel={momLabel}
        secondaryLabel={projectionMomLabel}
        secondaryDelta={kpis.projectedCdbMomGrowth}
      />
      {showFii ? (
        <KPICard
          label="Dividendos de FIIs (mês)"
          value={kpis.fiiDividendsCurrentMonth}
          delta={kpis.fiiMomGrowth}
          comparisonLabel={momLabel}
          secondaryLabel={projectionMomLabel}
          secondaryDelta={kpis.projectedFiiMomGrowth}
        />
      ) : null}
      <KPICard
        label="Crescimento Mês a Mês"
        value={kpis.momGrowth}
        variant="percent"
        delta={kpis.momGrowth}
        comparisonLabel={momLabel}
        secondaryLabel={projectionMomLabel}
        secondaryDelta={kpis.projectedMomGrowth}
      />
      <KPICard
        label="Desempenho Ano a Ano"
        value={kpis.yoyGrowth}
        variant="percent"
        delta={kpis.yoyGrowth}
        comparisonLabel={yoyLabel}
        secondaryLabel={projectionYoyLabel}
        secondaryDelta={kpis.projectedYoyGrowth}
      />
      <KPICard
        label="Renda acumulada no ano (YTD)"
        value={kpis.ytdPassiveIncome}
        delta={kpis.yoyGrowth}
        comparisonLabel={yoyLabel}
      />
    </section>
  );
}
