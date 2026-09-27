// Metas: quanto o saldo consegue render no mês com a taxa contratada e como distribuir o aporte
// mensal entre as metas anuais. Funções puras (usadas na rota de Metas e na tela).

/** Taxa do mês para X% do CDI em N dias úteis (CDI anual base 252). */
export function monthlyRateForCdi(cdiAnnualPercent: number, percentOfCdi: number, businessDays: number): number {
  if (cdiAnnualPercent <= 0 || percentOfCdi <= 0 || businessDays <= 0) return 0;
  const cdiDaily = Math.pow(1 + cdiAnnualPercent / 100, 1 / 252) - 1;
  return Math.pow(1 + cdiDaily * (percentOfCdi / 100), businessDays) - 1;
}

/** Renda possível no mês: saldo × taxa do mês na taxa contratada, sem novos aportes. */
export function possibleMonthlyIncome(input: {
  balance: number;
  cdiAnnualPercent: number;
  percentOfCdi: number;
  businessDays: number;
}): number {
  return Math.max(0, input.balance) * monthlyRateForCdi(input.cdiAnnualPercent, input.percentOfCdi, input.businessDays);
}

/** Saldo necessário para uma meta mensal render sozinha, na taxa contratada. */
export function balanceForMonthlyIncome(input: {
  target: number;
  cdiAnnualPercent: number;
  percentOfCdi: number;
  businessDays: number;
}): number | null {
  const rate = monthlyRateForCdi(input.cdiAnnualPercent, input.percentOfCdi, input.businessDays);
  return rate > 0 ? input.target / rate : null;
}

export type ContributionPlanInput = {
  id: string;
  /** Aporte mensal necessário para a meta anual (0 se já atingida ou sem meta). */
  need: number;
  /** Aporte médio recente (mês). */
  current: number;
  /** Folga no FGC da instituição, distribuída pelos meses restantes. */
  fgcHeadroom: number;
};

export type ContributionPlanItem = ContributionPlanInput & {
  suggested: number;
  /** Limitado pela folga do FGC. */
  cappedByFgc: boolean;
};

export type ContributionPlan = {
  items: ContributionPlanItem[];
  budget: number;
  totalNeed: number;
  allocated: number;
  /** Quanto falta no orçamento para cobrir todas as metas. */
  shortfall: number;
  /** Orçamento que sobra depois de cobrir as metas. */
  leftover: number;
};

/**
 * Distribui o orçamento mensal pelas metas: cobre o necessário de cada uma; se não houver
 * orçamento para todas, reparte proporcionalmente ao necessário. Nenhum investimento recebe mais
 * do que a folga mensal do FGC (folga ÷ meses restantes); o excedente volta para os demais.
 */
export function buildContributionPlan(
  inputs: ContributionPlanInput[],
  budget: number,
  monthsRemaining: number,
): ContributionPlan {
  const months = Math.max(1, monthsRemaining);
  const caps = new Map(inputs.map((item) => [item.id, Math.max(0, item.fgcHeadroom) / months]));
  const wants = new Map(inputs.map((item) => [item.id, Math.max(0, item.need)]));
  const suggested = new Map(inputs.map((item) => [item.id, 0]));
  let remaining = Math.max(0, budget);

  // Rodadas: reparte o que sobra entre quem ainda precisa e tem folga.
  for (let round = 0; round < inputs.length + 1 && remaining > 0.005; round += 1) {
    const open = inputs.filter((item) => {
      const got = suggested.get(item.id) ?? 0;
      return got < (wants.get(item.id) ?? 0) - 0.005 && got < (caps.get(item.id) ?? 0) - 0.005;
    });
    if (open.length === 0) break;
    const totalMissing = open.reduce(
      (acc, item) => acc + Math.min(wants.get(item.id)! - suggested.get(item.id)!, caps.get(item.id)! - suggested.get(item.id)!),
      0,
    );
    const pool = Math.min(remaining, totalMissing);
    let spent = 0;
    for (const item of open) {
      const got = suggested.get(item.id)!;
      const room = Math.min(wants.get(item.id)! - got, caps.get(item.id)! - got);
      const share = totalMissing > 0 ? (room / totalMissing) * pool : 0;
      suggested.set(item.id, got + share);
      spent += share;
    }
    remaining -= spent;
  }

  const totalNeed = inputs.reduce((acc, item) => acc + Math.max(0, item.need), 0);
  const items = inputs.map((item) => {
    const value = suggested.get(item.id) ?? 0;
    return {
      ...item,
      suggested: value,
      cappedByFgc: item.need > (caps.get(item.id) ?? 0) + 0.005,
    };
  });
  const allocated = items.reduce((acc, item) => acc + item.suggested, 0);
  return {
    items,
    budget: Math.max(0, budget),
    totalNeed,
    allocated,
    shortfall: Math.max(0, totalNeed - Math.max(0, budget)),
    leftover: Math.max(0, Math.max(0, budget) - allocated),
  };
}
