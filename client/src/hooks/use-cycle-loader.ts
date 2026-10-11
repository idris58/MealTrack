import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import type { CycleDeposit, Expense, MealLog } from '@/lib/meal-types';

type CycleRows = {
  deposits: CycleDeposit[];
  expenses: Expense[];
  mealLogs: MealLog[];
};

type Options = {
  enabled: boolean;
  isLoaded: (cycleId: string) => boolean;
  fetchRows: (cycleId: string) => Promise<CycleRows | null>;
  setDeposits: Dispatch<SetStateAction<CycleDeposit[]>>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>;
  setLoadedCycleIds: Dispatch<SetStateAction<Set<string>>>;
};

/** Loads one cycle's persisted rows without affecting global app loading state. */
export function useCycleLoader({ enabled, isLoaded, fetchRows, setDeposits, setExpenses, setMealLogs, setLoadedCycleIds }: Options) {
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});

  const loadCycleDetails = useCallback(async (cycleId: string, options: { force?: boolean } = {}) => {
    if (!enabled || loadingById[cycleId] || (!options.force && isLoaded(cycleId))) return;
    setLoadingById((previous) => ({ ...previous, [cycleId]: true }));
    setErrorById((previous) => ({ ...previous, [cycleId]: null }));
    try {
      const rows = await fetchRows(cycleId);
      if (!rows) return;
      setDeposits((previous) => [...previous.filter((item) => item.cycleId !== cycleId), ...rows.deposits]);
      setExpenses((previous) => [...previous.filter((item) => item.cycleId !== cycleId), ...rows.expenses]);
      setMealLogs((previous) => [...previous.filter((item) => item.cycleId !== cycleId), ...rows.mealLogs]);
      setLoadedCycleIds((previous) => new Set(previous).add(cycleId));
    } catch (caught) {
      console.error('Error loading cycle details:', caught);
      setErrorById((previous) => ({
        ...previous,
        [cycleId]: caught instanceof Error ? caught.message : 'Unable to load cycle details.',
      }));
    } finally {
      setLoadingById((previous) => ({ ...previous, [cycleId]: false }));
    }
  }, [enabled, fetchRows, isLoaded, loadingById, setDeposits, setExpenses, setLoadedCycleIds, setMealLogs]);

  return {
    loadCycleDetails,
    isLoading: (cycleId: string) => Boolean(loadingById[cycleId]),
    getError: (cycleId: string) => errorById[cycleId] ?? null,
    reset: () => {
      setLoadingById({});
      setErrorById({});
    },
  };
}
