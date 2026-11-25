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
export type MealOffRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
export type MealPeriod = 'all_day' | 'lunch' | 'dinner';
export type MealOffRequest = {
  id: string;
  mess_id: string;
  cycle_id: string;
  member_id: string;
  requested_by_profile_id: string;
  start_date: string;
  end_date: string;
  meal_period: MealPeriod;
  status: MealOffRequestStatus;
  note: string | null;
  created_at: string;
};
type MealOffRequestsData = {
  requests: MealOffRequest[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
};
const MealOffRequestsContext = createContext<MealOffRequestsData | undefined>(undefined);
type BootstrapNotice = { id: string; title: string; content: string; expires_at: string; created_at: string } | null;
type MealBootstrapData = { scopeKey: string | null; notice: BootstrapNotice; revision: number };
const MealBootstrapContext = createContext<MealBootstrapData | undefined>(undefined);
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
  joined_at?: string | null;
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
  paid_by_member_id?: string | null;
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

type MessBootstrapPayload = {
  members: MemberRow[];
  cycles: CycleRow[];
  deposits: CycleDepositRow[];
  expenses: ExpenseRow[];
  meal_logs: MealLogRow[];
  notice: BootstrapNotice;
  meal_off_requests: MealOffRequest[];
  sync_time?: string;
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
  syncAt?: string;
};

type RealtimeRowPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};
type CycleRowTable = 'cycle_deposits' | 'expenses' | 'meal_logs';
type CycleRowRealtimeEvent = { table: CycleRowTable; payload: RealtimeRowPayload };

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
      paidByMemberId: expense.paid_by_member_id ?? null,
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
        paidBy: string; paidByMemberId?: string | null; date: string; cycleId: string;
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
        paidByMemberId: item.paidByMemberId ?? null,
      };
      if (existingIndex >= 0) expenses[existingIndex] = optimisticExpense;
      else expenses.unshift(optimisticExpense);
    } else if (operation.type === 'UPDATE_EXPENSE') {
      const item = payload as {
        id: string; amount: number; description: string; type: string;
        paidBy: string; paidByMemberId?: string | null; date: string; cycleId: string;
      };
      expenses = expenses.map((expense) => expense.id === item.id ? {
        ...expense,
        amount: Number(item.amount),
        description: item.description,
        type: normalizeExpenseType(item.type),
        paidBy: item.paidBy,
        paidByMemberId: item.paidByMemberId ?? null,
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

async function fetchCycleRowsForScope(
  messId: string,
  cycleIds: string[] | null,
  changedAfter?: string | null,
  previousCycleIds: string[] = [],
) {
  const { data, error } = await supabase.rpc('fetch_cycle_rows_for_scope', {
    mess_id_input: messId,
    cycle_ids_input: cycleIds,
    changed_after_input: changedAfter ?? null,
    previous_cycle_ids_input: previousCycleIds,
  });
  if (error) throw error;
  const rows = (data ?? {}) as unknown as {
    deposits: CycleDepositRow[];
    expenses: ExpenseRow[];
    meal_logs: MealLogRow[];
    deleted_expense_ids: string[];
    members?: MemberRow[];
    cycles?: CycleRow[];
    notice?: BootstrapNotice;
    meal_off_requests?: MealOffRequest[];
    sync_time?: string;
  };

  return {
    deposits: mapDepositRows(rows.deposits ?? []),
    expenses: mapExpenseRows(rows.expenses ?? []),
    mealLogs: mapMealLogRows(rows.meal_logs ?? []),
    deletedExpenseIds: rows.deleted_expense_ids ?? [],
    members: rows.members,
    cycles: rows.cycles,
    notice: rows.notice,
    mealOffRequests: rows.meal_off_requests,
    syncAt: rows.sync_time,
  };
}

function mapMemberRows(memberRows: MemberRow[]) {
  const mapMember = (member: MemberRow): Member => ({
    id: member.id,
    name: member.name,
    deposit: 0,
    mealsEaten: 0,
    avatar: toAvatar(member.name, member.avatar),
    profileId: member.profile_id ?? null,
    createdAt: member.created_at ?? null,
    joinedAt: member.joined_at ?? member.created_at ?? null,
    deletedAt: member.deleted_at ?? null,
  });
  return {
    members: memberRows.filter((member) => !member.deleted_at).map(mapMember),
    archivedMembers: memberRows.filter((member) => Boolean(member.deleted_at)).map((member) => ({
      ...mapMember(member), archived: !member.delete_expires_at,
    })),
  };
}

async function ensureMemberJoinDates(messId: string, memberRows: MemberRow[]): Promise<MemberRow[]> {
  if (memberRows.length === 0 || memberRows.every((member) => member.joined_at != null)) return memberRows;
  const { data, error } = await supabase
    .from('members')
    .select('id, joined_at')
    .eq('mess_id', messId);
  if (error) throw error;
  const joinedAtById = new Map((data ?? []).map((member) => [member.id, member.joined_at]));
  return memberRows.map((member) => ({
    ...member,
    joined_at: joinedAtById.get(member.id) ?? member.created_at ?? null,
  }));
}

function mapCycleRows(cycleRows: CycleRow[]): Cycle[] {
  return cycleRows.map((cycle) => ({
    id: cycle.id,
    name: cycle.name || getDefaultCycleBaseName(cycle.started_at),
    status: cycle.status,
    startedAt: cycle.started_at,
    closedAt: cycle.closed_at,
    finalizedAt: cycle.finalized_at,
    membersSnapshot: cycle.members_snapshot,
    settlementSnapshot: cycle.settlement_snapshot,
  }));
}

function mergeRowsById<T extends { id: string }>(current: T[], changed: T[]): T[] {
  if (!changed.length) return current;
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of changed) rows.set(row.id, row);
  return Array.from(rows.values());
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
  const currentOpenCycleIdsRef = useRef<string[]>([]);
  currentOpenCycleIdsRef.current = cycles
    .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
    .map((cycle) => cycle.id);
  const [mealOffRequests, setMealOffRequests] = useState<MealOffRequest[]>([]);
  const [mealOffRequestsLoading, setMealOffRequestsLoading] = useState(true);
  const [mealOffRequestsError, setMealOffRequestsError] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvents>({ notices: 0, mealOffRequests: 0, profiles: 0 });
  const recentRealtimeWritesRef = useRef(new Map<string, { version: string; expiresAt: number }>());
  const cycleRowEventsRef = useRef<CycleRowRealtimeEvent[]>([]);
  const cycleRowFrameRef = useRef<number | null>(null);
  const [bootstrapNotice, setBootstrapNotice] = useState<BootstrapNotice>(null);
  const [bootstrapScopeKey, setBootstrapScopeKey] = useState<string | null>(null);
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const lastSyncAtRef = useRef<string | null>(null);
  const mealOffBootstrapScopeRef = useRef<string | null>(null);
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
    let active = true;
    if (!messId) {
      mealOffBootstrapScopeRef.current = null;
      setMealOffRequests([]);
      setMealOffRequestsLoading(false);
      setMealOffRequestsError(null);
      return () => { active = false; };
    }

    const scopeKey = `${userId}:${messId}`;
    if (mealOffBootstrapScopeRef.current !== scopeKey) {
      mealOffBootstrapScopeRef.current = scopeKey;
      setMealOffRequests([]);
      setMealOffRequestsLoading(true);
      setMealOffRequestsError(null);
      return () => { active = false; };
    }

    setMealOffRequestsError(null);
    void supabase
      .from('meal_off_requests')
      .select('id, mess_id, cycle_id, member_id, requested_by_profile_id, start_date, end_date, meal_period, status, note, created_at')
      .eq('mess_id', messId)
      .in('status', ['pending', 'approved'])
      .order('start_date', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Failed to load shared meal-off requests:', error);
          setMealOffRequestsError(error.message);
          setMealOffRequests([]);
        } else {
          setMealOffRequests((data ?? []) as MealOffRequest[]);
        }
        setMealOffRequestsLoading(false);
      });

    return () => { active = false; };
  }, [userId, messId, realtimeEvents.mealOffRequests]);

  const mealOffRequestsValue = useMemo<MealOffRequestsData>(() => ({
    requests: mealOffRequests,
    pendingCount: mealOffRequests.filter((request) => request.status === 'pending').length,
    loading: mealOffRequestsLoading,
    error: mealOffRequestsError,
  }), [mealOffRequests, mealOffRequestsLoading, mealOffRequestsError]);

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
        joinedAt: member.joinedAt ?? (cycle.status === 'active' ? currentMember?.joinedAt : undefined),
        deletedAt: member.deletedAt ?? currentMember?.deletedAt,
      };
    });
    const archivedHistoryMembers = archivedMemberRoster
      .filter((member) => cycleHistoryMemberIds.has(member.id) && !cycleMemberIds.has(member.id))
      .map((member) => ({
        ...member,
        joinedAt: cycle.status === 'active' ? member.joinedAt : undefined,
        deposit: 0,
        mealsEaten: 0,
      }));
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
        lastSyncAtRef.current = snapshotWithQueue.syncAt ?? null;
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
            syncAt?: string;
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
          lastSyncAtRef.current = snapshotWithQueue.syncAt ?? null;
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

      const { data, error } = await supabase.rpc('get_mess_bootstrap');
      if (error) throw error;
      const bootstrap = (data ?? {}) as unknown as MessBootstrapPayload;
      const memberRows = await ensureMemberJoinDates(messId, bootstrap.members ?? []);
      const { members: nextMembers, archivedMembers: nextArchivedMembers } = mapMemberRows(memberRows);
      const nextCycles = mapCycleRows(bootstrap.cycles ?? []);

      const initialCycleIds = nextCycles
        .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
        .map((cycle) => cycle.id);
      const nextDeposits = mapDepositRows(bootstrap.deposits ?? []);
      const nextExpenses = mapExpenseRows(bootstrap.expenses ?? []);
      const nextMealLogs = mapMealLogRows(bootstrap.meal_logs ?? []);
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
      setMealOffRequests(bootstrap.meal_off_requests ?? []);
      mealOffBootstrapScopeRef.current = `${userId}:${messId}`;
      setMealOffRequestsError(null);
      setMealOffRequestsLoading(false);
      setBootstrapNotice(bootstrap.notice ?? null);
      setBootstrapScopeKey(`${userId}:${messId}`);
      setBootstrapRevision((revision) => revision + 1);
      lastSyncAtRef.current = bootstrap.sync_time ?? lastSyncAtRef.current;
      setDataError(null);
      hasLoadedDataRef.current = true;

    } catch (error) {
      console.error('Error loading data:', error);
      setMealOffRequestsError(error instanceof Error ? error.message : 'Unable to load meal-off requests.');
      setMealOffRequestsLoading(false);

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
              syncAt?: string;
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
            lastSyncAtRef.current = snapshotWithQueue.syncAt ?? null;
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
  }, [userId, messId, setAllChangelogEntries]);

  const syncAfterRealtimeGap = useCallback(async () => {
    if (!userId || !messId || !navigator.onLine || !hasLoadedDataRef.current) return;
    try {
      const previousSyncAt = lastSyncAtRef.current;
      // A short overlap catches transactions that began before the previous
      // snapshot but committed after it. Merging by ID makes replay harmless.
      const changedAfter = previousSyncAt
        ? new Date(Date.parse(previousSyncAt) - 30_000).toISOString()
        : null;
      const result = await fetchCycleRowsForScope(messId, null, changedAfter, currentOpenCycleIdsRef.current);
      const memberRows = await ensureMemberJoinDates(messId, result.members ?? []);
      const nextCycles = mapCycleRows(result.cycles ?? []);
      const validCycleIds = new Set(nextCycles.map((cycle) => cycle.id));
      const currentRowCycleIds = new Set(nextCycles
        .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
        .map((cycle) => cycle.id));
      const queuedOperations = (await dequeueAll({ userId, messId })).filter(
        (operation) => operation.status !== 'failed' && operation.status !== 'conflict',
      );
      const mergeCurrent = <T extends { id: string; cycleId: string }>(
        current: T[], changed: T[], deletedIds: string[] = [],
      ) => {
        const retained = current.filter((row) => validCycleIds.has(row.cycleId) && !deletedIds.includes(row.id));
        const base = changedAfter
          ? retained
          : retained.filter((row) => !currentRowCycleIds.has(row.cycleId));
        return mergeRowsById(base, changed).filter((row) => validCycleIds.has(row.cycleId));
      };

      setMemberRoster(mapMemberRows(memberRows).members);
      setArchivedMemberRoster(mapMemberRows(memberRows).archivedMembers);
      setCycles(nextCycles);
      setAllDeposits((current) => overlayQueuedOperations({
        deposits: mergeCurrent(current, result.deposits), expenses: [], mealLogs: [],
      }, queuedOperations).deposits);
      setAllExpenses((current) => overlayQueuedOperations({
        deposits: [], expenses: mergeCurrent(current, result.expenses, result.deletedExpenseIds), mealLogs: [],
      }, queuedOperations).expenses);
      setAllMealLogs((current) => overlayQueuedOperations({
        deposits: [], expenses: [], mealLogs: mergeCurrent(current, result.mealLogs),
      }, queuedOperations).mealLogs);
      setLoadedCycleIds((current) => {
        const next = new Set(Array.from(current).filter((id) => validCycleIds.has(id)));
        currentRowCycleIds.forEach((id) => next.add(id));
        return next;
      });
      setMealOffRequests(result.mealOffRequests ?? []);
      mealOffBootstrapScopeRef.current = `${userId}:${messId}`;
      setMealOffRequestsError(null);
      setMealOffRequestsLoading(false);
      setBootstrapNotice(result.notice ?? null);
      setBootstrapScopeKey(`${userId}:${messId}`);
      setBootstrapRevision((revision) => revision + 1);
      lastSyncAtRef.current = result.syncAt ?? null;
      setRealtimeEvents((previous) => ({ ...previous, profiles: previous.profiles + 1 }));
    } catch (error) {
      // Recovery is best effort; Realtime and the cached view remain usable.
      console.error('Unable to sync changes after reconnect:', error);
    }
  }, [userId, messId]);

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
        syncAt: lastSyncAtRef.current ?? undefined,
      }).catch(() => {
        // Cache can be unavailable or over quota; persistence is best-effort.
      });
    };

    // Let rapid row updates (especially realtime bursts) settle before
    // structured-cloning the full offline snapshot. Then persist during idle,
    // with a bounded wait so a busy tab still saves it soon afterward.
    timeoutId = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) {
        idleCallbackId = idleWindow.requestIdleCallback(persistSnapshot, { timeout: 1000 });
      } else {
        persistSnapshot();
      }
    }, 2000);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleCallbackId !== null) idleWindow.cancelIdleCallback?.(idleCallbackId);
    };
  }, [userId, messId, memberRoster, archivedMemberRoster, cycles, allDeposits, allExpenses, allMealLogs, allChangelogEntries, loadedCycleIds, bootstrapRevision]);

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
      joinedAt: row.joined_at ?? row.created_at ?? null,
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

  const markRealtimeWrite = useCallback((table: CycleRowTable, id: string, version: string | undefined) => {
    if (!version) return;
    const writes = recentRealtimeWritesRef.current;
    const now = Date.now();
    for (const [key, marker] of Array.from(writes.entries())) if (marker.expiresAt <= now) writes.delete(key);
    writes.set(`${table}:${id}`, { version, expiresAt: now + 10_000 });
  }, []);

  const applyCycleRowRealtimeBatch = useCallback((batch: CycleRowRealtimeEvent[]) => {
    const now = Date.now();
    for (const [key, marker] of Array.from(recentRealtimeWritesRef.current.entries())) {
      if (marker.expiresAt <= now) recentRealtimeWritesRef.current.delete(key);
    }
    const changes: {
      cycle_deposits: Map<string, CycleDeposit | null>;
      expenses: Map<string, Expense | null>;
      meal_logs: Map<string, MealLog | null>;
    } = {
      cycle_deposits: new Map(),
      expenses: new Map(),
      meal_logs: new Map(),
    };

    for (const { table, payload } of batch) {
      const source = payload.eventType === 'DELETE' ? payload.old : payload.new;
      const id = String(source.id ?? '');
      if (!id) continue;
      if (table === 'meal_logs') {
        const markerKey = `${table}:${id}`;
        const marker = recentRealtimeWritesRef.current.get(markerKey);
        const version = String(source.updated_at ?? '');
        if (marker && marker.expiresAt > Date.now() && marker.version === version) {
          recentRealtimeWritesRef.current.delete(markerKey);
          continue;
        }
        if (marker && marker.expiresAt <= Date.now()) recentRealtimeWritesRef.current.delete(markerKey);
      }
      if (payload.eventType === 'DELETE') {
        changes[table].set(id, null);
        continue;
      }

      if (table === 'cycle_deposits') {
        const row = payload.new as unknown as CycleDepositRow & { mess_id?: string };
        if (row.mess_id !== messId) continue;
        changes.cycle_deposits.set(id, mapDepositRows([row])[0]);
      } else if (table === 'expenses') {
        const row = payload.new as unknown as ExpenseRow & { mess_id?: string; deleted_at?: string | null };
        if (row.mess_id !== messId) continue;
        changes.expenses.set(id, row.deleted_at ? null : mapExpenseRows([row])[0]);
      } else {
        const row = payload.new as unknown as MealLogRow & { mess_id?: string };
        if (row.mess_id !== messId) continue;
        changes.meal_logs.set(id, mapMealLogRows([row])[0]);
      }
    }

    const applyChanges = <T extends { id: string }>(previous: T[], updates: Map<string, T | null>) => {
      if (!updates.size) return previous;
      const byId = new Map(previous.map((row) => [row.id, row]));
      let changed = false;
      for (const [id, row] of Array.from(updates.entries())) {
        if (row === null) {
          changed = byId.delete(id) || changed;
          continue;
        }
        const current = byId.get(id);
        if (current && JSON.stringify(current) === JSON.stringify(row)) continue;
        byId.set(id, row);
        changed = true;
      }
      return changed ? Array.from(byId.values()) : previous;
    };

    setAllDeposits((previous) => applyChanges(previous, changes.cycle_deposits));
    setAllExpenses((previous) => applyChanges(previous, changes.expenses));
    setAllMealLogs((previous) => applyChanges(previous, changes.meal_logs));
  }, [messId]);

  const enqueueCycleRowRealtime = useCallback((table: CycleRowTable, payload: RealtimeRowPayload) => {
    cycleRowEventsRef.current.push({ table, payload });
    if (cycleRowFrameRef.current !== null) return;
    cycleRowFrameRef.current = window.requestAnimationFrame(() => {
      cycleRowFrameRef.current = null;
      const batch = cycleRowEventsRef.current;
      cycleRowEventsRef.current = [];
      applyCycleRowRealtimeBatch(batch);
    });
  }, [applyCycleRowRealtimeBatch]);

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
      setRealtimeEvents((previous) => ({ ...previous, profiles: previous.profiles + 1 }));
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void syncAfterRealtimeGap();
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
        }, (payload) => enqueueCycleRowRealtime(table, payload as unknown as RealtimeRowPayload));
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
      if (cycleRowFrameRef.current !== null) {
        window.cancelAnimationFrame(cycleRowFrameRef.current);
        cycleRowFrameRef.current = null;
        const pendingBatch = cycleRowEventsRef.current;
        cycleRowEventsRef.current = [];
        if (pendingBatch.length) applyCycleRowRealtimeBatch(pendingBatch);
      }
      void supabase.removeChannel(channel);
    };
  }, [userId, messId, activeCycle?.id, pendingCycle?.id, syncAfterRealtimeGap, applyMemberRealtime, applyCycleRealtime, applyCycleRowRealtimeBatch, enqueueCycleRowRealtime, notifyRealtimeCollection]);

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
        recordId?: string; paidBy: string; paidByMemberId?: string | null; date: string; userId: string; messId: string; cycleId: string;
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
          paid_by_member_id: p.paidByMemberId ?? null,
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
        { id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by, paidByMemberId: data.paid_by_member_id, updatedAt: data.updated_at },
        ...prev.filter((e) => e.id !== op.id),
      ]);
      return;
    }

    if (op.type === 'UPDATE_EXPENSE') {
      const p = op.payload as { id: string; amount: number; description: string; type: string; paidBy: string; paidByMemberId?: string | null; date: string; cycleId: string; expected?: { amount: number; description: string; type: string; paidBy: string; paidByMemberId?: string | null; date: string; updatedAt?: string } };
      const expenseType = normalizeExpenseType(p.type);
      const { data: current, error: readError } = await withRequestTimeout((signal) => supabase.from('expenses').select('id,amount,description,type,paid_by,paid_by_member_id,date,deleted_at,updated_at').eq('id', p.id).eq('mess_id', messId).abortSignal(signal).maybeSingle());
      if (readError) throw readError;
      if (!current || current.deleted_at) throw new Error('The expense no longer exists. Review or discard this offline change.');
      const alreadyApplied = Number(current.amount) === p.amount && current.description === p.description && current.type === expenseType && current.paid_by === p.paidBy && current.paid_by_member_id === (p.paidByMemberId ?? null) && current.date === p.date;
      if (alreadyApplied) return;
      if (p.expected && (Number(current.amount) !== p.expected.amount || current.description !== p.expected.description || current.type !== normalizeExpenseType(p.expected.type) || current.paid_by !== p.expected.paidBy || current.paid_by_member_id !== (p.expected.paidByMemberId ?? null) || current.date !== p.expected.date || (p.expected.updatedAt && current.updated_at !== p.expected.updatedAt))) {
        const conflict = new Error('This expense changed on another device. Review it before applying your offline edit.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      const { data: updated, error } = await withRequestTimeout((signal) => supabase.from('expenses').update({ amount: p.amount, description: p.description, type: expenseType, paid_by: p.paidBy, paid_by_member_id: p.paidByMemberId ?? null, date: p.date }).eq('id', p.id).eq('mess_id', messId).eq('updated_at', current.updated_at).abortSignal(signal).select('id, updated_at').maybeSingle());
      if (error) throw error;
      if (!updated) {
        const conflict = new Error('This expense changed on another device. Review it before applying this offline edit.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      setAllExpenses((prev) => prev.map((expense) => expense.id === p.id ? { ...expense, amount: p.amount, description: p.description, type: expenseType, paidBy: p.paidBy, paidByMemberId: p.paidByMemberId ?? null, date: p.date, updatedAt: updated.updated_at } : expense));
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

  const afterOfflineSync = useCallback((discardedOperation?: OfflineOp) => {
    void broadcastSharedUpdate();
    if (!discardedOperation || !userId || !messId) return;
    const cycleId = String(discardedOperation.payload.cycleId ?? '');
    if (!cycleId) return;
    void (async () => {
      try {
        const rows = await fetchCycleRowsForScope(messId, [cycleId]);
        const pending = (await dequeueAll({ userId, messId })).filter(
          (operation) => operation.status !== 'failed' && operation.status !== 'conflict',
        );
        setAllDeposits((current) => overlayQueuedOperations({
          deposits: [...current.filter((row) => row.cycleId !== cycleId), ...rows.deposits], expenses: [], mealLogs: [],
        }, pending).deposits);
        setAllExpenses((current) => overlayQueuedOperations({
          deposits: [], expenses: [...current.filter((row) => row.cycleId !== cycleId), ...rows.expenses], mealLogs: [],
        }, pending).expenses);
        setAllMealLogs((current) => overlayQueuedOperations({
          deposits: [], expenses: [], mealLogs: [...current.filter((row) => row.cycleId !== cycleId), ...rows.mealLogs],
        }, pending).mealLogs);
      } catch (error) {
        console.error('Unable to refresh the discarded offline change:', error);
      }
    })();
  }, [messId, userId]);

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
    markRealtimeWrite,
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
    setMembers: setMemberRoster,
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
    evictCycleDetails: cycleLoader.evictCycleDetails,
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
    cycleLoader.evictCycleDetails,
    loadMoreChangelogEntries,
    triggerSync,
    retryFailedSync,
    discardFailedSync,
    retryLoadData,
  ]);

  return (
    <MealBootstrapContext.Provider value={{ scopeKey: bootstrapScopeKey, notice: bootstrapNotice, revision: bootstrapRevision }}>
    <MealOffRequestsContext.Provider value={mealOffRequestsValue}>
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
    </MealOffRequestsContext.Provider>
    </MealBootstrapContext.Provider>
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

export function useMealOffRequests() {
  return requireMealContext(useContext(MealOffRequestsContext), 'useMealOffRequests');
}

export function useMealBootstrap() {
  return requireMealContext(useContext(MealBootstrapContext), 'useMealBootstrap');
}

export function useMealActions() {
  const context = useContext(MealActionsContext);
  if (context === undefined) {
    throw new Error('useMealActions must be used within a MealProvider');
  }
  return context;
}
