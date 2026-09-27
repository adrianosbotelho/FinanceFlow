// Mesma rota de app/api/dashboard/daily-income/route.ts do desktop, adaptada ao cliente Supabase do mobile.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildBalanceContexts } from "@/lib/finance/balance-history";
import { buildDailyIncome } from "@/lib/finance/daily-income";
import { asOfDateForEntry, parseIsoDate } from "@/lib/finance/month-pace";
import { DailyIncomePayload } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type InvestmentRow = {
  id: string;
  type: string;
  institution: string;
  name: string;
  amount_invested: number | string | null;
  start_date: string | null;
};

function isMissingTableError(error: { message?: string; code?: string } | null, table: string): boolean {
  if (!error) return false;
  return error.code === "42P01" || Boolean(error.message?.includes(table));
}

function getSaoPauloDateISO(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

// Mesmo rótulo dos CDBs na tabela do Dashboard.
function buildInvestmentLabel(inv: { institution: string; name: string }): string {
  return inv.name || `CDB ${inv.institution}`;
}

export async function GET(req: NextRequest) {
  const today = parseIsoDate(getSaoPauloDateISO());
  const yearParam = Number(req.nextUrl.searchParams.get("year") ?? today.getFullYear());
  if (!Number.isInteger(yearParam) || yearParam < 2000 || yearParam > today.getFullYear()) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  // Todas as competências: o saldo de um mês é reconstruído a partir do saldo atual.
  const [investmentsRes, returnsRes, cashEventsRes, revisionsRes] = await Promise.all([
    supabase.from("investments").select("id,type,institution,name,amount_invested,start_date"),
    supabase.from("monthly_returns").select("investment_id,year,month,income_value"),
    supabase.from("investment_cash_events").select("investment_id,year,month,type,amount"),
    // Revisões do mês corrente: dizem até que dia cada investimento tem dado.
    supabase
      .from("monthly_return_revisions")
      .select("investment_id,created_at")
      .eq("year", today.getFullYear())
      .eq("month", today.getMonth() + 1),
  ]);
  if (revisionsRes.error) {
    console.warn("[FinanceFlow] Revisões indisponíveis para o ganho por dia útil:", revisionsRes.error.message);
  }
  const lastAsOfById = new Map<string, Date>();
  for (const row of (revisionsRes.data ?? []) as Array<{ investment_id: string; created_at: string }>) {
    const asOf = asOfDateForEntry(row.created_at);
    const current = lastAsOfById.get(row.investment_id);
    if (!current || asOf.getTime() > current.getTime()) lastAsOfById.set(row.investment_id, asOf);
  }
  if (investmentsRes.error || returnsRes.error) {
    console.error(investmentsRes.error ?? returnsRes.error);
    return NextResponse.json({ error: "Erro ao carregar o ganho por dia útil." }, { status: 500 });
  }
  if (cashEventsRes.error && !isMissingTableError(cashEventsRes.error, "investment_cash_events")) {
    console.error(cashEventsRes.error);
    return NextResponse.json({ error: "Erro ao carregar aportes e resgates." }, { status: 500 });
  }

  const investments = (investmentsRes.data ?? []) as InvestmentRow[];
  const contexts = buildBalanceContexts(investments, returnsRes.data ?? [], cashEventsRes.data ?? []);
  const payload: DailyIncomePayload = buildDailyIncome({
    contexts,
    labelById: new Map(investments.map((inv) => [inv.id, buildInvestmentLabel(inv)])),
    startDateById: new Map(investments.map((inv) => [inv.id, inv.start_date])),
    lastAsOfById,
    year: yearParam,
    today,
  });
  return NextResponse.json(payload);
}
