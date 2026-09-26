import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { countBusinessDaysInMonth } from "../../../../lib/business-days";
import { loadMonthPace } from "../../../../lib/month-pace";
import {
  InvestmentType,
  PerformanceHistoryGap,
  PerformanceHistoryInvestment,
  PerformanceHistoryMonth,
  PerformanceHistoryPayload,
} from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type InvestmentRow = {
  id: string;
  type: InvestmentType;
  institution: string;
  name: string;
  amount_invested: number | string | null;
};

type ReturnRow = { investment_id: string; year: number; month: number; income_value: number | string | null };

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ym(year: number, month: number): number {
  return year * 100 + month;
}

function nextYm(value: number): number {
  const year = Math.floor(value / 100);
  const month = value % 100;
  return month === 12 ? ym(year + 1, 1) : value + 1;
}

function getSaoPauloDateISO(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

export async function GET() {
  const todayIso = getSaoPauloDateISO();
  const [currentYear, currentMonth] = todayIso.split("-").map(Number);
  const currentYm = ym(currentYear, currentMonth);
  const warnings: string[] = [];

  const [investmentsRes, returnsRes] = await Promise.all([
    supabase.from("investments").select("id,type,institution,name,amount_invested"),
    supabase.from("monthly_returns").select("investment_id,year,month,income_value"),
  ]);
  if (investmentsRes.error || returnsRes.error) {
    return NextResponse.json(
      { error: (investmentsRes.error ?? returnsRes.error)?.message ?? "Erro ao carregar o histórico." },
      { status: 500 },
    );
  }

  const investmentRows = (investmentsRes.data ?? []) as InvestmentRow[];
  const returns = (returnsRes.data ?? []) as ReturnRow[];

  const valueByYm = new Map<number, Record<string, number>>();
  const incomeYmsByInvestment = new Map<string, number[]>();
  for (const row of returns) {
    const key = ym(Number(row.year), Number(row.month));
    if (key > currentYm) continue;
    const value = toNumber(row.income_value);
    const bucket = valueByYm.get(key) ?? {};
    bucket[row.investment_id] = (bucket[row.investment_id] ?? 0) + value;
    valueByYm.set(key, bucket);
    if (value > 0) {
      const list = incomeYmsByInvestment.get(row.investment_id) ?? [];
      list.push(key);
      incomeYmsByInvestment.set(row.investment_id, list);
    }
  }

  // Projeção do mês em andamento (data-base D−1, feriados, ganho diário das revisões).
  let projectedByInvestment: Record<string, number> | null = null;
  let asOfDate: string | null = null;
  let currentMonthBusinessDays = Math.max(1, countBusinessDaysInMonth(currentYear, currentMonth));
  try {
    const { pace, warnings: paceWarnings } = await loadMonthPace(currentYear, currentMonth, todayIso);
    warnings.push(...paceWarnings);
    projectedByInvestment = Object.fromEntries(pace.investments.map((item) => [item.investmentId, item.projected]));
    asOfDate = pace.asOfDate;
    currentMonthBusinessDays = pace.totalBusinessDays;
  } catch (err) {
    warnings.push(
      `Projeção do mês indisponível: ${err instanceof Error ? err.message : "erro ao calcular o ritmo do mês"}.`,
    );
  }

  let remainingYearBusinessDays = 0;
  for (let month = currentMonth + 1; month <= 12; month += 1) {
    remainingYearBusinessDays += countBusinessDaysInMonth(currentYear, month);
  }

  // Meses contínuos do primeiro lançamento até o mês atual (meses sem lançamento ficam vazios).
  const firstYm = Array.from(valueByYm.keys()).sort((a, b) => a - b)[0] ?? currentYm;
  const months: PerformanceHistoryMonth[] = [];
  for (let key = firstYm; key <= currentYm; key = nextYm(key)) {
    const inProgress = key === currentYm;
    months.push({
      year: Math.floor(key / 100),
      month: key % 100,
      status: inProgress ? "in_progress" : "closed",
      byInvestment: valueByYm.get(key) ?? {},
      projectedByInvestment: inProgress ? projectedByInvestment : null,
    });
  }

  // Ordena pela estreia; investimento sem posição nem renda recente fica marcado como inativo.
  const firstIncome = (id: string) => Math.min(...(incomeYmsByInvestment.get(id) ?? [Number.MAX_SAFE_INTEGER]));
  const investments: PerformanceHistoryInvestment[] = investmentRows
    .filter((inv) => (incomeYmsByInvestment.get(inv.id) ?? []).length > 0)
    .sort((a, b) => firstIncome(a.id) - firstIncome(b.id))
    .map((inv) => ({
      id: inv.id,
      label: inv.name || `${inv.type} ${inv.institution}`,
      type: inv.type,
      institution: inv.institution,
      active: toNumber(inv.amount_invested) > 0,
    }));

  // Lacunas: meses fechados sem renda entre a primeira e a última renda de um investimento.
  const gaps: PerformanceHistoryGap[] = [];
  for (const inv of investments) {
    const incomeYms = (incomeYmsByInvestment.get(inv.id) ?? []).sort((a, b) => a - b);
    if (incomeYms.length < 2) continue;
    const withIncome = new Set(incomeYms);
    const missing: Array<{ year: number; month: number }> = [];
    for (let key = incomeYms[0]; key < incomeYms[incomeYms.length - 1] && key < currentYm; key = nextYm(key)) {
      if (!withIncome.has(key)) missing.push({ year: Math.floor(key / 100), month: key % 100 });
    }
    if (missing.length > 0) gaps.push({ investmentId: inv.id, label: inv.label, months: missing });
  }

  const payload: PerformanceHistoryPayload = {
    currentYear,
    currentMonth,
    asOfDate,
    investments,
    months,
    currentMonthBusinessDays,
    remainingYearBusinessDays,
    gaps,
    warnings,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
