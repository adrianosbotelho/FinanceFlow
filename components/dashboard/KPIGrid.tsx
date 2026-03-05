import { DashboardKPIs } from "../../types";
import { KPICard } from "./KPICard";

interface KPIGridProps {
  kpis: DashboardKPIs;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        label="Renda passiva mensal"
        value={kpis.totalPassiveIncomeCurrentMonth}
        delta={kpis.momGrowth}
      />
      <KPICard
        label="Rendimento CDBs (mês)"
        value={kpis.cdbTotalYieldCurrentMonth}
        delta={kpis.momGrowth}
      />
      <KPICard
        label="Dividendos de FIIs (mês)"
        value={kpis.fiiDividendsCurrentMonth}
        delta={kpis.momGrowth}
      />
      <KPICard
        label="Crescimento Mês a Mês"
        value={kpis.momGrowth}
        variant="percent"
        delta={kpis.momGrowth}
      />
      <KPICard
        label="Desempenho Ano a Ano"
        value={kpis.yoyGrowth}
        variant="percent"
        delta={kpis.yoyGrowth}
      />
      <KPICard
        label="Renda acumulada no ano (YTD)"
        value={kpis.ytdPassiveIncome}
        delta={kpis.yoyGrowth}
      />
    </section>
  );
}
