import { allocateIntegerBalances } from "./settlement-math";

export type CycleMathMember = {
  id: string;
  name: string;
  createdAt?: string | null;
  deletedAt?: string | null;
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

function prorateFixedCosts<TMember extends CycleMathMember>(
  members: TMember[],
  totalFixedExpenses: number,
  cycleStartedAt?: string | null,
  cycleEndedAt?: string | null,
) {
  const equalShare = members.length > 0 ? totalFixedExpenses / members.length : 0;
  const cycleStart = cycleStartedAt ? new Date(cycleStartedAt).getTime() : Number.NaN;
  const cycleEnd = cycleEndedAt ? new Date(cycleEndedAt).getTime() : Number.NaN;
  if (!Number.isFinite(cycleStart) || !Number.isFinite(cycleEnd) || cycleEnd <= cycleStart) {
    return { perMember: new Map(members.map((member) => [member.id, equalShare])), average: equalShare };
  }

  const intervals = members.map((member) => {
    const joinedAt = member.createdAt ? new Date(member.createdAt).getTime() : cycleStart;
    const leftAt = member.deletedAt ? new Date(member.deletedAt).getTime() : cycleEnd;
    const start = Math.max(cycleStart, Number.isFinite(joinedAt) ? joinedAt : cycleStart);
    const end = Math.min(cycleEnd, Number.isFinite(leftAt) ? leftAt : cycleEnd);
    return { id: member.id, start, end };
  });

  const boundaries = Array.from(new Set([
    cycleStart,
    cycleEnd,
    ...intervals.flatMap(({ start, end }) => [start, end]),
  ])).sort((left, right) => left - right);
  const perMember = new Map(members.map((member) => [member.id, 0]));
  const cycleDuration = cycleEnd - cycleStart;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const duration = end - start;
    if (duration <= 0) continue;
    const midpoint = start + duration / 2;
    const activeMembers = intervals.filter((interval) => interval.start <= midpoint && midpoint < interval.end);
    if (activeMembers.length === 0) continue;
    const intervalCost = totalFixedExpenses * duration / cycleDuration / activeMembers.length;
    for (const member of activeMembers) {
      perMember.set(member.id, (perMember.get(member.id) ?? 0) + intervalCost);
    }
  }

  const allocatedTotal = Array.from(perMember.values()).reduce((sum, amount) => sum + amount, 0);
  return {
    perMember,
    average: members.length > 0 ? allocatedTotal / members.length : 0,
  };
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
  cycleStartedAt,
  cycleEndedAt,
}: {
  members: TMember[];
  deposits: CycleMathDeposit[];
  expenses: CycleMathExpense[];
  mealLogs: CycleMathMealLog[];
  settlementSnapshot?: SettlementSnapshotEntry[] | null;
  finalized?: boolean;
  cycleStartedAt?: string | null;
  cycleEndedAt?: string | null;
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
  const fixedCostAllocation = prorateFixedCosts(members, totalFixedExpenses, cycleStartedAt, cycleEndedAt);
  const fixedCostPerMember = fixedCostAllocation.average;
  const remainingCash = totalDeposits - totalMealExpenses - totalFixedExpenses;

  const rawMembers = members.map((member) => {
    const deposit = depositByMember.get(member.id) ?? 0;
    const mealsEaten = mealsByMember.get(member.id) ?? 0;
    const fixedCost = fixedCostAllocation.perMember.get(member.id) ?? 0;
    const { mealCost, totalCost } = computeMemberCosts(mealsEaten, currentMealRate, fixedCost);
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
  const snapshotDepositDeltas = hasCompleteSnapshot
    ? rawMembers.map((member) => ({
      memberId: member.id,
      amount: member.deposit - (snapshotByMember.get(member.id)?.deposited ?? 0),
    }))
    : [];
  const totalSnapshotDepositDelta = snapshotDepositDeltas.reduce((sum, delta) => sum + delta.amount, 0);
  const depositDeltaByMember = new Map(snapshotDepositDeltas.map((delta) => [delta.memberId, delta.amount]));
  // Reallocate the cycle's underlying costs so pending-cycle corrections affect
  // balances, while keeping post-close installments attached to their member.
  const settlementBaseMembers = hasCompleteSnapshot
    ? rawMembers.map((member) => ({
      ...member,
      balance: member.balance - (depositDeltaByMember.get(member.id) ?? 0),
    }))
    : rawMembers;
  const settlementBaseRemainingCash = remainingCash - totalSnapshotDepositDelta;
  const allocatedBalances = finalized && rawMembers.length > 0
    ? allocateIntegerBalances(settlementBaseMembers, Math.round(settlementBaseRemainingCash))
    : null;
  const calculatedMembers = rawMembers.map((member) => {
    const frozen = snapshotByMember.get(member.id);
    if (finalized && frozen && allocatedBalances) {
      const depositDelta = depositDeltaByMember.get(member.id) ?? 0;
      return { ...member, balance: (allocatedBalances.get(member.id) ?? frozen.balance) + depositDelta };
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
