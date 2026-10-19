import React, { createContext, useContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import {
  type OfflineOp,
} from './offline-queue';
import { readOfflineSnapshot, writeOfflineSnapshot } from './offline-cache';
import { broadcastSharedUpdate } from './shared-update';
import { triggerDepositPush } from './push-triggers';
import {
  useChangelog,
} from '@/hooks/use-changelog';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useMembers } from '@/hooks/use-members';
import { useDeposits } from '@/hooks/use-deposits';
import { useExpenses } from '@/hooks/use-expenses';
import { useMealLogs } from '@/hooks/use-meal-logs';
import { useCycles } from '@/hooks/use-cycles';
import { useCycleDetails } from '@/hooks/use-cycle-details';
import { useCycleLoader } from '@/hooks/use-cycle-loader';
import { useMealScopeLoader } from '@/hooks/use-meal-scope-loader';
import { useAuth } from '@/lib/auth-context';

import type {
  ChangelogActor,
  ChangelogChange,
  ChangelogEntry,
  ChangelogValue,
  Cycle,
  CycleDeposit,
  CycleStatus,
  Expense,
  MealActionsContextType,
  MealContextType,
  MealDataContextType,
  MealLog,
  Member,
  SnapshotMember,
} from './meal-types';
export type {
  ChangelogAction,
  ChangelogActor,
  ChangelogChange,
  ChangelogEntityType,
  ChangelogEntry,
  Cycle,
  CycleDeposit,
  CycleDetails,
  CycleStatus,
  Expense,
  MealActionsContextType,
  MealContextType,
  MealDataContextType,
  MealLog,
  Member,
} from './meal-types';

export const MealDataContext = createContext<MealDataContextType | undefined>(undefined);
export const MealActionsContext = createContext<MealActionsContextType | undefined>(undefined);

const SOFT_DELETE_GRACE_MS = 10 * 1000;

type MemberRow = {
  id: string;
  name: string;
  avatar: string | null;
  deleted_at?: string | null;
  delete_expires_at?: string | null;
  profile_id?: string | null;
};

type CycleRow = {
  id: string;
  name: string | null;
  status: CycleStatus;
  started_at: string;
  closed_at: string | null;
  finalized_at: string | null;
  members_snapshot: SnapshotMember[] | null;
};

type ExpenseRow = {
  id: string;
  cycle_id: string;
  amount: number | string;
  description: string;
  type: 'meal' | 'utility';
  date: string;
  paid_by: string;
};

type MealLogRow = {
  id: string;
  cycle_id: string;
  member_id: string;
  date: string;
  count: number | string;
};

type CycleDepositRow = {
  id: string;
  cycle_id: string;
  member_id: string;
  amount: number | string;
  note: string | null;
  created_at: string;
};

type MealDataSnapshot = {
  members: Member[];
  archivedMembers?: Member[];
  cycles: Cycle[];
  deposits: CycleDeposit[];
  expenses: Expense[];
  mealLogs: MealLog[];
  changelog?: ChangelogEntry[];
  loadedCycleIds?: string[];
};

function mapExpenseRows(rows: ExpenseRow[]): Expense[] {
  return rows
    .filter((expense) => Boolean(expense.cycle_id))
    .map((expense) => ({
      id: expense.id,
      cycleId: expense.cycle_id,
      amount: Number(expense.amount),
      description: expense.description,
      type: expense.type,
      date: expense.date,
      paidBy: expense.paid_by,
    }));
}

function normalizeExpenseType(type: string): Expense['type'] {
  if (type === 'meal') return 'meal';
  if (type === 'utility' || type === 'fixed') return 'utility';
  throw new Error(`Unknown expense type: ${type}`);
}

function normalizeSnapshotExpenses(expenses: Array<Omit<Expense, 'type'> & { type: string }>): Expense[] {
  return expenses.map((expense) => ({ ...expense, type: normalizeExpenseType(expense.type) }));
}

function normalizeExpenseChanges(changes: ChangelogChange[]): ChangelogChange[] {
  return changes.map((change) => change.field === 'type' ? {
    ...change,
    ...(change.value === 'fixed' ? { value: 'utility' } : {}),
    ...(change.from === 'fixed' ? { from: 'utility' } : {}),
    ...(change.to === 'fixed' ? { to: 'utility' } : {}),
  } : change);
}

function mapMealLogRows(rows: MealLogRow[]): MealLog[] {
  return rows
    .filter((log) => Boolean(log.cycle_id))
    .map((log) => ({
      id: log.id,
      cycleId: log.cycle_id,
      memberId: log.member_id,
      date: log.date,
      count: Number(log.count),
    }));
}

function mapDepositRows(rows: CycleDepositRow[]): CycleDeposit[] {
  return rows.map((deposit) => ({
    id: deposit.id,
    cycleId: deposit.cycle_id,
    memberId: deposit.member_id,
    amount: Number(deposit.amount),
    note: deposit.note ?? undefined,
    createdAt: deposit.created_at,
  }));
}

function toAvatar(name: string, fallback?: string | null) {
  return fallback || name.substring(0, 2).toUpperCase();
}

function getCycleSeasonName(dateValue: string | Date) {
  const month = dateValue instanceof Date ? dateValue.getMonth() : new Date(dateValue).getMonth();

  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

function getDefaultCycleBaseName(dateValue: string | Date) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = String(date.getFullYear()).slice(-2);
  return `Meal ${getCycleSeasonName(date)}-${year}`;
}

function buildSnapshotChange(field: string, label: string, value: ChangelogValue): ChangelogChange {
  return { field, label, value };
}

export function MealProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [memberRoster, setMemberRoster] = useState<Member[]>([]);
  const [archivedMemberRoster, setArchivedMemberRoster] = useState<Member[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allMealLogs, setAllMealLogs] = useState<MealLog[]>([]);
  const [allDeposits, setAllDeposits] = useState<CycleDeposit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loadedCycleIds, setLoadedCycleIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedDataRef = useRef(false);
  const loadedScopeRef = useRef<string | null>(null);
  const profilesMapRef = useRef<Map<string, ChangelogActor>>(new Map());
  const userId = user?.id ?? null;
  const currentProfile = profile?.id === userId ? profile : null;
  const messId = currentProfile?.mess_id ?? null;
  React.useEffect(() => {
    if (!currentProfile) return;
    profilesMapRef.current.set(currentProfile.id, {
      id: currentProfile.id,
      name: currentProfile.full_name,
      pictureUrl: currentProfile.picture_url,
      role: currentProfile.role,
    });
  }, [currentProfile]);
  const [dataError, setDataError] = useState<string | null>(null);
  const {
    entries: allChangelogEntries,
    setEntries: setAllChangelogEntries,
    hasMore: hasMoreChangelogEntries,
    loading: changelogLoading,
    recordChangelog,
    loadMore: loadMoreChangelogEntries,
  } = useChangelog(userId, messId, profilesMapRef);

  // ─── Offline-aware identity resolution ─────────────────────────────────────
  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.status === 'active') ?? null,
    [cycles],
  );

  const pendingCycle = useMemo(
    () => cycles.find((cycle) => cycle.status === 'pending') ?? null,
    [cycles],
  );

  const historyMemberIdsByCycle = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    const addMember = (cycleId: string, memberId: string) => {
      const memberIds = grouped.get(cycleId) ?? new Set<string>();
      memberIds.add(memberId);
      grouped.set(cycleId, memberIds);
    };
    for (const log of allMealLogs) addMember(log.cycleId, log.memberId);
    for (const deposit of allDeposits) addMember(deposit.cycleId, deposit.memberId);
    return grouped;
  }, [allMealLogs, allDeposits]);

  const activeCycleChangelogEntries = useMemo(
    () => activeCycle ? allChangelogEntries.filter((entry) => entry.cycleId === activeCycle.id) : [],
    [allChangelogEntries, activeCycle],
  );

  const pendingCycleChangelogEntries = useMemo(
    () => pendingCycle ? allChangelogEntries.filter((entry) => entry.cycleId === pendingCycle.id) : [],
    [allChangelogEntries, pendingCycle],
  );

  const getCycleMembers = useCallback((cycleId: string): Member[] => {
    const cycle = cycles.find((entry) => entry.id === cycleId);
    if (!cycle) {
      return [];
    }

    const snapshot = cycle.membersSnapshot;

    const cycleMemberIds = new Set<string>();
    const cycleHistoryMemberIds = historyMemberIdsByCycle.get(cycleId) ?? new Set<string>();
    const snapshotMembers = (snapshot && cycle.status !== 'active' ? snapshot : memberRoster).map((member) => {
      cycleMemberIds.add(member.id);
      return {
        ...member,
        id: member.id,
        name: member.name,
        deposit: 0,
        mealsEaten: 0,
        avatar: toAvatar(member.name, member.avatar),
      };
    });
    const archivedHistoryMembers = archivedMemberRoster
      .filter((member) => cycleHistoryMemberIds.has(member.id) && !cycleMemberIds.has(member.id))
      .map((member) => ({ ...member, deposit: 0, mealsEaten: 0 }));
    return [...snapshotMembers, ...archivedHistoryMembers];
  }, [cycles, memberRoster, archivedMemberRoster, historyMemberIdsByCycle]);

  const getMemberName = useCallback((memberId: string, cycleId?: string) => {
    const scopedMembers = cycleId ? getCycleMembers(cycleId) : memberRoster;
    return scopedMembers.find((member) => member.id === memberId)?.name ?? 'Unknown member';
  }, [getCycleMembers, memberRoster]);

  const computedCycleDetails = useCycleDetails({
    cycles,
    loadedCycleIds,
    membersForCycle: getCycleMembers,
    deposits: allDeposits,
    expenses: allExpenses,
    mealLogs: allMealLogs,
  });

  const fetchCycleRows = useCallback(async (cycleId: string) => {
    if (!userId || !messId) {
      return null;
    }

    const [depositsResult, expensesResult] = await Promise.all([
      supabase
        .from('cycle_deposits')
        .select('id, cycle_id, member_id, amount, note, created_at')
        .eq('mess_id', messId)
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true }),
      supabase
        .from('expenses')
        .select('id, cycle_id, amount, description, type, date, paid_by')
        .eq('mess_id', messId)
        .eq('cycle_id', cycleId)
        .is('deleted_at', null)
        .order('date', { ascending: false }),
    ]);

    if (depositsResult.error) throw depositsResult.error;
    if (expensesResult.error) throw expensesResult.error;
    const mealLogRows: MealLogRow[] = [];
    const mealLogPageSize = 1000;
    for (let offset = 0; ; offset += mealLogPageSize) {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('id, cycle_id, member_id, date, count')
        .eq('mess_id', messId)
        .eq('cycle_id', cycleId)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + mealLogPageSize - 1);
      if (error) throw error;
      const page = (data || []) as MealLogRow[];
      mealLogRows.push(...page);
      if (page.length < mealLogPageSize) break;
    }

    return {
      deposits: mapDepositRows((depositsResult.data || []) as CycleDepositRow[]),
      expenses: mapExpenseRows((expensesResult.data || []) as ExpenseRow[]),
      mealLogs: mapMealLogRows(mealLogRows),
    };
  }, [userId, messId]);

  const fetchCycleRowsForCycles = useCallback(async (cycleIds: string[]) => {
    if (!userId || !messId || cycleIds.length === 0) {
      return { deposits: [] as CycleDeposit[], expenses: [] as Expense[], mealLogs: [] as MealLog[] };
    }

    const [depositsResult, expensesResult] = await Promise.all([
      supabase.from('cycle_deposits').select('id, cycle_id, member_id, amount, note, created_at').eq('mess_id', messId).in('cycle_id', cycleIds).order('created_at', { ascending: true }),
      supabase.from('expenses').select('id, cycle_id, amount, description, type, date, paid_by').eq('mess_id', messId).in('cycle_id', cycleIds).is('deleted_at', null).order('date', { ascending: false }),
    ]);
    if (depositsResult.error) throw depositsResult.error;
    if (expensesResult.error) throw expensesResult.error;

    const mealLogRows: MealLogRow[] = [];
    const mealLogPageSize = 1000;
    for (let offset = 0; ; offset += mealLogPageSize) {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('id, cycle_id, member_id, date, count')
        .eq('mess_id', messId)
        .in('cycle_id', cycleIds)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + mealLogPageSize - 1);
      if (error) throw error;
      const page = (data || []) as MealLogRow[];
      mealLogRows.push(...page);
      if (page.length < mealLogPageSize) break;
    }

    return {
      deposits: mapDepositRows((depositsResult.data || []) as CycleDepositRow[]),
      expenses: mapExpenseRows((expensesResult.data || []) as ExpenseRow[]),
      mealLogs: mapMealLogRows(mealLogRows),
    };
  }, [userId, messId]);

  const cycleLoader = useCycleLoader({
    enabled: Boolean(userId && messId),
    isLoaded: (cycleId) => computedCycleDetails.getCycleDetails(cycleId) !== null,
    fetchRows: fetchCycleRows,
    setDeposits: setAllDeposits,
    setExpenses: setAllExpenses,
    setMealLogs: setAllMealLogs,
    setLoadedCycleIds,
  });

  const loadData = useCallback(async () => {
    if (!userId || !messId) return;

    const isInitialLoad = !hasLoadedDataRef.current;
    setRefreshing(true);

    const cacheKey = `mealtrack-data-cache-${userId}-${messId}`;

    let snapshot: MealDataSnapshot | null = null;
    if (navigator.onLine) {
      try {
        snapshot = await readOfflineSnapshot<MealDataSnapshot>(cacheKey);
      } catch {
        // Ignore an unavailable cache and continue with the server request.
      }
      if (snapshot) {
        setMemberRoster(snapshot.members);
        setArchivedMemberRoster(snapshot.archivedMembers ?? []);
        setCycles(snapshot.cycles);
        setAllDeposits(snapshot.deposits);
        setAllExpenses(normalizeSnapshotExpenses(snapshot.expenses));
        setAllMealLogs(snapshot.mealLogs);
        setAllChangelogEntries(snapshot.changelog ?? []);
        setLoadedCycleIds(new Set(snapshot.loadedCycleIds ?? []));
        setDataError(null);
        hasLoadedDataRef.current = true;
        setLoading(false);
      }
    }

    // ── Offline path: hydrate from localStorage cache ────────────────────────
    if (!navigator.onLine) {
      try {
        const snap = await readOfflineSnapshot<{
            members: Member[];
            archivedMembers?: Member[];
            cycles: Cycle[];
            deposits: CycleDeposit[];
            expenses: Expense[];
            mealLogs: MealLog[];
            changelog: ChangelogEntry[];
            loadedCycleIds: string[];
          }>(cacheKey);
        if (snap) {
          setMemberRoster(snap.members);
          setArchivedMemberRoster(snap.archivedMembers ?? []);
          setCycles(snap.cycles);
          setAllDeposits(snap.deposits);
          setAllExpenses(normalizeSnapshotExpenses(snap.expenses));
          setAllMealLogs(snap.mealLogs);
          setAllChangelogEntries(snap.changelog ?? []);
          setLoadedCycleIds(new Set(snap.loadedCycleIds));
          setDataError(null);
          hasLoadedDataRef.current = true;
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } catch {
        // corrupt cache – fall through to show error
      }
      setDataError('You are offline and no cached data was found. Connect to the internet to load your data.');
      hasLoadedDataRef.current = true;
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // ── Online path ──────────────────────────────────────────────────────────
    try {
      if (isInitialLoad && !snapshot) setLoading(true);

      const [membersResult, cyclesResult] = await Promise.all([
        supabase
          .from('members')
          .select('id, name, avatar, deleted_at, delete_expires_at, profile_id')
          .eq('mess_id', messId)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase
          .from('cycles')
          .select('id, name, status, started_at, closed_at, finalized_at, members_snapshot')
          .eq('mess_id', messId)
          .is('deleted_at', null)
          .order('started_at', { ascending: false }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (cyclesResult.error) throw cyclesResult.error;

      const memberRows = (membersResult.data || []) as MemberRow[];
      const nextMembers = memberRows
        .filter((member) => !member.deleted_at)
        .map((member) => ({
          id: member.id,
          name: member.name,
          deposit: 0,
          mealsEaten: 0,
          avatar: toAvatar(member.name, member.avatar),
          profileId: member.profile_id ?? null,
        }));
      const nextArchivedMembers = memberRows
        // Include both permanent archives and members still in the undo window.
        // Cycle membership only restores one into calculations when that cycle
        // actually has meal/deposit history for the member.
        .filter((member) => Boolean(member.deleted_at))
        .map((member) => ({
          id: member.id,
          name: member.name,
          deposit: 0,
          mealsEaten: 0,
          avatar: toAvatar(member.name, member.avatar),
          profileId: member.profile_id ?? null,
          archived: !member.delete_expires_at,
        }));

      const nextCycles = ((cyclesResult.data || []) as CycleRow[])
        .map((cycle) => ({
          id: cycle.id,
          name: cycle.name || getDefaultCycleBaseName(cycle.started_at),
          status: cycle.status,
          startedAt: cycle.started_at,
          closedAt: cycle.closed_at,
          finalizedAt: cycle.finalized_at,
          membersSnapshot: cycle.members_snapshot,
        }));

      const initialCycleIds = nextCycles
        .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
        .map((cycle) => cycle.id);
      const initialRows = await fetchCycleRowsForCycles(initialCycleIds);
      const nextDeposits = initialRows.deposits;
      const nextExpenses = initialRows.expenses;
      const nextMealLogs = initialRows.mealLogs;

      setMemberRoster(nextMembers);
      setArchivedMemberRoster(nextArchivedMembers);
      setCycles(nextCycles);
      setAllDeposits(nextDeposits);
      setAllExpenses(nextExpenses);
      setAllMealLogs(nextMealLogs);
      setLoadedCycleIds(new Set(initialCycleIds));
      setDataError(null);
      hasLoadedDataRef.current = true;

    } catch (error) {
      console.error('Error loading data:', error);

      // If we go offline mid-load, try falling back to cache
      if (!navigator.onLine) {
        try {
          const snap = await readOfflineSnapshot<{
              members: Member[];
              archivedMembers?: Member[];
              cycles: Cycle[];
              deposits: CycleDeposit[];
              expenses: Expense[];
              mealLogs: MealLog[];
              changelog: ChangelogEntry[];
              loadedCycleIds: string[];
            }>(cacheKey);
          if (snap) {
            setMemberRoster(snap.members);
            setArchivedMemberRoster(snap.archivedMembers ?? []);
            setCycles(snap.cycles);
            setAllDeposits(snap.deposits);
            setAllExpenses(normalizeSnapshotExpenses(snap.expenses));
            setAllMealLogs(snap.mealLogs);
            setAllChangelogEntries(snap.changelog ?? []);
            setLoadedCycleIds(new Set(snap.loadedCycleIds));
            setDataError(null);
            hasLoadedDataRef.current = true;
            setLoading(false);
            setRefreshing(false);
            return;
          }
        } catch { /* ignore */ }
      }

      if (isInitialLoad && !hasLoadedDataRef.current) {
        setDataError(
          error instanceof Error
            ? error.message
            : 'Unable to load your meal data. Please check your connection and try again.',
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, messId, fetchCycleRowsForCycles, setAllChangelogEntries]);

  React.useEffect(() => {
    if (!userId || !messId || !hasLoadedDataRef.current || loadedScopeRef.current !== `${userId}:${messId}`) return;
    const cacheKey = `mealtrack-data-cache-${userId}-${messId}`;
    const timeoutId = window.setTimeout(() => {
      void writeOfflineSnapshot(cacheKey, {
        members: memberRoster,
        archivedMembers: archivedMemberRoster,
        cycles,
        deposits: allDeposits,
        expenses: allExpenses,
        mealLogs: allMealLogs,
        changelog: allChangelogEntries,
        loadedCycleIds: Array.from(loadedCycleIds),
      }).catch(() => {
        // Quota exceeded or private browsing — non-fatal.
      });
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [userId, messId, memberRoster, archivedMemberRoster, cycles, allDeposits, allExpenses, allMealLogs, allChangelogEntries, loadedCycleIds]);

  const clearDataError = useCallback(() => {
    setDataError(null);
  }, []);

  const requestDataLoad = useCallback(() => {
    void loadData();
  }, [loadData]);

  const broadcastUpdate = useCallback(() => {
    void broadcastSharedUpdate();
  }, []);

  useMealScopeLoader({
    userId,
    messId,
    loadedScopeRef,
    hasLoadedDataRef,
    setLoading,
    clearError: clearDataError,
    load: requestDataLoad,
  });

  const retryLoadData = useCallback(() => {
    if (userId && messId) {
      setDataError(null);
      void loadData();
    }
  }, [userId, messId, loadData]);

  const getRequiredCycleId = useCallback((requestedCycleId?: string) => {
    return requestedCycleId ?? activeCycle?.id ?? null;
  }, [activeCycle?.id]);

  const allowsNegativeExpenseAmount = useCallback((cycleId: string) => {
    return cycles.find((cycle) => cycle.id === cycleId)?.status === 'pending';
  }, [cycles]);

  const memberActions = useMembers({
    userId,
    messId,
    activeCycleId: activeCycle?.id ?? null,
    members: memberRoster,
    setMembers: setMemberRoster,
    setArchivedMembers: setArchivedMemberRoster,
    recordChange: recordChangelog,
    reload: requestDataLoad,
    broadcast: broadcastUpdate,
  });

  const saveMealLogsForReplayRef = useRef<MealActionsContextType["saveMealLogs"]>(async () => {});
  const setPendingSyncIdsRef = useRef<React.Dispatch<React.SetStateAction<Set<string>>>>(() => {});
  const replayOptionsRef = useRef({ userId, messId, recordChangelog, getMemberName });
  replayOptionsRef.current = { userId, messId, recordChangelog, getMemberName };

  const replayOp = useCallback(async (op: OfflineOp) => {
    const { userId, messId, recordChangelog, getMemberName } = replayOptionsRef.current;
    if (!userId || !messId) throw new Error('Not authenticated');
    if (op.payload.userId !== userId || op.payload.messId !== messId) {
      throw new Error('This offline change belongs to a different account or mess. Sign in with its original account to sync it.');
    }

    if (op.type === 'ADD_EXPENSE') {
      const p = op.payload as {
        amount: number; description: string; type: string;
        recordId?: string; paidBy: string; date: string; userId: string; messId: string; cycleId: string;
      };
      const expenseType = normalizeExpenseType(p.type);
      const { data, error } = await supabase
        .from('expenses')
        .upsert([{
          id: p.recordId ?? op.id.slice('offline-'.length),
          amount: p.amount,
          description: p.description,
          type: expenseType,
          paid_by: p.paidBy,
          date: p.date,
          user_id: userId,
          mess_id: messId,
          cycle_id: p.cycleId,
        }], { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      setAllExpenses((prev) => [
        { id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by },
        ...prev.filter((e) => e.id !== op.id),
      ]);
      await recordChangelog({
        cycleId: p.cycleId, entityType: 'expense', entityId: data.id, action: 'create',
        title: `Added ${data.type} expense`,
        changes: [buildSnapshotChange('description', 'Description', data.description), buildSnapshotChange('amount', 'Amount', Number(data.amount)), buildSnapshotChange('type', 'Type', data.type)],
      });
      return;
    }

    if (op.type === 'UPDATE_EXPENSE') {
      const p = op.payload as { id: string; amount: number; description: string; type: string; paidBy: string; date: string; cycleId: string; changes: ChangelogChange[]; expected?: { amount: number; description: string; type: string; paidBy: string; date: string } };
      const expenseType = normalizeExpenseType(p.type);
      const { data: current, error: readError } = await supabase.from('expenses').select('id,amount,description,type,paid_by,date,deleted_at').eq('id', p.id).eq('mess_id', messId).maybeSingle();
      if (readError) throw readError;
      if (!current || current.deleted_at) throw new Error('The expense no longer exists. Review or discard this offline change.');
      if (p.expected && (Number(current.amount) !== p.expected.amount || current.description !== p.expected.description || current.type !== normalizeExpenseType(p.expected.type) || current.paid_by !== p.expected.paidBy || current.date !== p.expected.date)) {
        const conflict = new Error('This expense changed on another device. Review it before applying your offline edit.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      const { data: updated, error } = await supabase.from('expenses').update({ amount: p.amount, description: p.description, type: expenseType, paid_by: p.paidBy, date: p.date }).eq('id', p.id).eq('mess_id', messId).select('id').maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error('The expense could not be found to update.');
      setAllExpenses((prev) => prev.map((expense) => expense.id === p.id ? { ...expense, amount: p.amount, description: p.description, type: expenseType, paidBy: p.paidBy, date: p.date } : expense));
      setPendingSyncIdsRef.current((prev) => { const next = new Set(prev); next.delete(p.id); return next; });
      await recordChangelog({ cycleId: p.cycleId, entityType: 'expense', entityId: p.id, action: 'update', title: `Updated ${expenseType} expense`, changes: normalizeExpenseChanges(p.changes) });
      return;
    }

    if (op.type === 'DELETE_EXPENSE') {
      const p = op.payload as { id: string; cycleId: string; description: string; amount: number; type: string; paidBy: string; date: string; expected?: { amount: number; description: string; type: string; paidBy: string; date: string } };
      const expenseType = normalizeExpenseType(p.type);
      const { data: current, error: readError } = await supabase.from('expenses').select('id,amount,description,type,paid_by,date,deleted_at').eq('id', p.id).eq('mess_id', messId).maybeSingle();
      if (readError) throw readError;
      if (!current || current.deleted_at) throw new Error('The expense no longer exists. Review or discard this offline deletion.');
      if (p.expected && (Number(current.amount) !== p.expected.amount || current.description !== p.expected.description || current.type !== normalizeExpenseType(p.expected.type) || current.paid_by !== p.expected.paidBy || current.date !== p.expected.date)) {
        const conflict = new Error('This expense changed on another device. Review it before applying your offline deletion.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      const now = new Date();
      const { data: deleted, error } = await supabase.from('expenses').update({ deleted_at: now.toISOString(), delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString() }).eq('id', p.id).eq('mess_id', messId).is('deleted_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!deleted) throw new Error('The expense could not be found to delete.');
      await recordChangelog({
        cycleId: p.cycleId, entityType: 'expense', entityId: p.id, action: 'delete', title: `Deleted ${expenseType} expense`,
        changes: [buildSnapshotChange('description', 'Description', p.description), buildSnapshotChange('amount', 'Amount', p.amount), buildSnapshotChange('type', 'Type', expenseType), buildSnapshotChange('paid_by', 'Paid By', p.paidBy), buildSnapshotChange('date', 'Date', p.date)],
      });
      return;
    }

    if (op.type === 'ADD_DEPOSIT') {
      const p = op.payload as {
        recordId?: string; memberId: string; amount: number; cycleId: string; note: string | null; userId: string; messId: string;
      };
      const { data, error } = await supabase
        .from('cycle_deposits')
        .upsert([{
          id: p.recordId ?? op.id.slice('offline-'.length),
          member_id: p.memberId,
          cycle_id: p.cycleId,
          amount: p.amount,
          note: p.note,
          user_id: userId,
          mess_id: messId,
        }], { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      setAllDeposits((prev) => [
        ...prev.filter((d) => d.id !== op.id),
        { id: data.id, cycleId: data.cycle_id, memberId: data.member_id, amount: Number(data.amount), note: data.note ?? undefined, createdAt: data.created_at },
      ]);
      void triggerDepositPush({ depositId: data.id });
      await recordChangelog({
        cycleId: p.cycleId, entityType: 'deposit', entityId: data.id, action: 'update',
        title: `Updated deposit for ${getMemberName(p.memberId, p.cycleId)}`,
        changes: [buildSnapshotChange('member', 'Member', getMemberName(p.memberId, p.cycleId)), buildSnapshotChange('transaction_amount', 'Transaction', Number(data.amount)), ...(data.note ? [buildSnapshotChange('note', 'Note', data.note)] : [])],
      });
      return;
    }

    if (op.type === 'ADD_MEAL_LOG') {
      const p = op.payload as {
        entries: Array<{ memberId: string; count: number }>;
        dateStr: string; cycleId: string; userId: string; messId: string;
      };
      await saveMealLogsForReplayRef.current(p.entries, p.dateStr, p.cycleId);
      setAllMealLogs((prev) => prev.filter((log) => !log.id.startsWith('offline-')));
      return;
    }
  }, []);

  const pendingItemId = useCallback((operation: OfflineOp) => (
    (operation.type === 'UPDATE_EXPENSE' || operation.type === 'DELETE_EXPENSE') &&
    typeof operation.payload.id === 'string'
      ? operation.payload.id
      : operation.id
  ), []);

  const afterOfflineSync = useCallback(() => {
    void broadcastSharedUpdate();
    void loadData();
  }, [loadData]);

  const offlineScope = useMemo(() => userId && messId ? { userId, messId } : null, [userId, messId]);

  const {
    pendingSyncIds,
    setPendingSyncIds,
    failedSyncOps,
    triggerSync,
    retryFailedSync,
    discardFailedSync,
  } = useOfflineSync({
    scope: offlineScope,
    replay: replayOp,
    afterSync: afterOfflineSync,
    pendingItemId,
  });
  setPendingSyncIdsRef.current = setPendingSyncIds;

  const depositActions = useDeposits({
    userId,
    messId,
    deposits: allDeposits,
    setDeposits: setAllDeposits,
    setPendingSyncIds,
    getCycleId: getRequiredCycleId,
    getMemberName: (memberId, cycleId) => getMemberName(memberId, cycleId),
    recordChange: recordChangelog,
    broadcast: broadcastUpdate,
  });

  const expenseActions = useExpenses({
    userId,
    messId,
    expenses: allExpenses,
    setExpenses: setAllExpenses,
    setPendingSyncIds,
    getCycleId: getRequiredCycleId,
    allowsNegativeAmount: allowsNegativeExpenseAmount,
    recordChange: recordChangelog,
    broadcast: broadcastUpdate,
  });

  const mealLogActions = useMealLogs({
    userId,
    messId,
    setMealLogs: setAllMealLogs,
    setPendingSyncIds,
    getCycleId: getRequiredCycleId,
    getMemberName,
    recordChange: recordChangelog,
    broadcast: broadcastUpdate,
  });
  saveMealLogsForReplayRef.current = mealLogActions.saveMealLogs;

  const cycleActions = useCycles({
    userId,
    messId,
    cycles,
    activeCycle,
    pendingCycle,
    getCycleMembers,
    getCycleDetails: computedCycleDetails.getCycleDetails,
    setCycles,
    setLoadedCycleIds,
    setDeposits: setAllDeposits,
    setExpenses: setAllExpenses,
    setMealLogs: setAllMealLogs,
    setChangelogEntries: setAllChangelogEntries,
    reload: requestDataLoad,
    broadcast: broadcastUpdate,
  });

  const activeDetails = useMemo(
    () => (activeCycle ? computedCycleDetails.getCycleDetails(activeCycle.id) : null),
    [activeCycle, computedCycleDetails],
  );

  // Archived members remain in cycle details so historical meals/deposits still
  // calculate correctly, but they must never appear in the active roster UI.
  const members = useMemo(
    () => (activeDetails?.members ?? memberRoster).filter((member) => !member.archived),
    [activeDetails, memberRoster],
  );
  const expenses = useMemo(() => activeDetails?.expenses ?? [], [activeDetails]);
  const mealLogs = useMemo(() => activeDetails?.mealLogs ?? [], [activeDetails]);
  const deposits = useMemo(() => activeDetails?.deposits ?? [], [activeDetails]);
  const stats = useMemo(
    () =>
      activeDetails?.stats ?? {
        totalDeposits: 0,
        totalMealExpenses: 0,
        totalFixedExpenses: 0,
        totalMealsConsumed: 0,
        currentMealRate: 0,
        fixedCostPerMember: 0,
        remainingCash: 0,
      },
    [activeDetails],
  );

  const getMemberStats = useCallback((memberId: string, cycleId?: string) => {
    const targetCycleId = getRequiredCycleId(cycleId);
    if (!targetCycleId) {
      return { mealCost: 0, fixedCost: 0, totalCost: 0, balance: 0, mealsEaten: 0 };
    }

    const details = computedCycleDetails.getCycleDetails(targetCycleId);
    const member = details?.members.find((entry) => entry.id === memberId);

    if (!member) {
      return { mealCost: 0, fixedCost: 0, totalCost: 0, balance: 0, mealsEaten: 0 };
    }

    return {
      mealCost: member.mealCost,
      fixedCost: member.fixedCost,
      totalCost: member.totalCost,
      balance: member.balance,
      mealsEaten: member.mealsEaten,
    };
  }, [getRequiredCycleId, computedCycleDetails]);

  const dataValue = useMemo<MealDataContextType>(() => ({
    members,
    expenses,
    deposits,
    mealLogs,
    cycles,
    activeCycleChangelogEntries,
    pendingCycleChangelogEntries,
    changelogEntries: allChangelogEntries,
    hasMoreChangelogEntries,
    changelogLoading,
    activeCycle,
    pendingCycle,
    loading,
    initialLoading: loading && !hasLoadedDataRef.current,
    refreshing,
    stats,
    pendingSyncIds,
    failedSyncOps,
    archivedMembers: archivedMemberRoster.filter((member) => member.archived),
    dataError,
    getMemberStats,
    getCycleDetails: computedCycleDetails.getCycleDetails,
    isCycleDetailsLoading: cycleLoader.isLoading,
    getCycleDetailsError: cycleLoader.getError,
  }), [
    members,
    expenses,
    deposits,
    mealLogs,
    cycles,
    activeCycleChangelogEntries,
    pendingCycleChangelogEntries,
    allChangelogEntries,
    hasMoreChangelogEntries,
    changelogLoading,
    activeCycle,
    pendingCycle,
    loading,
    refreshing,
    stats,
    pendingSyncIds,
    failedSyncOps,
    archivedMemberRoster,
    dataError,
    getMemberStats,
    computedCycleDetails.getCycleDetails,
    cycleLoader.isLoading,
    cycleLoader.getError,
  ]);

  const actionsValue = useMemo<MealActionsContextType>(() => ({
    addMember: memberActions.addMember,
    updateMember: memberActions.updateMember,
    removeMember: memberActions.removeMember,
    restoreMember: memberActions.restoreMember,
    reorderMembers: memberActions.reorderMembers,
    addExpense: expenseActions.addExpense,
    updateExpense: expenseActions.updateExpense,
    deleteExpense: expenseActions.deleteExpense,
    restoreExpense: expenseActions.restoreExpense,
    addDeposit: depositActions.addDeposit,
    saveMealLogs: mealLogActions.saveMealLogs,
    logMeal: mealLogActions.logMeal,
    renameActiveCycle: cycleActions.renameActiveCycle,
    closeActiveCycle: cycleActions.closeActiveCycle,
    startNewCycle: cycleActions.startNewCycle,
    suggestCycleName: cycleActions.suggestCycleName,
    markCycleClosed: cycleActions.markCycleClosed,
    deleteCycle: cycleActions.deleteCycle,
    restoreCycle: cycleActions.restoreCycle,
    loadCycleDetails: cycleLoader.loadCycleDetails,
    loadMoreChangelogEntries,
    triggerSync,
    retryFailedSync,
    discardFailedSync,
    retryLoadData,
  }), [
    memberActions.addMember,
    memberActions.updateMember,
    memberActions.removeMember,
    memberActions.restoreMember,
    memberActions.reorderMembers,
    expenseActions.addExpense,
    expenseActions.updateExpense,
    expenseActions.deleteExpense,
    expenseActions.restoreExpense,
    depositActions.addDeposit,
    mealLogActions.saveMealLogs,
    mealLogActions.logMeal,
    cycleActions.renameActiveCycle,
    cycleActions.closeActiveCycle,
    cycleActions.startNewCycle,
    cycleActions.suggestCycleName,
    cycleActions.markCycleClosed,
    cycleActions.deleteCycle,
    cycleActions.restoreCycle,
    cycleLoader.loadCycleDetails,
    loadMoreChangelogEntries,
    triggerSync,
    retryFailedSync,
    discardFailedSync,
    retryLoadData,
  ]);

  return (
    <MealActionsContext.Provider value={actionsValue}>
      <MealDataContext.Provider value={dataValue}>
        {children}
      </MealDataContext.Provider>
    </MealActionsContext.Provider>
  );
}

export function useMealData() {
  const context = useContext(MealDataContext);
  if (context === undefined) {
    throw new Error('useMealData must be used within a MealProvider');
  }
  return context;
}

export function useMealActions() {
  const context = useContext(MealActionsContext);
  if (context === undefined) {
    throw new Error('useMealActions must be used within a MealProvider');
  }
  return context;
}

export function useMeal(): MealContextType {
  const data = useMealData();
  const actions = useMealActions();
  return useMemo(() => ({ ...data, ...actions }), [data, actions]);
}
