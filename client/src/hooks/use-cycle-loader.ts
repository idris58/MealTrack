import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

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
  const latest = useRef({ enabled, isLoaded, fetchRows, setDeposits, setExpenses, setMealLogs, setLoadedCycleIds, loadingById, errorById });
  latest.current = { enabled, isLoaded, fetchRows, setDeposits, setExpenses, setMealLogs, setLoadedCycleIds, loadingById, errorById };

  const loadCycleDetails = useCallback(async (cycleId: string, options: { force?: boolean } = {}) => {
    const current = latest.current;
    if (!current.enabled || current.loadingById[cycleId] || (!options.force && current.isLoaded(cycleId))) return;
    setLoadingById((previous) => ({ ...previous, [cycleId]: true }));
    setErrorById((previous) => ({ ...previous, [cycleId]: null }));
    try {
      const rows = await latest.current.fetchRows(cycleId);
      if (!rows) return;
      latest.current.setDeposits((previous) => [...previous.filter((item) => item.cycleId !== cycleId), ...rows.deposits]);
      latest.current.setExpenses((previous) => [...previous.filter((item) => item.cycleId !== cycleId), ...rows.expenses]);
      latest.current.setMealLogs((previous) => [...previous.filter((item) => item.cycleId !== cycleId), ...rows.mealLogs]);
      latest.current.setLoadedCycleIds((previous) => new Set(previous).add(cycleId));
    } catch (caught) {
      console.error('Error loading cycle details:', caught);
      setErrorById((previous) => ({
        ...previous,
        [cycleId]: caught instanceof Error ? caught.message : 'Unable to load cycle details.',
      }));
    } finally {
      setLoadingById((previous) => ({ ...previous, [cycleId]: false }));
    }
  }, []);

  const isLoading = useCallback((cycleId: string) => Boolean(latest.current.loadingById[cycleId]), []);
  const getError = useCallback((cycleId: string) => latest.current.errorById?.[cycleId] ?? null, []);

  return {
    loadCycleDetails,
    isLoading,
    getError,
    reset: () => {
      setLoadingById({});
      setErrorById({});
    },
  };
}
