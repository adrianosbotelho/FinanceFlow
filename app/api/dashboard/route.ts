import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import {
  ConsistencyAlert,
  DashboardPayload,
  FinancialInsights,
  GoalProgress,
  IncomeDistribution,
  MonthComparisonPoint,
  PassiveIncomeByMonth,
} from "../../../types";
import { buildKpis } from "../../../lib/calculations";
import { monthLabel } from "../../../lib/formatters";

function isItauInstitution(institution: string): boolean {
  const normalized = institution
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("itau");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("*"),
      supabase
        .from("monthly_returns")
        .select("*")
        .gte("year", year - 1)
        .lte("year", year)
        .order("year")
        .order("month"),
    ]);

  if (invError || retError || !investments || !returns) {
    console.error(invError ?? retError);
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao buscar dados" },
      { status: 500 },
    );
  }

  const byInvestment = new Map<string, (typeof investments)[number]>();
  for (const inv of investments) {
    byInvestment.set(inv.id, inv);
  }

  const seriesMap = new Map<string, PassiveIncomeByMonth>();

  function getKey(y: number, m: number) {
    return `${y}-${m}`;
  }

  for (const row of returns) {
    const inv = byInvestment.get(row.investment_id);
    if (!inv) continue;

    const key = getKey(row.year, row.month);
    let bucket = seriesMap.get(key);
    if (!bucket) {
      bucket = {
        month: row.month,
        year: row.year,
        cdb_itau: 0,
        cdb_other: 0,
        fii_dividends: 0,
        total: 0,
      };
      seriesMap.set(key, bucket);
    }

    if (inv.type === "CDB") {
      if (isItauInstitution(inv.institution)) {
        bucket.cdb_itau += Number(row.income_value);
      } else {
        bucket.cdb_other += Number(row.income_value);
      }
    } else if (inv.type === "FII") {
      bucket.fii_dividends += Number(row.income_value);
    }

    bucket.total =
      bucket.cdb_itau + bucket.cdb_other + bucket.fii_dividends;
  }

  const monthlySeries = Array.from(seriesMap.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );

  const byYearMonth = new Map<string, PassiveIncomeByMonth>();
  for (const m of monthlySeries) {
    byYearMonth.set(`${m.year}-${m.month}`, m);
  }

  const yearPrev = year - 1;
  const comparisonByMonth: MonthComparisonPoint[] = Array.from(
    { length: 12 },
    (_, i) => {
      const month = i + 1;
      const prev = byYearMonth.get(`${yearPrev}-${month}`);
      const curr = byYearMonth.get(`${year}-${month}`);
      return {
        month,
        monthName: monthLabel(month),
        yearPrev,
        yearCurr: year,
        itauPrev: prev?.cdb_itau ?? 0,
        itauCurr: curr?.cdb_itau ?? 0,
        otherCdbPrev: prev?.cdb_other ?? 0,
        otherCdbCurr: curr?.cdb_other ?? 0,
        fiiPrev: prev?.fii_dividends ?? 0,
        fiiCurr: curr?.fii_dividends ?? 0,
        totalPrev: prev?.total ?? 0,
        totalCurr: curr?.total ?? 0,
      };
    },
  );

  const yoySeries = monthlySeries.filter((m) => m.year === year);

  const totalInvested = investments.reduce(
    (acc, inv) => acc + Number(inv.amount_invested),
    0,
  );

  const kpis = buildKpis(monthlySeries, year, totalInvested);

  const distribution: IncomeDistribution = monthlySeries
    .filter((m) => m.year === year)
    .reduce(
      (acc, m) => {
        acc.itauCdb += m.cdb_itau;
        acc.otherCdb += m.cdb_other;
        acc.fii += m.fii_dividends;
        return acc;
      },
      { itauCdb: 0, otherCdb: 0, fii: 0 },
    );

  const insights: FinancialInsights = buildInsights(kpis, distribution);
  const goalProgress = buildGoalProgress(kpis);
  const alerts = buildConsistencyAlerts({
    year,
    monthlySeries,
    kpis,
  });

  const payload: DashboardPayload = {
    kpis,
    monthlySeries: monthlySeries.filter((m) => m.year === year),
    yoySeries,
    comparisonByMonth,
    distribution,
    insights,
    goalProgress,
    alerts,
  };

  return NextResponse.json(payload);
}

function buildGoalProgress(kpis: DashboardPayload["kpis"]): GoalProgress {
  const annualIncomeTarget = Number(
    process.env.FINANCEFLOW_ANNUAL_INCOME_TARGET ?? 12000,
  );
  const annualProjection = kpis.annualProjection;
  const progressPercent =
    annualIncomeTarget > 0
      ? Math.max(0, Math.min((annualProjection / annualIncomeTarget) * 100, 999))
      : 0;
  const gapToTarget = Math.max(annualIncomeTarget - annualProjection, 0);

  return {
    annualIncomeTarget,
    annualProjection,
    progressPercent,
    gapToTarget,
    onTrack: annualProjection >= annualIncomeTarget,
  };
}

function buildConsistencyAlerts({
  year,
  monthlySeries,
  kpis,
}: {
  year: number;
  monthlySeries: PassiveIncomeByMonth[];
  kpis: DashboardPayload["kpis"];
}): ConsistencyAlert[] {
  const alerts: ConsistencyAlert[] = [];
  const yearSeries = monthlySeries.filter((m) => m.year === year);

  if (yearSeries.length === 0) {
    alerts.push({
      code: "NO_DATA_YEAR",
      severity: "warning",
      message: `Nenhum lançamento encontrado para ${year}.`,
    });
    return alerts;
  }

  const now = new Date();
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const monthsWithData = new Set(yearSeries.map((m) => m.month));
  const missingMonths: number[] = [];
  for (let month = 1; month <= maxMonth; month++) {
    if (!monthsWithData.has(month)) {
      missingMonths.push(month);
    }
  }
  if (missingMonths.length > 0) {
    alerts.push({
      code: "MISSING_MONTHS",
      severity: "warning",
      message: `${missingMonths.length} mês(es) sem lançamento em ${year} até agora.`,
    });
  }

  if (kpis.momGrowth !== null && kpis.momGrowth <= -15) {
    alerts.push({
      code: "MOM_SHARP_DROP",
      severity: "critical",
      message: `Queda forte no mês: ${kpis.momGrowth.toFixed(1)}% vs mês anterior.`,
    });
  }

  if (kpis.yoyGrowth !== null && kpis.yoyGrowth < 0) {
    alerts.push({
      code: "YOY_NEGATIVE",
      severity: "warning",
      message: `Comparativo anual negativo: ${kpis.yoyGrowth.toFixed(1)}%.`,
    });
  }

  return alerts;
}

function buildInsights(
  kpis: DashboardPayload["kpis"],
  distribution: IncomeDistribution,
): FinancialInsights {
  const totalCdb = distribution.itauCdb + distribution.otherCdb;
  const totalFii = distribution.fii;
  const ratio = totalCdb > 0 ? (totalFii / totalCdb) * 100 : 0;

  let bestSource: FinancialInsights["bestSource"] = "FII";
  if (distribution.itauCdb >= distribution.otherCdb && distribution.itauCdb >= totalFii) {
    bestSource = "CDB_ITAU";
  } else if (
    distribution.otherCdb > distribution.itauCdb &&
    distribution.otherCdb >= totalFii
  ) {
    bestSource = "CDB_OTHER";
  }

  const trend =
    kpis.momGrowth && kpis.momGrowth > 0
      ? "alta"
      : kpis.momGrowth && kpis.momGrowth < 0
        ? "queda"
        : "estável";

  const commentary = `Sua renda passiva está em ${trend}. A projeção anual é de aproximadamente R$ ${kpis.annualProjection.toFixed(
    2,
  )}.`;

  return {
    growthTrend: trend,
    bestSource,
    fiiToCdbRatio: ratio,
    commentary,
  };
}
