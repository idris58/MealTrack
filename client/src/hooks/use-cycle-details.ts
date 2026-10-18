import { useCallback, useMemo } from 'react';

import { computeCycleMath } from '@shared/cycle-math';
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
    const finalized = cycle.status === 'pending' || cycle.status === 'closed';
    const math = computeCycleMath({
      members,
      deposits: cycleDeposits,
      expenses: cycleExpenses,
      mealLogs: cycleLogs,
      finalized,
    });
    const computedMembers = math.members.map((member) => ({
      ...member,
      hasPendingDeposit: cycleDeposits.some((item) => item.memberId === member.id && item.id.startsWith('offline-')),
    }));
    return { cycle, stats: math.stats, members: computedMembers, expenses: cycleExpenses, mealLogs: cycleLogs, deposits: cycleDeposits };
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
