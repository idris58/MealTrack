import { useMemo, useRef } from 'react';

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

type CycleRow = { cycleId: string };
type CachedCycleDetails = {
  cycle: Cycle;
  members: Member[];
  deposits: CycleDeposit[];
  expenses: Expense[];
  mealLogs: MealLog[];
  details: CycleDetails;
};

const EMPTY_ROWS: never[] = [];

function groupByCycle<T extends CycleRow>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.cycleId);
    if (current) current.push(row);
    else grouped.set(row.cycleId, [row]);
  }
  return grouped;
}

function sameRows<T>(previous: T[], current: T[]) {
  return previous.length === current.length && previous.every((row, index) => row === current[index]);
}

function sameMembers(previous: Member[], current: Member[]) {
  return previous.length === current.length && previous.every((member, index) => {
    const next = current[index];
    return member.id === next.id
      && member.name === next.name
      && member.avatar === next.avatar
      && member.profileId === next.profileId
      && member.archived === next.archived;
  });
}

/** Computes settlement-ready cycle details from the normalized local store. */
export function useCycleDetails({ cycles, loadedCycleIds, membersForCycle, deposits, expenses, mealLogs }: Options) {
  const cachedDetails = useRef(new Map<string, CachedCycleDetails>());

  const byId = useMemo(() => {
    const next: Record<string, CycleDetails> = {};
    const cyclesById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
    const depositsByCycle = groupByCycle(deposits);
    const expensesByCycle = groupByCycle(expenses);
    const logsByCycle = groupByCycle(mealLogs);

    for (const id of Array.from(loadedCycleIds)) {
      const cycle = cyclesById.get(id);
      if (!cycle) continue;

      const members = membersForCycle(id);
      const memberIds = new Set(members.map((member) => member.id));
      const cycleDeposits = (depositsByCycle.get(id) ?? EMPTY_ROWS)
        .filter((item) => memberIds.has(item.memberId));
      const cycleExpenses = expensesByCycle.get(id) ?? EMPTY_ROWS;
      const cycleLogs = (logsByCycle.get(id) ?? EMPTY_ROWS)
        .filter((item) => memberIds.has(item.memberId));
      const cached = cachedDetails.current.get(id);

      if (cached
        && cached.cycle === cycle
        && sameMembers(cached.members, members)
        && sameRows(cached.deposits, cycleDeposits)
        && sameRows(cached.expenses, cycleExpenses)
        && sameRows(cached.mealLogs, cycleLogs)) {
        next[id] = cached.details;
        continue;
      }

      const finalized = cycle.status === 'pending' || cycle.status === 'closed';
      const math = computeCycleMath({
        members,
        deposits: cycleDeposits,
        expenses: cycleExpenses,
        mealLogs: cycleLogs,
        finalized,
      });
      const pendingDepositMemberIds = new Set(
        cycleDeposits.filter((item) => item.id.startsWith('offline-')).map((item) => item.memberId),
      );
      const computedMembers = math.members.map((member) => ({
        ...member,
        hasPendingDeposit: pendingDepositMemberIds.has(member.id),
      }));
      const details = { cycle, stats: math.stats, members: computedMembers, expenses: cycleExpenses, mealLogs: cycleLogs, deposits: cycleDeposits };
      cachedDetails.current.set(id, { cycle, members, deposits: cycleDeposits, expenses: cycleExpenses, mealLogs: cycleLogs, details });
      next[id] = details;
    }
    for (const id of Array.from(cachedDetails.current.keys())) {
      if (!next[id]) cachedDetails.current.delete(id);
    }
    return next;
  }, [cycles, loadedCycleIds, deposits, expenses, mealLogs, membersForCycle]);

  return { cycleDetailsById: byId, getCycleDetails: (cycleId: string) => byId[cycleId] ?? null };
}
