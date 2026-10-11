import { useCallback, useMemo } from 'react';

import { allocateIntegerBalances } from '@/lib/settlement-math';
import type { Cycle, CycleDeposit, CycleDetails, Expense, MealLog, Member } from '@/lib/meal-types';

type Options = {
  cycles: Cycle[];
  loadedCycleIds: Set<string>;
  membersForCycle: (cycleId: string) => Member[];
  deposits: CycleDeposit[];
  expenses: Expense[];
  mealLogs: MealLog[];
};

/** Computes settlement-ready cycle details from the normalized local store. */
export function useCycleDetails({ cycles, loadedCycleIds, membersForCycle, deposits, expenses, mealLogs }: Options) {
  const build = useCallback((cycleId: string): CycleDetails | null => {
    const cycle = cycles.find((item) => item.id === cycleId);
    if (!cycle) return null;
    const members = membersForCycle(cycleId);
    const memberIds = new Set(members.map((member) => member.id));
    const cycleDeposits = deposits.filter((item) => item.cycleId === cycleId && memberIds.has(item.memberId));
    const cycleExpenses = expenses.filter((item) => item.cycleId === cycleId);
    const cycleLogs = mealLogs.filter((item) => item.cycleId === cycleId && memberIds.has(item.memberId));
    const depositByMember = new Map<string, number>();
    for (const deposit of cycleDeposits) depositByMember.set(deposit.memberId, (depositByMember.get(deposit.memberId) ?? 0) + deposit.amount);
    const totalMealExpenses = cycleExpenses.filter((item) => item.type === 'meal').reduce((total, item) => total + item.amount, 0);
    const totalFixedExpenses = cycleExpenses.filter((item) => item.type === 'fixed').reduce((total, item) => total + item.amount, 0);
    const totalMealsConsumed = cycleLogs.reduce((total, item) => total + item.count, 0);
    const totalDeposits = cycleDeposits.reduce((total, item) => total + item.amount, 0);
    const mealRate = totalMealsConsumed ? totalMealExpenses / totalMealsConsumed : 0;
    const fixedShare = members.length ? totalFixedExpenses / members.length : 0;
    const remainingCash = totalDeposits - totalMealExpenses - totalFixedExpenses;
    const raw = members.map((member) => {
      const mealsEaten = cycleLogs.filter((log) => log.memberId === member.id).reduce((total, log) => total + log.count, 0);
      const deposit = depositByMember.get(member.id) ?? 0;
      const mealCost = mealsEaten * mealRate;
      const fixedCost = fixedShare;
      return { ...member, deposit, mealsEaten, hasPendingDeposit: cycleDeposits.some((item) => item.memberId === member.id && item.id.startsWith('offline-')), mealCost, fixedCost, totalCost: mealCost + fixedCost, balance: deposit - mealCost - fixedCost };
    });
    const finalized = cycle.status === 'pending' || cycle.status === 'closed';
    const computedMembers = finalized && raw.length
      ? raw.map((member) => ({ ...member, balance: allocateIntegerBalances(raw, Math.round(remainingCash)).get(member.id) ?? member.balance }))
      : raw;
    return { cycle, stats: { totalDeposits, totalMealExpenses, totalFixedExpenses, totalMealsConsumed, currentMealRate: mealRate, fixedCostPerMember: fixedShare, remainingCash }, members: computedMembers, expenses: cycleExpenses, mealLogs: cycleLogs, deposits: cycleDeposits };
  }, [cycles, deposits, expenses, mealLogs, membersForCycle]);

  const byId = useMemo(() => {
    const next: Record<string, CycleDetails> = {};
    for (const id of Array.from(loadedCycleIds)) {
      const details = build(id);
      if (details) next[id] = details;
    }
    return next;
  }, [build, loadedCycleIds]);

  return { cycleDetailsById: byId, getCycleDetails: (cycleId: string) => byId[cycleId] ?? null };
}
