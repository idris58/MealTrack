import React, { createContext, useContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import { dequeueAll, type OfflineOp } from './offline-queue';
import { readOfflineSnapshot, writeOfflineSnapshot } from './offline-cache';
import { broadcastSharedUpdate } from './shared-update';
import { triggerDepositPush } from './push-triggers';
import { withRequestTimeout } from './request-retry';
import {
  useChangelog,
} from '@/hooks/use-changelog';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useMembers } from '@/hooks/use-members';
import { useDeposits } from '@/hooks/use-deposits';
import { useExpenses } from '@/hooks/use-expenses';
import { useMealLogs } from '@/hooks/use-meal-logs';
import { useCycles } from '@/hooks/use-cycles';
import { useCycleDetails as useComputedCycleDetails } from '@/hooks/use-cycle-details';
import { useCycleLoader } from '@/hooks/use-cycle-loader';
import { useMealScopeLoader } from '@/hooks/use-meal-scope-loader';
import { useAuth } from '@/lib/auth-context';

import type {
  ChangelogActor,
  ChangelogEntry,
  Cycle,
  CycleDeposit,
  DepositKind,
  CycleStatus,
  Expense,
  MealActionsContextType,
  MealDataState,
  MealLog,
  Member,
  SettlementSnapshotEntry,
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
  DepositKind,
  CycleDetails,
  CycleStatus,
  Expense,
  MealActionsContextType,
  MealDataState,
  MealLog,
  Member,
} from './meal-types';

export const MealActionsContext = createContext<MealActionsContextType | undefined>(undefined);
type MealRowsData = Pick<MealDataState, 'expenses' | 'deposits' | 'mealLogs'>;
type MealCyclesData = Pick<MealDataState, 'cycles' | 'activeCycle' | 'pendingCycle'>;
type MealCycleDetailsData = Pick<MealDataState, 'getCycleDetails' | 'isCycleDetailsLoading' | 'getCycleDetailsError'> & { revision: unknown };
type MealMembersData = Pick<MealDataState, 'members' | 'archivedMembers' | 'getMemberStats'>;
type MealStatsData = Pick<MealDataState, 'stats'>;
type MealStatusData = Pick<MealDataState, 'loading' | 'initialLoading' | 'refreshing' | 'pendingSyncIds' | 'failedSyncOps' | 'dataError'>;
type MealChangelogData = Pick<MealDataState, 'activeCycleChangelogEntries' | 'pendingCycleChangelogEntries' | 'changelogEntries' | 'hasMoreChangelogEntries' | 'changelogLoading'>;

const MealRowsContext = createContext<MealRowsData | undefined>(undefined);
const MealCyclesContext = createContext<MealCyclesData | undefined>(undefined);
const MealCycleDetailsContext = createContext<MealCycleDetailsData | undefined>(undefined);
const MealMembersContext = createContext<MealMembersData | undefined>(undefined);
const MealStatsContext = createContext<MealStatsData | undefined>(undefined);
const MealStatusContext = createContext<MealStatusData | undefined>(undefined);
const MealChangelogContext = createContext<MealChangelogData | undefined>(undefined);

type RealtimeEvents = { notices: number; mealOffRequests: number; profiles: number };
const RealtimeEventsContext = createContext<RealtimeEvents | undefined>(undefined);

const SOFT_DELETE_GRACE_MS = 10 * 1000;
const MAX_OFFLINE_CYCLES = 6;

type MemberRow = {
  id: string;
  name: string;
  avatar: string | null;
  deleted_at?: string | null;
  delete_expires_at?: string | null;
  profile_id?: string | null;
  created_at?: string | null;
};

type CycleRow = {
  id: string;
  name: string | null;
  status: CycleStatus;
  started_at: string;
  closed_at: string | null;
  finalized_at: string | null;
  members_snapshot: SnapshotMember[] | null;
  settlement_snapshot: SettlementSnapshotEntry[] | null;
};

type ExpenseRow = {
  id: string;
  cycle_id: string;
  amount: number | string;
  description: string;
  type: 'meal' | 'utility';
  date: string;
  paid_by: string;
  updated_at: string;
};

type MealLogRow = {
  id: string;
  cycle_id: string;
  member_id: string;
  date: string;
  count: number | string;
  updated_at: string;
};

type CycleDepositRow = {
  id: string;
  cycle_id: string;
  member_id: string;
  amount: number | string;
  kind: DepositKind | null;
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

type RealtimeRowPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) return [...rows, row];
  const next = [...rows];
  next[index] = row;
  return next;
}

function removeById<T extends { id: string }>(rows: T[], id: string): T[] {
  return rows.filter((row) => row.id !== id);
}

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
      updatedAt: expense.updated_at,
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

function overlayQueuedOperations<TData extends Pick<MealDataSnapshot, 'deposits' | 'expenses' | 'mealLogs'>>(
  data: TData,
  operations: OfflineOp[],
) {
  const deposits = [...data.deposits];
  let expenses = normalizeSnapshotExpenses(data.expenses);
  const mealLogs = [...data.mealLogs];

  for (const operation of operations) {
    const payload = operation.payload;
    if (operation.type === 'ADD_EXPENSE') {
      const item = payload as {
        recordId?: string; amount: number; description: string; type: string;
        paidBy: string; date: string; cycleId: string;
      };
      const existingIndex = expenses.findIndex((expense) => expense.id === operation.id || expense.id === item.recordId);
      const optimisticExpense: Expense = {
        id: operation.id,
        cycleId: item.cycleId,
        amount: Number(item.amount),
        description: item.description,
        type: normalizeExpenseType(item.type),
        date: item.date,
        paidBy: item.paidBy,
      };
      if (existingIndex >= 0) expenses[existingIndex] = optimisticExpense;
      else expenses.unshift(optimisticExpense);
    } else if (operation.type === 'UPDATE_EXPENSE') {
      const item = payload as {
        id: string; amount: number; description: string; type: string;
        paidBy: string; date: string; cycleId: string;
      };
      expenses = expenses.map((expense) => expense.id === item.id ? {
        ...expense,
        amount: Number(item.amount),
        description: item.description,
        type: normalizeExpenseType(item.type),
        paidBy: item.paidBy,
        date: item.date,
      } : expense);
    } else if (operation.type === 'DELETE_EXPENSE') {
      const item = payload as { id: string };
      expenses = expenses.filter((expense) => expense.id !== item.id);
    } else if (operation.type === 'ADD_DEPOSIT') {
      const item = payload as {
        recordId?: string; memberId: string; amount: number; kind?: DepositKind; cycleId: string; note: string | null;
      };
      const existingIndex = deposits.findIndex((deposit) => deposit.id === operation.id || deposit.id === item.recordId);
      const optimisticDeposit: CycleDeposit = {
        id: operation.id,
        cycleId: item.cycleId,
        memberId: item.memberId,
        amount: Number(item.amount),
        kind: item.kind ?? (Number(item.amount) < 0 ? 'refund' : 'deposit'),
        note: item.note ?? undefined,
        createdAt: new Date(operation.createdAt).toISOString(),
      };
      if (existingIndex >= 0) deposits[existingIndex] = optimisticDeposit;
      else deposits.push(optimisticDeposit);
    } else if (operation.type === 'ADD_MEAL_LOG') {
      const item = payload as {
        entries: Array<{ memberId: string; count: number }>;
        dateStr: string;
        cycleId: string;
      };
      for (const entry of item.entries) {
        const rowIndex = mealLogs.findIndex((log) =>
          log.cycleId === item.cycleId && log.date === item.dateStr && log.memberId === entry.memberId,
        );
        if (Number(entry.count) <= 0) {
          if (rowIndex >= 0) mealLogs.splice(rowIndex, 1);
        } else {
          const optimisticLog: MealLog = {
            id: `offline-meal-${operation.id}-${entry.memberId}`,
            cycleId: item.cycleId,
            memberId: entry.memberId,
            date: item.dateStr,
            count: Number(entry.count),
          };
          if (rowIndex >= 0) mealLogs[rowIndex] = optimisticLog;
          else mealLogs.push(optimisticLog);
        }
      }
    }
  }

  return { ...data, deposits, expenses, mealLogs };
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
      updatedAt: log.updated_at,
    }));
}

function mapDepositRows(rows: CycleDepositRow[]): CycleDeposit[] {
  return rows.map((deposit) => ({
    id: deposit.id,
    cycleId: deposit.cycle_id,
    memberId: deposit.member_id,
    amount: Number(deposit.amount),
    kind: deposit.kind ?? (Number(deposit.amount) < 0 ? 'refund' : 'deposit'),
    note: deposit.note ?? undefined,
    createdAt: deposit.created_at,
  }));
}

async function fetchCycleRowsForScope(messId: string, cycleIds: string[]) {
  if (!cycleIds.length) return { deposits: [] as CycleDeposit[], expenses: [] as Expense[], mealLogs: [] as MealLog[] };

  const [depositsResult, expensesResult] = await Promise.all([
    supabase.from('cycle_deposits')
      .select('id, cycle_id, member_id, amount, kind, note, created_at')
      .eq('mess_id', messId).in('cycle_id', cycleIds).order('created_at', { ascending: true }),
    supabase.from('expenses')
      .select('id, cycle_id, amount, description, type, date, paid_by, updated_at')
      .eq('mess_id', messId).in('cycle_id', cycleIds).is('deleted_at', null).order('date', { ascending: false }),
  ]);
  if (depositsResult.error) throw depositsResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const mealLogRows: MealLogRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('meal_logs')
      .select('id, cycle_id, member_id, date, count, updated_at')
      .eq('mess_id', messId).in('cycle_id', cycleIds)
      .order('date', { ascending: false }).order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as MealLogRow[];
    mealLogRows.push(...page);
    if (page.length < pageSize) break;
  }

  return {
    deposits: mapDepositRows((depositsResult.data || []) as CycleDepositRow[]),
    expenses: mapExpenseRows((expensesResult.data || []) as ExpenseRow[]),
    mealLogs: mapMealLogRows(mealLogRows),
  };
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

export function MealProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [memberRoster, setMemberRoster] = useState<Member[]>([]);
  const [archivedMemberRoster, setArchivedMemberRoster] = useState<Member[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allMealLogs, setAllMealLogs] = useState<MealLog[]>([]);
  const [allDeposits, setAllDeposits] = useState<CycleDeposit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvents>({ notices: 0, mealOffRequests: 0, profiles: 0 });
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
    const currentMembersById = new Map([...memberRoster, ...archivedMemberRoster].map((member) => [member.id, member]));
    const snapshotMembers = (snapshot && cycle.status !== 'active' ? snapshot : memberRoster).map((member) => {
      const currentMember = currentMembersById.get(member.id);
      cycleMemberIds.add(member.id);
      return {
        ...member,
        id: member.id,
        name: member.name,
        deposit: 0,
        mealsEaten: 0,
        avatar: toAvatar(member.name, member.avatar),
        createdAt: member.createdAt ?? currentMember?.createdAt,
        deletedAt: member.deletedAt ?? currentMember?.deletedAt,
      };
    });
    const archivedHistoryMembers = archivedMemberRoster
      .filter((member) => cycleHistoryMemberIds.has(member.id) && !cycleMemberIds.has(member.id))
      .map((member) => ({ ...member, deposit: 0, mealsEaten: 0 }));
    return [...snapshotMembers, ...archivedHistoryMembers];
  }, [cycles, memberRoster, archivedMemberRoster, historyMemberIdsByCycle]);

  const computedCycleDetails = useComputedCycleDetails({
    cycles,
    loadedCycleIds,
    membersForCycle: getCycleMembers,
    deposits: allDeposits,
    expenses: allExpenses,
    mealLogs: allMealLogs,
  });

  const fetchCycleRows = useCallback(async (cycleId: string) => {
    if (!userId || !messId) return null;
    return fetchCycleRowsForScope(messId, [cycleId]);
  }, [userId, messId]);

  const fetchCycleRowsForCycles = useCallback(async (cycleIds: string[]) => {
    if (!userId || !messId) return { deposits: [], expenses: [], mealLogs: [] };
    return fetchCycleRowsForScope(messId, cycleIds);
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
    let queuedOperations: OfflineOp[] = [];
    try {
      queuedOperations = (await dequeueAll({ userId, messId })).filter(
        (operation) => operation.status !== 'failed' && operation.status !== 'conflict',
      );
    } catch {
      // Queue access can fail in restricted storage contexts; use the fetched rows.
    }

    let snapshot: MealDataSnapshot | null = null;
    if (navigator.onLine) {
      try {
        snapshot = await readOfflineSnapshot<MealDataSnapshot>(cacheKey);
      } catch {
        // Ignore an unavailable cache and continue with the server request.
      }
      if (snapshot) {
        const snapshotWithQueue = overlayQueuedOperations(snapshot, queuedOperations);
        setMemberRoster(snapshotWithQueue.members);
        setArchivedMemberRoster(snapshotWithQueue.archivedMembers ?? []);
        setCycles(snapshotWithQueue.cycles);
        setAllDeposits(snapshotWithQueue.deposits);
        setAllExpenses(snapshotWithQueue.expenses);
        setAllMealLogs(snapshotWithQueue.mealLogs);
        setAllChangelogEntries(snapshotWithQueue.changelog ?? []);
        setLoadedCycleIds(new Set(snapshotWithQueue.loadedCycleIds ?? []));
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
          const snapshotWithQueue = overlayQueuedOperations(snap, queuedOperations);
          setMemberRoster(snapshotWithQueue.members);
          setArchivedMemberRoster(snapshotWithQueue.archivedMembers ?? []);
          setCycles(snapshotWithQueue.cycles);
          setAllDeposits(snapshotWithQueue.deposits);
          setAllExpenses(snapshotWithQueue.expenses);
          setAllMealLogs(snapshotWithQueue.mealLogs);
          setAllChangelogEntries(snapshotWithQueue.changelog ?? []);
          setLoadedCycleIds(new Set(snapshotWithQueue.loadedCycleIds ?? []));
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
          .select('id, name, avatar, created_at, deleted_at, delete_expires_at, profile_id')
          .eq('mess_id', messId)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase
          .from('cycles')
          .select('id, name, status, started_at, closed_at, finalized_at, members_snapshot, settlement_snapshot')
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
          createdAt: member.created_at ?? null,
          deletedAt: member.deleted_at ?? null,
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
          createdAt: member.created_at ?? null,
          deletedAt: member.deleted_at ?? null,
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
          settlementSnapshot: cycle.settlement_snapshot,
        }));

      const initialCycleIds = nextCycles
        .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
        .map((cycle) => cycle.id);
      const initialRows = await fetchCycleRowsForCycles(initialCycleIds);
      const nextDeposits = initialRows.deposits;
      const nextExpenses = initialRows.expenses;
      const nextMealLogs = initialRows.mealLogs;
      const rowsWithQueue = overlayQueuedOperations({
        deposits: nextDeposits,
        expenses: nextExpenses,
        mealLogs: nextMealLogs,
      }, queuedOperations);

      setMemberRoster(nextMembers);
      setArchivedMemberRoster(nextArchivedMembers);
      setCycles(nextCycles);
      setAllDeposits(rowsWithQueue.deposits);
      setAllExpenses(rowsWithQueue.expenses);
      setAllMealLogs(rowsWithQueue.mealLogs);
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
            const snapshotWithQueue = overlayQueuedOperations(snap, queuedOperations);
            setMemberRoster(snapshotWithQueue.members);
            setArchivedMemberRoster(snapshotWithQueue.archivedMembers ?? []);
            setCycles(snapshotWithQueue.cycles);
            setAllDeposits(snapshotWithQueue.deposits);
            setAllExpenses(snapshotWithQueue.expenses);
            setAllMealLogs(snapshotWithQueue.mealLogs);
            setAllChangelogEntries(snapshotWithQueue.changelog ?? []);
            setLoadedCycleIds(new Set(snapshotWithQueue.loadedCycleIds ?? []));
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
    let timeoutId: number | null = null;
    let idleCallbackId: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const persistSnapshot = () => {
      const pinnedCycles = cycles
        .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const recentCycles = cycles
        .filter((cycle) => cycle.status !== 'active' && cycle.status !== 'pending')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const cachedCycles = [...pinnedCycles, ...recentCycles]
        .slice(0, MAX_OFFLINE_CYCLES)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const cachedCycleIds = new Set(cachedCycles.map((cycle) => cycle.id));

      void writeOfflineSnapshot(cacheKey, {
        members: memberRoster,
        archivedMembers: archivedMemberRoster,
        cycles: cachedCycles,
        deposits: allDeposits.filter((deposit) => cachedCycleIds.has(deposit.cycleId)),
        expenses: allExpenses.filter((expense) => cachedCycleIds.has(expense.cycleId)),
        mealLogs: allMealLogs.filter((mealLog) => cachedCycleIds.has(mealLog.cycleId)),
        changelog: allChangelogEntries.filter((entry) => cachedCycleIds.has(entry.cycleId)),
        loadedCycleIds: Array.from(loadedCycleIds).filter((cycleId) => cachedCycleIds.has(cycleId)),
      }).catch(() => {
        // Cache can be unavailable or over quota; persistence is best-effort.
      });
    };

    if (idleWindow.requestIdleCallback) {
      idleCallbackId = idleWindow.requestIdleCallback(persistSnapshot, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(persistSnapshot, 1000);
    }

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleCallbackId !== null) idleWindow.cancelIdleCallback?.(idleCallbackId);
    };
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

  const notifyRealtimeCollection = useCallback((collection: keyof RealtimeEvents) => {
    setRealtimeEvents((previous) => ({ ...previous, [collection]: previous[collection] + 1 }));
  }, []);

  const applyMemberRealtime = useCallback((payload: RealtimeRowPayload) => {
    const id = String((payload.eventType === 'DELETE' ? payload.old : payload.new).id ?? '');
    if (!id) return;
    if (payload.eventType === 'DELETE') {
      setMemberRoster((rows) => removeById(rows, id));
      setArchivedMemberRoster((rows) => removeById(rows, id));
      return;
    }

    const row = payload.new as unknown as MemberRow & { mess_id?: string };
    if (row.mess_id !== messId) return;
    const member: Member = {
      id: row.id,
      name: row.name,
      deposit: 0,
      mealsEaten: 0,
      avatar: toAvatar(row.name, row.avatar),
      profileId: row.profile_id ?? null,
      createdAt: row.created_at ?? null,
      deletedAt: row.deleted_at ?? null,
      archived: Boolean(row.deleted_at && !row.delete_expires_at),
    };
    if (row.deleted_at) {
      setMemberRoster((rows) => removeById(rows, row.id));
      setArchivedMemberRoster((rows) => upsertById(rows, member));
    } else {
      setArchivedMemberRoster((rows) => removeById(rows, row.id));
      setMemberRoster((rows) => upsertById(rows, member));
    }
  }, [messId]);

  const applyCycleRealtime = useCallback((payload: RealtimeRowPayload) => {
    const id = String((payload.eventType === 'DELETE' ? payload.old : payload.new).id ?? '');
    if (!id) return;
    if (payload.eventType === 'DELETE') {
      setCycles((rows) => removeById(rows, id));
      return;
    }

    const row = payload.new as unknown as CycleRow & { mess_id?: string; deleted_at?: string | null };
    if (row.mess_id !== messId) return;
    if (row.deleted_at) {
      setCycles((rows) => removeById(rows, row.id));
      return;
    }
    const cycle: Cycle = {
      id: row.id,
      name: row.name || getDefaultCycleBaseName(row.started_at),
      status: row.status,
      startedAt: row.started_at,
      closedAt: row.closed_at,
      finalizedAt: row.finalized_at,
      membersSnapshot: row.members_snapshot,
      settlementSnapshot: row.settlement_snapshot,
    };
    setCycles((rows) => upsertById(rows, cycle).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
  }, [messId]);

  const applyCycleRowRealtime = useCallback((table: 'cycle_deposits' | 'expenses' | 'meal_logs', payload: RealtimeRowPayload) => {
    const source = payload.eventType === 'DELETE' ? payload.old : payload.new;
    const id = String(source.id ?? '');
    if (!id) return;
    if (payload.eventType === 'DELETE') {
      if (table === 'cycle_deposits') setAllDeposits((rows) => removeById(rows, id));
      else if (table === 'expenses') setAllExpenses((rows) => removeById(rows, id));
      else setAllMealLogs((rows) => removeById(rows, id));
      return;
    }

    if (table === 'cycle_deposits') {
      const row = payload.new as unknown as CycleDepositRow & { mess_id?: string };
      if (row.mess_id !== messId) return;
      setAllDeposits((rows) => upsertById(rows, mapDepositRows([row])[0]));
    } else if (table === 'expenses') {
      const row = payload.new as unknown as ExpenseRow & { mess_id?: string; deleted_at?: string | null };
      if (row.mess_id !== messId) return;
      if (row.deleted_at) {
        setAllExpenses((rows) => removeById(rows, row.id));
        return;
      }
      setAllExpenses((rows) => upsertById(rows, mapExpenseRows([row])[0]));
    } else {
      const row = payload.new as unknown as MealLogRow & { mess_id?: string };
      if (row.mess_id !== messId) return;
      setAllMealLogs((rows) => upsertById(rows, mapMealLogRows([row])[0]));
    }
  }, [messId]);

  useMealScopeLoader({
    userId,
    messId,
    loadedScopeRef,
    hasLoadedDataRef,
    setLoading,
    clearError: clearDataError,
    load: requestDataLoad,
  });

  React.useEffect(() => {
    if (!userId || !messId) return;

    let refreshTimer: number | null = null;
    let hasSubscribed = false;
    let channelSubscribed = false;
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    const scheduleRecoveryRefresh = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      setRealtimeEvents((previous) => ({
        notices: previous.notices + 1,
        mealOffRequests: previous.mealOffRequests + 1,
        profiles: previous.profiles + 1,
      }));
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadData();
      }, 150);
    };

    const channel = supabase.channel(`meal-data-${userId}-${messId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'members', filter: `mess_id=eq.${messId}`,
      }, (payload) => applyMemberRealtime(payload as unknown as RealtimeRowPayload))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'cycles', filter: `mess_id=eq.${messId}`,
      }, (payload) => applyCycleRealtime(payload as unknown as RealtimeRowPayload));

    channel
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notices', filter: `mess_id=eq.${messId}`,
      }, () => notifyRealtimeCollection('notices'))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'meal_off_requests', filter: `mess_id=eq.${messId}`,
      }, () => notifyRealtimeCollection('mealOffRequests'))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'profiles', filter: `mess_id=eq.${messId}`,
      }, () => notifyRealtimeCollection('profiles'));

    const cycleIds = [activeCycle?.id, pendingCycle?.id].filter((id): id is string => Boolean(id));
    for (const cycleId of cycleIds) {
      for (const table of ['cycle_deposits', 'expenses', 'meal_logs'] as const) {
        channel.on('postgres_changes', {
          event: '*', schema: 'public', table, filter: `cycle_id=eq.${cycleId}`,
        }, (payload) => applyCycleRowRealtime(table, payload as unknown as RealtimeRowPayload));
      }
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (hasSubscribed) scheduleRecoveryRefresh();
        hasSubscribed = true;
        channelSubscribed = true;
      } else {
        channelSubscribed = false;
      }
    });

    const handleOnline = () => {
      if (!channelSubscribed) scheduleRecoveryRefresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      const wasHiddenLongEnough = hiddenAt !== null && Date.now() - hiddenAt > 60_000;
      hiddenAt = null;
      if (wasHiddenLongEnough || !channelSubscribed) scheduleRecoveryRefresh();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, messId, activeCycle?.id, pendingCycle?.id, loadData, applyMemberRealtime, applyCycleRealtime, applyCycleRowRealtime, notifyRealtimeCollection]);

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
    reload: requestDataLoad,
    broadcast: broadcastUpdate,
  });

  const saveMealLogsForReplayRef = useRef<MealActionsContextType["saveMealLogs"]>(async () => {});
  const setPendingSyncIdsRef = useRef<React.Dispatch<React.SetStateAction<Set<string>>>>(() => {});
  const replayOptionsRef = useRef({ userId, messId });
  replayOptionsRef.current = { userId, messId };

  const replayOp = useCallback(async (op: OfflineOp) => {
    const { userId, messId } = replayOptionsRef.current;
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
      const { data, error } = await withRequestTimeout((signal) => supabase
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
        .abortSignal(signal)
        .select()
        .single());
      if (error) throw error;
      setAllExpenses((prev) => [
        { id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by, updatedAt: data.updated_at },
        ...prev.filter((e) => e.id !== op.id),
      ]);
      return;
    }

    if (op.type === 'UPDATE_EXPENSE') {
      const p = op.payload as { id: string; amount: number; description: string; type: string; paidBy: string; date: string; cycleId: string; expected?: { amount: number; description: string; type: string; paidBy: string; date: string; updatedAt?: string } };
      const expenseType = normalizeExpenseType(p.type);
      const { data: current, error: readError } = await withRequestTimeout((signal) => supabase.from('expenses').select('id,amount,description,type,paid_by,date,deleted_at,updated_at').eq('id', p.id).eq('mess_id', messId).abortSignal(signal).maybeSingle());
      if (readError) throw readError;
      if (!current || current.deleted_at) throw new Error('The expense no longer exists. Review or discard this offline change.');
      const alreadyApplied = Number(current.amount) === p.amount && current.description === p.description && current.type === expenseType && current.paid_by === p.paidBy && current.date === p.date;
      if (alreadyApplied) return;
      if (p.expected && (Number(current.amount) !== p.expected.amount || current.description !== p.expected.description || current.type !== normalizeExpenseType(p.expected.type) || current.paid_by !== p.expected.paidBy || current.date !== p.expected.date || (p.expected.updatedAt && current.updated_at !== p.expected.updatedAt))) {
        const conflict = new Error('This expense changed on another device. Review it before applying your offline edit.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      const { data: updated, error } = await withRequestTimeout((signal) => supabase.from('expenses').update({ amount: p.amount, description: p.description, type: expenseType, paid_by: p.paidBy, date: p.date }).eq('id', p.id).eq('mess_id', messId).eq('updated_at', current.updated_at).abortSignal(signal).select('id, updated_at').maybeSingle());
      if (error) throw error;
      if (!updated) {
        const conflict = new Error('This expense changed on another device. Review it before applying this offline edit.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      setAllExpenses((prev) => prev.map((expense) => expense.id === p.id ? { ...expense, amount: p.amount, description: p.description, type: expenseType, paidBy: p.paidBy, date: p.date, updatedAt: updated.updated_at } : expense));
      setPendingSyncIdsRef.current((prev) => { const next = new Set(prev); next.delete(p.id); return next; });
      return;
    }

    if (op.type === 'DELETE_EXPENSE') {
      const p = op.payload as { id: string; cycleId: string; description: string; amount: number; type: string; paidBy: string; date: string; updatedAt?: string; expected?: { amount: number; description: string; type: string; paidBy: string; date: string; updatedAt?: string } };
      const { data: current, error: readError } = await withRequestTimeout((signal) => supabase.from('expenses').select('id,amount,description,type,paid_by,date,deleted_at,updated_at').eq('id', p.id).eq('mess_id', messId).abortSignal(signal).maybeSingle());
      if (readError) throw readError;
      if (!current) throw new Error('The expense no longer exists. Review or discard this offline deletion.');
      if (current.deleted_at) return;
      if (p.expected && (Number(current.amount) !== p.expected.amount || current.description !== p.expected.description || current.type !== normalizeExpenseType(p.expected.type) || current.paid_by !== p.expected.paidBy || current.date !== p.expected.date || (p.expected.updatedAt && current.updated_at !== p.expected.updatedAt))) {
        const conflict = new Error('This expense changed on another device. Review it before applying your offline deletion.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      const now = new Date();
      const { data: deleted, error } = await withRequestTimeout((signal) => supabase.from('expenses').update({ deleted_at: now.toISOString(), delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString() }).eq('id', p.id).eq('mess_id', messId).eq('updated_at', current.updated_at).is('deleted_at', null).abortSignal(signal).select('id').maybeSingle());
      if (error) throw error;
      if (!deleted) {
        const conflict = new Error('This expense changed on another device. Review it before applying this offline deletion.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      return;
    }

    if (op.type === 'ADD_DEPOSIT') {
      const p = op.payload as {
        recordId?: string; memberId: string; amount: number; kind?: DepositKind; cycleId: string; note: string | null; userId: string; messId: string;
      };
      const { data, error } = await withRequestTimeout((signal) => supabase
        .from('cycle_deposits')
        .upsert([{
          id: p.recordId ?? op.id.slice('offline-'.length),
          member_id: p.memberId,
          cycle_id: p.cycleId,
          amount: p.amount,
          kind: p.kind ?? (p.amount < 0 ? 'refund' : 'deposit'),
          note: p.note,
          user_id: userId,
          mess_id: messId,
        }], { onConflict: 'id' })
        .abortSignal(signal)
        .select()
        .single());
      if (error) throw error;
      setAllDeposits((prev) => [
        ...prev.filter((d) => d.id !== op.id),
        { id: data.id, cycleId: data.cycle_id, memberId: data.member_id, amount: Number(data.amount), kind: data.kind, note: data.note ?? undefined, createdAt: data.created_at },
      ]);
      void triggerDepositPush({ depositId: data.id });
      return;
    }

    if (op.type === 'ADD_MEAL_LOG') {
      const p = op.payload as {
        entries: Array<{ memberId: string; count: number }>;
        expected?: Array<{ memberId: string; count: number; updatedAt?: string; exists: boolean }>;
        dateStr: string; cycleId: string; userId: string; messId: string;
      };
      await saveMealLogsForReplayRef.current(p.entries, p.dateStr, p.cycleId, p.expected);
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
    broadcast: broadcastUpdate,
  });

  const mealLogActions = useMealLogs({
    userId,
    messId,
    mealLogs: allMealLogs,
    setMealLogs: setAllMealLogs,
    setPendingSyncIds,
    getCycleId: getRequiredCycleId,
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

  const rowsValue = useMemo<MealRowsData>(() => ({ expenses, deposits, mealLogs }), [expenses, deposits, mealLogs]);
  const cyclesValue = useMemo<MealCyclesData>(() => ({
    cycles,
    activeCycle,
    pendingCycle,
  }), [cycles, activeCycle, pendingCycle]);
  const cycleDetailsValue = useMemo<MealCycleDetailsData>(() => ({
    getCycleDetails: computedCycleDetails.getCycleDetails,
    isCycleDetailsLoading: cycleLoader.isLoading,
    getCycleDetailsError: cycleLoader.getError,
    revision: computedCycleDetails.cycleDetailsById,
  // Cycle detail consumers need to re-render when cached details change, while
  // navigation and cycle list consumers stay isolated from meal-row updates.
  }), [computedCycleDetails.getCycleDetails, computedCycleDetails.cycleDetailsById, cycleLoader.isLoading, cycleLoader.getError]);
  const membersValue = useMemo<MealMembersData>(() => ({
    members,
    archivedMembers: archivedMemberRoster.filter((member) => member.archived),
    getMemberStats,
  }), [members, archivedMemberRoster, getMemberStats]);
  const statsValue = useMemo<MealStatsData>(() => ({ stats }), [stats]);
  const statusValue = useMemo<MealStatusData>(() => ({
    loading,
    initialLoading: loading && !hasLoadedDataRef.current,
    refreshing,
    pendingSyncIds,
    failedSyncOps,
    dataError,
  }), [loading, refreshing, pendingSyncIds, failedSyncOps, dataError]);
  const changelogValue = useMemo<MealChangelogData>(() => ({
    activeCycleChangelogEntries,
    pendingCycleChangelogEntries,
    changelogEntries: allChangelogEntries,
    hasMoreChangelogEntries,
    changelogLoading,
  }), [activeCycleChangelogEntries, pendingCycleChangelogEntries, allChangelogEntries, hasMoreChangelogEntries, changelogLoading]);

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
    <RealtimeEventsContext.Provider value={realtimeEvents}>
      <MealActionsContext.Provider value={actionsValue}>
        <MealRowsContext.Provider value={rowsValue}>
            <MealCyclesContext.Provider value={cyclesValue}>
              <MealCycleDetailsContext.Provider value={cycleDetailsValue}>
                <MealMembersContext.Provider value={membersValue}>
                  <MealStatsContext.Provider value={statsValue}>
                    <MealStatusContext.Provider value={statusValue}>
                      <MealChangelogContext.Provider value={changelogValue}>
                        {children}
                      </MealChangelogContext.Provider>
                    </MealStatusContext.Provider>
                  </MealStatsContext.Provider>
                </MealMembersContext.Provider>
              </MealCycleDetailsContext.Provider>
            </MealCyclesContext.Provider>
        </MealRowsContext.Provider>
      </MealActionsContext.Provider>
    </RealtimeEventsContext.Provider>
  );
}

function requireMealContext<T>(context: T | undefined, name: string): T {
  if (context === undefined) throw new Error(`${name} must be used within a MealProvider`);
  return context;
}

export const useMealRows = () => requireMealContext(useContext(MealRowsContext), 'useMealRows');
export const useMealCycles = () => requireMealContext(useContext(MealCyclesContext), 'useMealCycles');
export const useCycleDetails = () => requireMealContext(useContext(MealCycleDetailsContext), 'useCycleDetails');
export const useMealMembers = () => requireMealContext(useContext(MealMembersContext), 'useMealMembers');
export const useMealStats = () => requireMealContext(useContext(MealStatsContext), 'useMealStats');
export const useMealStatus = () => requireMealContext(useContext(MealStatusContext), 'useMealStatus');
export const useMealChangelog = () => requireMealContext(useContext(MealChangelogContext), 'useMealChangelog');

export function useRealtimeEvents() {
  const context = useContext(RealtimeEventsContext);
  if (context === undefined) throw new Error('useRealtimeEvents must be used within a MealProvider');
  return context;
}

export function useMealActions() {
  const context = useContext(MealActionsContext);
  if (context === undefined) {
    throw new Error('useMealActions must be used within a MealProvider');
  }
  return context;
}
