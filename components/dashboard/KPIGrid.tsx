import { DashboardKPIs } from "../../types";
import { KPICard } from "./KPICard";

interface KPIGridProps {
  kpis: DashboardKPIs;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  return (
    <div className="kpi-grid mb-6">
      <KPICard
        label="Renda Passiva (Mês Atual)"
        value={kpis.totalPassiveIncomeCurrentMonth}
        delta={kpis.momGrowth}
      />
      <KPICard
        label="CDB - Rendimento Mensal"
        value={kpis.cdbTotalYieldCurrentMonth}
        delta={kpis.momGrowth}
      />
      <KPICard
        label="FIIs - Dividendos Mensais"
        value={kpis.fiiDividendsCurrentMonth}
        delta={kpis.momGrowth}
      />
      <KPICard
        label="Crescimento M/M"
        value={kpis.momGrowth}
        variant="percent"
        delta={kpis.momGrowth}
      />
      <KPICard
        label="Crescimento A/A"
        value={kpis.yoyGrowth}
        variant="percent"
        delta={kpis.yoyGrowth}
      />
      <KPICard
        label="Renda Passiva YTD"
        value={kpis.ytdPassiveIncome}
        delta={kpis.yoyGrowth}
      />
      <KPICard
        label="Yield da Carteira (12m)"
        value={kpis.portfolioYield}
        variant="percent"
        delta={kpis.passiveIncomeCAGR}
      />
      <KPICard
        label="Projeção Anual"
        value={kpis.annualProjection}
        delta={kpis.passiveIncomeCAGR}
      />
    </div>
  );
}
