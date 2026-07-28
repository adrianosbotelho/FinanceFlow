import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { CdbKpiEntry, DashboardMonth, DashboardPayload } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildInvestmentLabel(inv: { type: string; institution: string; name: string }): string {
  if (inv.type === "FII") return "Dividendos FIIs";
  return inv.name || `CDB ${inv.institution}`;
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("id,type,institution,name,amount_invested"),
      supabase
        .from("monthly_returns")
        .select("investment_id,month,year,income_value")
        .gte("year", year - 1)
        .lte("year", year),
    ]);

  if (invError || retError || !investments || !returns) {
    return NextResponse.json(
      { error: (invError ?? retError)?.message ?? "Erro ao buscar dashboard." },
      { status: 500 },
    );
  }

  const byInv = new Map(investments.map((i) => [i.id, i]));
  const cdbInvestments = investments.filter((inv) => inv.type === "CDB");
  const monthMap = new Map<string, DashboardMonth>();

  for (const row of returns) {
    const inv = byInv.get(row.investment_id);
    if (!inv) continue;
    const key = `${row.year}-${row.month}`;
    let bucket = monthMap.get(key);
    if (!bucket) {
      bucket = {
        month: Number(row.month),
        year: Number(row.year),
        cdb_items: cdbInvestments.map((cdb) => ({
          investment_id: cdb.id,
          label: buildInvestmentLabel(cdb),
          income: 0,
        })),
        fiis: 0,
        total: 0,
        mom_pct: null,
        mom_value: null,
      };
      monthMap.set(key, bucket);
    }

    const income = Number(row.income_value ?? 0);
    if (inv.type === "CDB") {
      const cdbEntry = bucket.cdb_items.find((c) => c.investment_id === inv.id);
      if (cdbEntry) {
        cdbEntry.income += income;
      }
    } else {
      bucket.fiis += income;
    }
    const cdbTotal = bucket.cdb_items.reduce((acc, c) => acc + c.income, 0);
    bucket.total = cdbTotal + bucket.fiis;
    monthMap.set(key, bucket);
  }

  const seriesAll = Array.from(monthMap.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  const seriesWithMom = seriesAll.map((entry, index) => {
    const prev = index > 0 ? seriesAll[index - 1] : null;
    const momValue = prev ? entry.total - prev.total : null;
    const momPct = prev && prev.total > 0 ? ((entry.total - prev.total) / prev.total) * 100 : null;
    return {
      ...entry,
      mom_value: momValue,
      mom_pct: momPct,
    };
  });
  const monthlySeries = seriesWithMom.filter((m) => m.year === year);
  const current = monthlySeries[monthlySeries.length - 1] ?? null;

  const prev = current
    ? seriesAll
        .filter((m) => m.year < current.year || (m.year === current.year && m.month < current.month))
        .slice(-1)[0] ?? null
    : null;

  const cdbCurrent = current ? current.cdb_items.reduce((acc, c) => acc + c.income, 0) : 0;
  const cdbPrev = prev ? prev.cdb_items.reduce((acc, c) => acc + c.income, 0) : 0;

  const cdbItems: CdbKpiEntry[] = cdbInvestments.map((cdb) => {
    const currEntry = current?.cdb_items.find((c) => c.investment_id === cdb.id);
    const prevEntry = prev?.cdb_items.find((c) => c.investment_id === cdb.id);
    const currIncome = currEntry?.income ?? 0;
    const prevIncome = prevEntry?.income ?? 0;
    return {
      investment_id: cdb.id,
      label: buildInvestmentLabel(cdb),
      currentMonth: currIncome,
      momGrowth: prevIncome > 0 ? ((currIncome - prevIncome) / prevIncome) * 100 : null,
      momDelta: prev ? currIncome - prevIncome : null,
    };
  });

  const totalInvested = investments.reduce((acc, inv) => acc + Number(inv.amount_invested ?? 0), 0);
  const rolling12 = seriesAll.slice(-12).reduce((acc, m) => acc + m.total, 0);
  const portfolioYield = totalInvested > 0 ? (rolling12 / totalInvested) * 100 : 0;

  const payload: DashboardPayload = {
    year,
    kpis: {
      totalMonth: current?.total ?? 0,
      cdbMonth: cdbCurrent,
      fiisMonth: current?.fiis ?? 0,
      momTotalPct: prev && prev.total > 0 && current ? ((current.total - prev.total) / prev.total) * 100 : null,
      momCdbPct: cdbPrev > 0 ? ((cdbCurrent - cdbPrev) / cdbPrev) * 100 : null,
      momFiisPct: prev && prev.fiis > 0 && current ? ((current.fiis - prev.fiis) / prev.fiis) * 100 : null,
      cdbItems,
      ytd: monthlySeries.reduce((acc, m) => acc + m.total, 0),
      totalInvested,
      rolling12,
      portfolioYieldPct: portfolioYield,
    },
    monthlySeries,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
