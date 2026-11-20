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
  const requestIds = useRef(new Map<string, number>());
  const nextRequestId = useRef(0);
  const latest = useRef({ enabled, isLoaded, fetchRows, setDeposits, setExpenses, setMealLogs, setLoadedCycleIds, loadingById, errorById });
  latest.current = { enabled, isLoaded, fetchRows, setDeposits, setExpenses, setMealLogs, setLoadedCycleIds, loadingById, errorById };

  const loadCycleDetails = useCallback(async (cycleId: string, options: { force?: boolean } = {}) => {
    const current = latest.current;
    if (!current.enabled || requestIds.current.has(cycleId) || (!options.force && current.isLoaded(cycleId))) return;
    const requestId = ++nextRequestId.current;
    requestIds.current.set(cycleId, requestId);
    setLoadingById((previous) => ({ ...previous, [cycleId]: true }));
    setErrorById((previous) => ({ ...previous, [cycleId]: null }));
    try {
      const rows = await latest.current.fetchRows(cycleId);
      if (!rows || requestIds.current.get(cycleId) !== requestId) return;
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
      if (requestIds.current.get(cycleId) === requestId) {
        requestIds.current.delete(cycleId);
        setLoadingById((previous) => ({ ...previous, [cycleId]: false }));
      }
    }
  }, []);

  const evictCycleDetails = useCallback((cycleId: string) => {
    requestIds.current.delete(cycleId);
    setLoadingById((previous) => previous[cycleId] ? { ...previous, [cycleId]: false } : previous);
    setErrorById((previous) => previous[cycleId] ? { ...previous, [cycleId]: null } : previous);
    setDeposits((previous) => previous.filter((item) => item.cycleId !== cycleId));
    setExpenses((previous) => previous.filter((item) => item.cycleId !== cycleId));
    setMealLogs((previous) => previous.filter((item) => item.cycleId !== cycleId));
    setLoadedCycleIds((previous) => {
      if (!previous.has(cycleId)) return previous;
      const next = new Set(previous);
      next.delete(cycleId);
      return next;
    });
  }, [setDeposits, setExpenses, setMealLogs, setLoadedCycleIds]);

  const isLoading = useCallback((cycleId: string) => Boolean(latest.current.loadingById[cycleId]), []);
  const getError = useCallback((cycleId: string) => latest.current.errorById?.[cycleId] ?? null, []);

  return {
    loadCycleDetails,
    evictCycleDetails,
    isLoading,
    getError,
    reset: () => {
      setLoadingById({});
      setErrorById({});
    },
  };
}
