import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import {
  DashboardPayload,
  FinancialInsights,
  IncomeDistribution,
  PassiveIncomeByMonth,
} from "../../../types";
import { buildKpis } from "../../../lib/calculations";

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
        cdb_santander: 0,
        fii_dividends: 0,
        total: 0,
      };
      seriesMap.set(key, bucket);
    }

    if (inv.type === "CDB" && inv.institution === "Itaú") {
      bucket.cdb_itau += Number(row.income_value);
    } else if (inv.type === "CDB" && inv.institution === "Santander") {
      bucket.cdb_santander += Number(row.income_value);
    } else if (inv.type === "FII") {
      bucket.fii_dividends += Number(row.income_value);
    }

    bucket.total =
      bucket.cdb_itau + bucket.cdb_santander + bucket.fii_dividends;
  }

  const monthlySeries = Array.from(seriesMap.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month,
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
        acc.santanderCdb += m.cdb_santander;
        acc.fii += m.fii_dividends;
        return acc;
      },
      { itauCdb: 0, santanderCdb: 0, fii: 0 },
    );

  const insights: FinancialInsights = buildInsights(kpis, distribution);

  const payload: DashboardPayload = {
    kpis,
    monthlySeries: monthlySeries.filter((m) => m.year === year),
    yoySeries,
    distribution,
    insights,
  };

  return NextResponse.json(payload);
}

function buildInsights(
  kpis: DashboardPayload["kpis"],
  distribution: IncomeDistribution,
): FinancialInsights {
  const totalCdb = distribution.itauCdb + distribution.santanderCdb;
  const totalFii = distribution.fii;
  const ratio = totalCdb > 0 ? (totalFii / totalCdb) * 100 : 0;

  let bestSource: FinancialInsights["bestSource"] = "FII";
  if (distribution.itauCdb >= distribution.santanderCdb && distribution.itauCdb >= totalFii) {
    bestSource = "CDB_ITAU";
  } else if (
    distribution.santanderCdb > distribution.itauCdb &&
    distribution.santanderCdb >= totalFii
  ) {
    bestSource = "CDB_SANTANDER";
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
