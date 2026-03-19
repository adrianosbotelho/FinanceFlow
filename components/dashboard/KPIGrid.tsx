import { DashboardKPIs } from "../../types";
import { KPICard } from "./KPICard";

interface KPIGridProps {
  kpis: DashboardKPIs;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        label="Renda passiva mensal (CDBs + FIIs)"
        value={kpis.totalPassiveIncomeCurrentMonth}
        delta={kpis.momGrowth}
        comparisonLabel="vs mês anterior"
      />
      <KPICard
        label="Rendimento CDBs (mês, total)"
        value={kpis.cdbTotalYieldCurrentMonth}
        delta={kpis.cdbMomGrowth}
        comparisonLabel="vs mês anterior"
      />
      <KPICard
        label="Dividendos de FIIs (mês)"
        value={kpis.fiiDividendsCurrentMonth}
        delta={kpis.fiiMomGrowth}
        comparisonLabel="vs mês anterior"
      />
      <KPICard
        label="Crescimento Mês a Mês"
        value={kpis.momGrowth}
        variant="percent"
        delta={kpis.momGrowth}
        comparisonLabel="vs mês anterior"
      />
      <KPICard
        label="Desempenho Ano a Ano"
        value={kpis.yoyGrowth}
        variant="percent"
        delta={kpis.yoyGrowth}
        comparisonLabel="vs mesmo mês do ano anterior"
      />
      <KPICard
        label="Renda acumulada no ano (YTD)"
        value={kpis.ytdPassiveIncome}
        delta={kpis.yoyGrowth}
        comparisonLabel="vs mesmo mês do ano anterior"
      />
    </section>
  );
}
