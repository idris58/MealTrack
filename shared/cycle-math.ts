import { allocateIntegerBalances } from "./settlement-math";

export type CycleMathMember = {
  id: string;
  name: string;
};

export type CycleMathDeposit = { memberId: string; amount: number };
export type CycleMathExpense = { amount: number; type: "meal" | "utility" };
export type CycleMathMealLog = { memberId: string; count: number };
export type SettlementSnapshotEntry = { memberId: string; balance: number; deposited: number };

export type CycleMathMemberResult<TMember extends CycleMathMember> = TMember & {
  deposit: number;
  mealsEaten: number;
  mealCost: number;
  fixedCost: number;
  totalCost: number;
  balance: number;
};

export interface CycleMathResult<TMember extends CycleMathMember> {
  stats: {
    totalDeposits: number;
    totalMealExpenses: number;
    totalFixedExpenses: number;
    totalMealsConsumed: number;
    currentMealRate: number;
    fixedCostPerMember: number;
    remainingCash: number;
  };
  members: Array<CycleMathMemberResult<TMember>>;
}

export function computeMemberCosts(mealsEaten: number, mealRate: number, fixedCost: number) {
  const mealCost = mealsEaten * mealRate;
  return { mealCost, fixedCost, totalCost: mealCost + fixedCost };
}

/** Keep roster ordering, and include archived members only when this cycle has their history. */
export function selectCycleMembers<TMember extends CycleMathMember & { deletedAt?: string | null }>(
  roster: TMember[],
  historyMemberIds: Iterable<string>,
): TMember[] {
  const history = new Set(historyMemberIds);
  return [
    ...roster.filter((member) => !member.deletedAt),
    ...roster.filter((member) => Boolean(member.deletedAt) && history.has(member.id)),
  ];
}

/** Shared cost and balance calculation used by cycle details, reports, and shared views. */
export function computeCycleMath<TMember extends CycleMathMember>({
  members,
  deposits,
  expenses,
  mealLogs,
  settlementSnapshot,
  finalized = false,
}: {
  members: TMember[];
  deposits: CycleMathDeposit[];
  expenses: CycleMathExpense[];
  mealLogs: CycleMathMealLog[];
  settlementSnapshot?: SettlementSnapshotEntry[] | null;
  finalized?: boolean;
}): CycleMathResult<TMember> {
  const memberIds = new Set(members.map((member) => member.id));
  const cycleDeposits = deposits.filter((deposit) => memberIds.has(deposit.memberId));
  const cycleMealLogs = mealLogs.filter((log) => memberIds.has(log.memberId));
  const depositByMember = new Map<string, number>();
  const mealsByMember = new Map<string, number>();

  for (const deposit of cycleDeposits) {
    depositByMember.set(deposit.memberId, (depositByMember.get(deposit.memberId) ?? 0) + deposit.amount);
  }
  for (const log of cycleMealLogs) {
    mealsByMember.set(log.memberId, (mealsByMember.get(log.memberId) ?? 0) + log.count);
  }

  const totalMealExpenses = expenses
    .filter((expense) => expense.type === "meal")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const totalFixedExpenses = expenses
    .filter((expense) => expense.type === "utility")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const totalMealsConsumed = cycleMealLogs.reduce((sum, log) => sum + log.count, 0);
  const totalDeposits = cycleDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
  const currentMealRate = totalMealsConsumed > 0 ? totalMealExpenses / totalMealsConsumed : 0;
  const fixedCostPerMember = members.length > 0 ? totalFixedExpenses / members.length : 0;
  const remainingCash = totalDeposits - totalMealExpenses - totalFixedExpenses;

  const rawMembers = members.map((member) => {
    const deposit = depositByMember.get(member.id) ?? 0;
    const mealsEaten = mealsByMember.get(member.id) ?? 0;
    const { mealCost, fixedCost, totalCost } = computeMemberCosts(mealsEaten, currentMealRate, fixedCostPerMember);
    return {
      ...member,
      deposit,
      mealsEaten,
      mealCost,
      fixedCost,
      totalCost,
      balance: deposit - totalCost,
    };
  });

  const snapshotByMember = new Map((settlementSnapshot ?? []).map((entry) => [entry.memberId, entry]));
  const hasCompleteSnapshot = rawMembers.length > 0 && rawMembers.every((member) => snapshotByMember.has(member.id));
  const allocatedBalances = finalized && !hasCompleteSnapshot && rawMembers.length > 0
    ? allocateIntegerBalances(rawMembers, Math.round(remainingCash))
    : null;
  const calculatedMembers = rawMembers.map((member) => {
    const frozen = snapshotByMember.get(member.id);
    if (finalized && frozen) {
      return { ...member, balance: frozen.balance + member.deposit - frozen.deposited };
    }
    return allocatedBalances
      ? { ...member, balance: allocatedBalances.get(member.id) ?? member.balance }
      : member;
  });

  return {
    stats: {
      totalDeposits,
      totalMealExpenses,
      totalFixedExpenses,
      totalMealsConsumed,
      currentMealRate,
      fixedCostPerMember,
      remainingCash,
    },
    members: calculatedMembers,
  };
}
