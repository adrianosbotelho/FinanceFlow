import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { DashboardMonth, DashboardPayload } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isItau(institution: string): boolean {
  return institution
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("itau");
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());

  const [{ data: investments, error: invError }, { data: returns, error: retError }] =
    await Promise.all([
      supabase.from("investments").select("id,type,institution"),
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
  const monthMap = new Map<string, DashboardMonth>();

  for (const row of returns) {
    const inv = byInv.get(row.investment_id);
    if (!inv) continue;
    const key = `${row.year}-${row.month}`;
    const bucket =
      monthMap.get(key) ??
      {
        month: Number(row.month),
        year: Number(row.year),
        cdb_itau: 0,
        cdb_santander: 0,
        fiis: 0,
        total: 0,
        mom_pct: null,
        mom_value: null,
      };

    const income = Number(row.income_value ?? 0);
    if (inv.type === "CDB") {
      if (isItau(inv.institution)) {
        bucket.cdb_itau += income;
      } else {
        bucket.cdb_santander += income;
      }
    } else {
      bucket.fiis += income;
    }
    bucket.total = bucket.cdb_itau + bucket.cdb_santander + bucket.fiis;
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

  const cdbCurrent = current ? current.cdb_itau + current.cdb_santander : 0;
  const cdbPrev = prev ? prev.cdb_itau + prev.cdb_santander : 0;
  const cdbItauCurrent = current?.cdb_itau ?? 0;
  const cdbItauPrev = prev?.cdb_itau ?? null;
  const cdbSantanderCurrent = current?.cdb_santander ?? 0;
  const cdbSantanderPrev = prev?.cdb_santander ?? null;

  const payload: DashboardPayload = {
    year,
    kpis: {
      totalMonth: current?.total ?? 0,
      cdbMonth: cdbCurrent,
      fiisMonth: current?.fiis ?? 0,
      cdbItauMonth: cdbItauCurrent,
      cdbSantanderMonth: cdbSantanderCurrent,
      momTotalPct: prev && prev.total > 0 && current ? ((current.total - prev.total) / prev.total) * 100 : null,
      momCdbPct: cdbPrev > 0 ? ((cdbCurrent - cdbPrev) / cdbPrev) * 100 : null,
      momFiisPct: prev && prev.fiis > 0 && current ? ((current.fiis - prev.fiis) / prev.fiis) * 100 : null,
      momCdbItauPct:
        cdbItauPrev !== null && cdbItauPrev > 0
          ? ((cdbItauCurrent - cdbItauPrev) / cdbItauPrev) * 100
          : null,
      momCdbSantanderPct:
        cdbSantanderPrev !== null && cdbSantanderPrev > 0
          ? ((cdbSantanderCurrent - cdbSantanderPrev) / cdbSantanderPrev) * 100
          : null,
      momCdbItauValue: cdbItauPrev !== null ? cdbItauCurrent - cdbItauPrev : null,
      momCdbSantanderValue:
        cdbSantanderPrev !== null ? cdbSantanderCurrent - cdbSantanderPrev : null,
      ytd: monthlySeries.reduce((acc, m) => acc + m.total, 0),
    },
    monthlySeries,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
