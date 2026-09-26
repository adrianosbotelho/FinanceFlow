import { DashboardKPIs } from "../../types";
import { KPICard } from "./KPICard";

interface KPIGridProps {
  kpis: DashboardKPIs;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  // Mês em andamento: variações comparam a projeção de fechamento com o mês anterior.
  const isProjection = kpis.comparisonBasis === "projection";
  const momLabel = isProjection ? "projeção do mês vs mês anterior" : "vs mês anterior";
  const yoyLabel = isProjection ? "projeção vs mesmo mês do ano anterior" : "vs mesmo mês do ano anterior";
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
      />
      <KPICard
        label="Rendimento CDBs (mês, total)"
        value={kpis.cdbTotalYieldCurrentMonth}
        delta={kpis.cdbMomGrowth}
        comparisonLabel={momLabel}
      />
      {showFii ? (
        <KPICard
          label="Dividendos de FIIs (mês)"
          value={kpis.fiiDividendsCurrentMonth}
          delta={kpis.fiiMomGrowth}
          comparisonLabel={momLabel}
        />
      ) : null}
      <KPICard
        label="Crescimento Mês a Mês"
        value={kpis.momGrowth}
        variant="percent"
        delta={kpis.momGrowth}
        comparisonLabel={momLabel}
      />
      <KPICard
        label="Desempenho Ano a Ano"
        value={kpis.yoyGrowth}
        variant="percent"
        delta={kpis.yoyGrowth}
        comparisonLabel={yoyLabel}
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
