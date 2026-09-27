import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { countBusinessDaysInMonth } from "../../../../lib/business-days";
import { loadMonthPace } from "../../../../lib/month-pace";
import {
  BalanceCashEventRow,
  BalanceContext,
  BalanceInvestmentRow,
  BalanceReturnRow,
  buildBalanceContexts,
  closingBalance,
  previousYm,
  ym,
} from "../../../../lib/balance-history";
import { buildAnnualGoalSummary, monthlyGoalStatus } from "../../../../lib/goals-math";
import {
  GoalsAnnualSummary,
  GoalsBalancePoint,
  GoalsInvestmentRow,
  GoalsMonthlyHistoryPoint,
  GoalsMonthlySummary,
  GoalsOverviewPayload,
} from "../../../../types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Janela (meses fechados) para o ritmo recente de aportes.
const RECENT_CONTRIBUTION_MONTHS = 3;

type MonthlyGoalRow = { investment_id: string; month: number; monthly_target: number | string | null };
type AnnualGoalRow = { investment_id: string; annual_target: number | string | null };

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const [year, month] = todayIso.split("-").map(Number);
  const currentYm = ym(year, month);
  const warnings: string[] = [];

  const [investmentsRes, returnsRes, eventsRes, monthlyGoalsRes, annualGoalsRes] = await Promise.all([
    supabase.from("investments").select("id,type,institution,name,amount_invested,cdi_rate"),
    supabase.from("monthly_returns").select("investment_id,year,month,income_value"),
    supabase.from("investment_cash_events").select("investment_id,year,month,type,amount"),
    supabase.from("investment_goals_monthly").select("investment_id,month,monthly_target").eq("year", year),
    supabase.from("investment_goals_annual").select("investment_id,annual_target").eq("year", year),
  ]);
  const failed = [investmentsRes, returnsRes, eventsRes, monthlyGoalsRes, annualGoalsRes].find((res) => res.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const contexts: BalanceContext[] = buildBalanceContexts(
    (investmentsRes.data ?? []) as BalanceInvestmentRow[],
    (returnsRes.data ?? []) as BalanceReturnRow[],
    (eventsRes.data ?? []) as BalanceCashEventRow[],
  ).filter((ctx) => ctx.balanceNow > 0);

  const monthlyGoals = new Map<string, number>();
  for (const row of (monthlyGoalsRes.data ?? []) as MonthlyGoalRow[]) {
    const target = toNumber(row.monthly_target);
    if (target > 0) monthlyGoals.set(`${row.investment_id}|${Number(row.month)}`, target);
  }
  const annualGoals = new Map<string, number>();
  for (const row of (annualGoalsRes.data ?? []) as AnnualGoalRow[]) {
    const target = toNumber(row.annual_target);
    if (target > 0) annualGoals.set(row.investment_id, target);
  }
  const goalFor = (id: string, m: number): number | null => monthlyGoals.get(`${id}|${m}`) ?? null;

  // Ritmo do mês em andamento (data-base D−1, feriados, ganho diário das revisões).
  const paceById = new Map<string, { projected: number; dailyRate: number; remainingBusinessDays: number }>();
  let asOfDate: string | null = null;
  let businessDaysRemaining = 0;
  try {
    const { pace, warnings: paceWarnings } = await loadMonthPace(year, month, todayIso);
    warnings.push(...paceWarnings);
    asOfDate = pace.asOfDate;
    businessDaysRemaining = pace.remainingBusinessDays;
    for (const item of pace.investments) {
      paceById.set(item.investmentId, {
        projected: item.projected,
        dailyRate: item.dailyRate,
        remainingBusinessDays: item.remainingBusinessDays,
      });
    }
  } catch (err) {
    warnings.push(`Projeção do mês indisponível: ${err instanceof Error ? err.message : "erro no ritmo do mês"}.`);
  }

  let businessDaysAfterMonth = 0;
  for (let m = month + 1; m <= 12; m += 1) businessDaysAfterMonth += countBusinessDaysInMonth(year, m);
  const contributionMonths = 12 - month + 1;

  const recentYms: number[] = [];
  for (let key = previousYm(currentYm); recentYms.length < RECENT_CONTRIBUTION_MONTHS; key = previousYm(key)) {
    recentYms.push(key);
  }

  const rows: GoalsInvestmentRow[] = contexts.map((ctx) => {
    const realized = ctx.incomeByYm.get(currentYm) ?? 0;
    const pace = paceById.get(ctx.id);
    const projected = pace?.projected ?? realized;
    const dailyRate = pace?.dailyRate ?? 0;
    const remainingBusinessDays = pace?.remainingBusinessDays ?? 0;

    const monthlyTarget = goalFor(ctx.id, month);
    const monthly: GoalsMonthlySummary = {
      target: monthlyTarget,
      realized,
      projected,
      status: monthlyGoalStatus(monthlyTarget, realized, projected),
      neededPerBusinessDay:
        monthlyTarget !== null && remainingBusinessDays > 0
          ? Math.max(0, monthlyTarget - realized) / remainingBusinessDays
          : null,
    };

    const recentMonthlyContribution =
      recentYms.reduce((acc, key) => acc + (ctx.flowByYm.get(key) ?? 0), 0) / RECENT_CONTRIBUTION_MONTHS;
    const annual = buildAnnualGoalSummary({
      target: annualGoals.get(ctx.id) ?? null,
      balance: ctx.balanceNow,
      expectedIncomeUntilYearEnd: dailyRate * (remainingBusinessDays + businessDaysAfterMonth),
      recentMonthlyContribution,
      monthlyIncome: projected,
      contributionMonths,
      year,
      month,
    });

    let monthlyHits = 0;
    let monthlyGoalMonths = 0;
    for (let m = 1; m < month; m += 1) {
      const target = goalFor(ctx.id, m);
      if (target === null) continue;
      monthlyGoalMonths += 1;
      if ((ctx.incomeByYm.get(ym(year, m)) ?? 0) >= target) monthlyHits += 1;
    }

    return {
      investmentId: ctx.id,
      label: ctx.label,
      institution: ctx.institution,
      monthly,
      annual,
      monthlyHits,
      monthlyGoalMonths,
    };
  });

  // Totais da carteira.
  const withMonthlyGoal = rows.filter((row) => row.monthly.target !== null);
  const monthlyTarget = withMonthlyGoal.length
    ? withMonthlyGoal.reduce((acc, row) => acc + (row.monthly.target ?? 0), 0)
    : null;
  const monthlyRealized = rows.reduce((acc, row) => acc + row.monthly.realized, 0);
  const monthlyProjected = rows.reduce((acc, row) => acc + row.monthly.projected, 0);
  const monthly: GoalsMonthlySummary = {
    target: monthlyTarget,
    realized: monthlyRealized,
    projected: monthlyProjected,
    status: monthlyGoalStatus(monthlyTarget, monthlyRealized, monthlyProjected),
    neededPerBusinessDay:
      monthlyTarget !== null && businessDaysRemaining > 0
        ? Math.max(0, monthlyTarget - monthlyRealized) / businessDaysRemaining
        : null,
  };

  const withAnnualGoal = rows.filter((row) => row.annual.target !== null);
  const annual: GoalsAnnualSummary = withAnnualGoal.length
    ? (() => {
        const target = withAnnualGoal.reduce((acc, row) => acc + (row.annual.target ?? 0), 0);
        const balance = withAnnualGoal.reduce((acc, row) => acc + row.annual.balance, 0);
        const summary = buildAnnualGoalSummary({
          target,
          balance,
          expectedIncomeUntilYearEnd: withAnnualGoal.reduce((acc, row) => acc + row.annual.expectedIncomeUntilYearEnd, 0),
          recentMonthlyContribution: withAnnualGoal.reduce((acc, row) => acc + row.annual.recentMonthlyContribution, 0),
          monthlyIncome: withAnnualGoal.reduce((acc, row) => acc + row.monthly.projected, 0),
          contributionMonths,
          year,
          month,
        });
        // O aporte necessário total é a soma do necessário em cada investimento (quem já passou da meta não compensa os demais).
        return {
          ...summary,
          requiredMonthlyContribution: withAnnualGoal.reduce(
            (acc, row) => acc + (row.annual.requiredMonthlyContribution ?? 0),
            0,
          ),
        };
      })()
    : buildAnnualGoalSummary({
        target: null,
        balance: rows.reduce((acc, row) => acc + row.annual.balance, 0),
        expectedIncomeUntilYearEnd: 0,
        recentMonthlyContribution: 0,
        monthlyIncome: 0,
        contributionMonths,
        year,
        month,
      });

  // Histórico da meta mensal no ano (total da carteira; realizado dos investimentos com meta no mês).
  const monthlyHistory: GoalsMonthlyHistoryPoint[] = [];
  for (let m = 1; m <= month; m += 1) {
    const withGoal = contexts.filter((ctx) => goalFor(ctx.id, m) !== null);
    const target = withGoal.length ? withGoal.reduce((acc, ctx) => acc + (goalFor(ctx.id, m) ?? 0), 0) : null;
    const scope = withGoal.length ? withGoal : contexts;
    const realized = scope.reduce((acc, ctx) => acc + (ctx.incomeByYm.get(ym(year, m)) ?? 0), 0);
    const inProgress = m === month;
    monthlyHistory.push({
      month: m,
      status: inProgress ? "in_progress" : "closed",
      target,
      realized,
      projected: inProgress
        ? scope.reduce((acc, ctx) => acc + (paceById.get(ctx.id)?.projected ?? ctx.incomeByYm.get(currentYm) ?? 0), 0)
        : null,
      hit: inProgress || target === null ? null : realized >= target,
    });
  }

  // Saldo no fim de cada mês do ano (mesma reconstrução da página de Performance).
  const balanceHistory: GoalsBalancePoint[] = [];
  for (let m = 1; m <= month; m += 1) {
    const byInvestment: Record<string, number> = {};
    for (const ctx of contexts) byInvestment[ctx.id] = closingBalance(ctx, ym(year, m));
    balanceHistory.push({
      month: m,
      total: Object.values(byInvestment).reduce((acc, value) => acc + value, 0),
      byInvestment,
    });
  }

  const payload: GoalsOverviewPayload = {
    year,
    month,
    asOfDate,
    businessDaysRemaining,
    contributionMonthsRemaining: contributionMonths,
    monthly,
    annual,
    investments: rows,
    monthlyHistory,
    balanceHistory,
    annualTargets: Object.fromEntries(Array.from(annualGoals.entries())),
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
