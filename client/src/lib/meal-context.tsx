import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';
import {
  enqueue,
  dequeueAll,
  removeFromQueue,
  getPendingIds,
  type OfflineOp,
} from './offline-queue';

export interface Member {
  id: string;
  name: string;
  deposit: number;
  mealsEaten: number;
  avatar?: string;
  profileId?: string | null;
  hasPendingDeposit?: boolean;
}

export interface Expense {
  id: string;
  cycleId: string;
  amount: number;
  description: string;
  type: 'meal' | 'fixed';
  date: string;
  paidBy: string;
}

export interface MealLog {
  id: string;
  cycleId: string;
  date: string;
  memberId: string;
  count: number;
}

export interface CycleDeposit {
  id: string;
  cycleId: string;
  memberId: string;
  amount: number;
  note?: string;
  createdAt: string;
}

export type CycleStatus = 'active' | 'pending' | 'closed';
export type ChangelogEntityType = 'member' | 'expense' | 'meal_log' | 'deposit';
export type ChangelogAction = 'create' | 'update' | 'delete';

type ChangelogValue = string | number | boolean | null;

export interface ChangelogChange {
  field: string;
  label: string;
  value?: ChangelogValue;
  from?: ChangelogValue;
  to?: ChangelogValue;
}

export interface ChangelogActor {
  id: string;
  name: string;
  pictureUrl?: string | null;
  role?: 'manager' | 'coordinator' | 'member' | null;
}

export interface ChangelogEntry {
  id: string;
  cycleId: string;
  entityType: ChangelogEntityType;
  entityId: string;
  action: ChangelogAction;
  title: string;
  changes: ChangelogChange[];
  createdAt: string;
  actor?: ChangelogActor | null;
}

export interface Cycle {
  id: string;
  name: string;
  status: CycleStatus;
  startedAt: string;
  closedAt?: string | null;
  finalizedAt?: string | null;
  membersSnapshot?: SnapshotMember[] | null;
}

type SnapshotMember = {
  id: string;
  name: string;
  avatar?: string;
};

export interface CycleDetails {
  cycle: Cycle;
  stats: {
    totalDeposits: number;
    totalMealExpenses: number;
    totalFixedExpenses: number;
    totalMealsConsumed: number;
    currentMealRate: number;
    fixedCostPerMember: number;
    remainingCash: number;
  };
  members: (Member & { mealCost: number; fixedCost: number; totalCost: number; balance: number })[];
  expenses: Expense[];
  mealLogs: MealLog[];
  deposits: CycleDeposit[];
}

interface MealContextType {
  members: Member[];
  expenses: Expense[];
  deposits: CycleDeposit[];
  mealLogs: MealLog[];
  cycles: Cycle[];
  activeCycleChangelogEntries: ChangelogEntry[];
  pendingCycleChangelogEntries: ChangelogEntry[];
  changelogEntries: ChangelogEntry[];
  hasMoreChangelogEntries: boolean;
  changelogLoading: boolean;
  activeCycle: Cycle | null;
  pendingCycle: Cycle | null;
  loading: boolean;
  addMember: (name: string) => Promise<void>;
  updateMember: (id: string, updates: Partial<Member>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  restoreMember: (id: string) => Promise<void>;
  reorderMembers: (memberIds: string[]) => Promise<void>;
  addExpense: (amount: number, description: string, type: 'meal' | 'fixed', paidBy: string, cycleId?: string, expenseDate?: string) => Promise<void>;
  updateExpense: (id: string, updates: {
    amount: number;
    description: string;
    type: 'meal' | 'fixed';
    paidBy: string;
    date?: string;
  }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (id: string) => Promise<void>;
  addDeposit: (memberId: string, amount: number, cycleId?: string, note?: string) => Promise<void>;
  saveMealLogs: (entries: Array<{ memberId: string; count: number }>, date: string, cycleId?: string) => Promise<void>;
  logMeal: (memberId: string, count: number, date: string, cycleId?: string) => Promise<void>;
  renameActiveCycle: (name: string) => Promise<void>;
  /** Closes the active cycle (moves it to pending). Does NOT auto-start a new cycle. */
  closeActiveCycle: () => Promise<void>;
  /** Creates a new active cycle. Only callable when there is no current active cycle. */
  startNewCycle: (name: string, startedAt?: string) => Promise<void>;
  /** Suggests a default cycle name based on the given date and existing cycles. */
  suggestCycleName: (date?: Date) => string;
  markCycleClosed: (cycleId: string) => Promise<void>;
  deleteCycle: (cycleId: string) => Promise<void>;
  restoreCycle: (cycleId: string) => Promise<void>;
  stats: CycleDetails['stats'];
  getMemberStats: (memberId: string, cycleId?: string) => {
    mealCost: number;
    fixedCost: number;
    totalCost: number;
    balance: number;
    mealsEaten: number;
  };
  getCycleDetails: (cycleId: string) => CycleDetails | null;
  loadCycleDetails: (cycleId: string, options?: { force?: boolean }) => Promise<void>;
  isCycleDetailsLoading: (cycleId: string) => boolean;
  getCycleDetailsError: (cycleId: string) => string | null;
  loadMoreChangelogEntries: () => Promise<void>;
  /** Set of temporary IDs for items that are queued for sync (offline items). */
  pendingSyncIds: Set<string>;
  /** Flush the offline queue against Supabase — called when back online. */
  triggerSync: () => Promise<void>;
  /** Error message when initial data load fails (null = no error). */
  dataError: string | null;
  /** Retry the initial data load after a failure. */
  retryLoadData: () => void;
}

const MealContext = createContext<MealContextType | undefined>(undefined);

const SOFT_DELETE_GRACE_MS = 10 * 1000;

type MemberRow = {
  id: string;
  name: string;
  avatar: string | null;
  deleted_at?: string | null;
  sort_order?: number | null;
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
  created_at: string;
  deleted_at?: string | null;
};

type ExpenseRow = {
  id: string;
  cycle_id: string;
  amount: number | string;
  description: string;
  type: 'meal' | 'fixed';
  date: string;
  paid_by: string;
  deleted_at?: string | null;
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

type ChangelogRow = {
  id: string;
  cycle_id: string;
  user_id?: string;
  profile_id?: string | null;
  entity_type: ChangelogEntityType;
  entity_id: string;
  action: ChangelogAction;
  title: string;
  changes: ChangelogChange[] | null;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string;
    picture_url?: string | null;
    role?: string | null;
  } | null;
};

const CHANGELOG_PAGE_SIZE = 50;

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

function mapChangelogRows(
  rows: ChangelogRow[],
  profilesMap?: Map<string, ChangelogActor>,
): ChangelogEntry[] {
  return rows.map((entry) => {
    let actor: ChangelogActor | null = null;
    const profileData = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles;
    if (profileData) {
      actor = {
        id: profileData.id,
        name: profileData.full_name,
        pictureUrl: profileData.picture_url ?? null,
        role: (profileData.role as ChangelogActor['role']) ?? null,
      };
    } else if (profilesMap) {
      const matched =
        (entry.profile_id && profilesMap.get(entry.profile_id)) ||
        (entry.user_id && profilesMap.get(entry.user_id));
      if (matched) {
        actor = matched;
      }
    }

    return {
      id: entry.id,
      cycleId: entry.cycle_id,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
      action: entry.action,
      title: entry.title,
      changes: entry.changes ?? [],
      createdAt: entry.created_at,
      actor,
    };
  });
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
  return `Meal_${getCycleSeasonName(date)}-${year}`;
}

function generateUniqueCycleName(dateValue: string | Date, existingCycles: Cycle[]) {
  const baseName = getDefaultCycleBaseName(dateValue);
  const existingNames = new Set(
    existingCycles.map((cycle) => cycle.name.trim().toLowerCase()).filter(Boolean),
  );

  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 1;
  let candidate = `${baseName}_${suffix}`;

  while (existingNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }

  return candidate;
}

function buildUpdateChange(
  field: string,
  label: string,
  from: ChangelogValue,
  to: ChangelogValue,
): ChangelogChange | null {
  return from === to ? null : { field, label, from, to };
}

function buildSnapshotChange(field: string, label: string, value: ChangelogValue): ChangelogChange {
  return { field, label, value };
}

function getMealLogAction(changes: ChangelogChange[]): ChangelogAction {
  const created = changes.some((change) => change.from === 0 && typeof change.to === 'number' && change.to > 0);
  const deleted = changes.some((change) => typeof change.from === 'number' && change.from > 0 && change.to === 0);
  const updated = changes.some((change) => typeof change.from === 'number' && typeof change.to === 'number' && change.from > 0 && change.to > 0 && change.from !== change.to);

  if (updated || (created && deleted) || (created && updated) || (deleted && updated)) {
    return 'update';
  }

  if (deleted) return 'delete';
  if (created) return 'create';
  return 'update';
}

async function broadcastSharedUpdate() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    return;
  }

  try {
    const response = await fetch('/api/share/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('Error broadcasting shared update:', await response.text());
    }
  } catch (error) {
    console.error('Error broadcasting shared update:', error);
  }
}

export function MealProvider({ children }: { children: ReactNode }) {
  const [memberRoster, setMemberRoster] = useState<Member[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allMealLogs, setAllMealLogs] = useState<MealLog[]>([]);
  const [allDeposits, setAllDeposits] = useState<CycleDeposit[]>([]);
  const [allChangelogEntries, setAllChangelogEntries] = useState<ChangelogEntry[]>([]);
  const [hasMoreChangelogEntries, setHasMoreChangelogEntries] = useState(false);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loadedCycleIds, setLoadedCycleIds] = useState<Set<string>>(new Set());
  const [cycleDetailsById, setCycleDetailsById] = useState<Record<string, CycleDetails>>({});
  const [cycleDetailsLoadingById, setCycleDetailsLoadingById] = useState<Record<string, boolean>>({});
  const [cycleDetailsErrorById, setCycleDetailsErrorById] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [messId, setMessId] = useState<string | null>(null);
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  const isSyncingRef = useRef(false);
  const profilesMapRef = useRef<Map<string, ChangelogActor>>(new Map());
  const [dataError, setDataError] = useState<string | null>(null);

  // ─── Offline-aware identity resolution ─────────────────────────────────────
  // Use getSession() — the Supabase client caches the session in localStorage so
  // this works without a network connection. getUser() always hits the network.
  useEffect(() => {
    const resolveIdentity = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser) return;

      setUserId(sessionUser.id);

      // Try to get mess_id from network; fall back to cached value if offline
      const MESS_CACHE_KEY = `mealtrack-mess-id-${sessionUser.id}`;
      if (!navigator.onLine) {
        const cached = localStorage.getItem(MESS_CACHE_KEY);
        setMessId(cached || null);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('mess_id, full_name, picture_url, role')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (error) console.error('Error loading current mess:', error);

      if (profile) {
        profilesMapRef.current.set(sessionUser.id, {
          id: sessionUser.id,
          name: profile.full_name,
          pictureUrl: profile.picture_url ?? null,
          role: profile.role ?? null,
        });
      }

      const nextMessId = profile?.mess_id ?? null;
      setMessId(nextMessId);

      // Persist so future offline loads can resolve the mess
      if (nextMessId) {
        localStorage.setItem(MESS_CACHE_KEY, nextMessId);
      }
    };

    void resolveIdentity();
  }, []);

  // Hydrate pendingSyncIds from IDB on mount so badges survive a page refresh
  useEffect(() => {
    getPendingIds().then((ids) => {
      if (ids.length > 0) setPendingSyncIds(new Set(ids));
    }).catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => {
    if (userId && messId) {
      void loadData();
    }
  }, [userId, messId]);

  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.status === 'active') ?? null,
    [cycles],
  );

  const pendingCycle = useMemo(
    () => cycles.find((cycle) => cycle.status === 'pending') ?? null,
    [cycles],
  );

  const activeCycleChangelogEntries = useMemo(
    () => activeCycle ? allChangelogEntries.filter((entry) => entry.cycleId === activeCycle.id) : [],
    [activeCycle, allChangelogEntries],
  );

  const pendingCycleChangelogEntries = useMemo(
    () => pendingCycle ? allChangelogEntries.filter((entry) => entry.cycleId === pendingCycle.id) : [],
    [allChangelogEntries, pendingCycle],
  );

  const getCycleMembers = (cycleId: string) => {
    const cycle = cycles.find((entry) => entry.id === cycleId);
    if (!cycle) {
      return [];
    }

    const snapshot = cycle.membersSnapshot;

    if (snapshot && cycle.status !== 'active') {
      return snapshot.map((member) => ({
        id: member.id,
        name: member.name,
        deposit: 0,
        mealsEaten: 0,
        avatar: toAvatar(member.name, member.avatar),
      }));
    }

    return memberRoster.map((member) => ({
      ...member,
      deposit: 0,
      mealsEaten: 0,
    }));
  };

  const getMemberName = (memberId: string, cycleId?: string) => {
    const scopedMembers = cycleId ? getCycleMembers(cycleId) : memberRoster;
    return scopedMembers.find((member) => member.id === memberId)?.name ?? 'Unknown member';
  };

  const recordChangelog = async ({
    cycleId,
    entityType,
    entityId,
    action,
    title,
    changes,
  }: {
    cycleId: string | null;
    entityType: ChangelogEntityType;
    entityId: string;
    action: ChangelogAction;
    title: string;
    changes: ChangelogChange[];
  }) => {
    if (!userId || !messId || !cycleId) return;

    const { data, error } = await supabase
      .from('changelog_entries')
      .insert([{
        user_id: userId,
        profile_id: userId,
        mess_id: messId,
        cycle_id: cycleId,
        entity_type: entityType,
        entity_id: entityId,
        action,
        title,
        changes,
      }])
      .select('*, profiles(id, full_name, picture_url, role)')
      .single();

    if (error) {
      console.error('Error recording changelog entry:', error);
      return;
    }

    const profileData = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const currentActor =
      (profileData
        ? {
            id: profileData.id,
            name: profileData.full_name,
            pictureUrl: profileData.picture_url ?? null,
            role: profileData.role as ChangelogActor['role'],
          }
        : null) || profilesMapRef.current.get(userId) || null;

    setAllChangelogEntries((prev) => [{
      id: data.id,
      cycleId: data.cycle_id,
      entityType: data.entity_type,
      entityId: data.entity_id,
      action: data.action,
      title: data.title,
      changes: (data.changes as ChangelogChange[] | null) ?? [],
      createdAt: data.created_at,
      actor: currentActor,
    }, ...prev]);
  };


  const fetchCycleRows = async (cycleId: string) => {
    if (!userId || !messId) {
      return null;
    }

    const [depositsResult, expensesResult, mealLogsResult] = await Promise.all([
      supabase
        .from('cycle_deposits')
        .select('*')
        .eq('mess_id', messId)
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true }),
      supabase
        .from('expenses')
        .select('*')
        .eq('mess_id', messId)
        .eq('cycle_id', cycleId)
        .is('deleted_at', null)
        .order('date', { ascending: false }),
      supabase
        .from('meal_logs')
        .select('*')
        .eq('mess_id', messId)
        .eq('cycle_id', cycleId)
        .order('date', { ascending: false }),
    ]);

    if (depositsResult.error) throw depositsResult.error;
    if (expensesResult.error) throw expensesResult.error;
    if (mealLogsResult.error) throw mealLogsResult.error;

    return {
      deposits: mapDepositRows((depositsResult.data || []) as CycleDepositRow[]),
      expenses: mapExpenseRows((expensesResult.data || []) as ExpenseRow[]),
      mealLogs: mapMealLogRows((mealLogsResult.data || []) as MealLogRow[]),
    };
  };

  const buildCycleDetails = (
    cycleId: string,
    source: {
      deposits?: CycleDeposit[];
      expenses?: Expense[];
      mealLogs?: MealLog[];
    } = {},
  ): CycleDetails | null => {
    const cycle = cycles.find((entry) => entry.id === cycleId);
    if (!cycle) {
      return null;
    }

    const cycleMembers = getCycleMembers(cycleId);
    const cycleMemberIds = new Set(cycleMembers.map((member) => member.id));
    const sourceExpenses = source.expenses ?? allExpenses;
    const sourceMealLogs = source.mealLogs ?? allMealLogs;
    const sourceDeposits = source.deposits ?? allDeposits;
    const cycleExpenses = sourceExpenses.filter((expense) => expense.cycleId === cycleId);
    const cycleMealLogs = sourceMealLogs.filter((log) => log.cycleId === cycleId && cycleMemberIds.has(log.memberId));
    const cycleDeposits = sourceDeposits.filter((deposit) => deposit.cycleId === cycleId && cycleMemberIds.has(deposit.memberId));

    const depositByMember = new Map<string, number>();
    for (const deposit of cycleDeposits) {
      depositByMember.set(
        deposit.memberId,
        (depositByMember.get(deposit.memberId) ?? 0) + deposit.amount,
      );
    }

    const baseMembers = cycleMembers.map((member) => ({
      ...member,
      deposit: depositByMember.get(member.id) ?? 0,
      mealsEaten: cycleMealLogs
        .filter((log) => log.memberId === member.id)
        .reduce((sum, log) => sum + log.count, 0),
      hasPendingDeposit: cycleDeposits.some((d) => d.memberId === member.id && d.id.startsWith('offline-')),
    }));

    const totalDeposits = baseMembers.reduce((sum, member) => sum + member.deposit, 0);
    const totalMealExpenses = cycleExpenses
      .filter((expense) => expense.type === 'meal')
      .reduce((sum, expense) => sum + expense.amount, 0);
    const totalFixedExpenses = cycleExpenses
      .filter((expense) => expense.type === 'fixed')
      .reduce((sum, expense) => sum + expense.amount, 0);
    const totalMealsConsumed = cycleMealLogs.reduce((sum, log) => sum + log.count, 0);
    const memberCount = baseMembers.length;
    const currentMealRate = totalMealsConsumed > 0 ? totalMealExpenses / totalMealsConsumed : 0;
    const fixedCostPerMember = memberCount > 0 ? totalFixedExpenses / memberCount : 0;
    const remainingCash = totalDeposits - (totalMealExpenses + totalFixedExpenses);

    const computedMembers = baseMembers.map((member) => {
      const mealCost = member.mealsEaten * currentMealRate;
      const fixedCost = fixedCostPerMember;
      const totalCost = mealCost + fixedCost;
      const balance = member.deposit - totalCost;

      return {
        ...member,
        mealCost,
        fixedCost,
        totalCost,
        balance,
      };
    });

    return {
      cycle,
      stats: {
        totalDeposits,
        totalMealExpenses,
        totalFixedExpenses,
        totalMealsConsumed,
        currentMealRate,
        fixedCostPerMember,
        remainingCash,
      },
      members: computedMembers,
      expenses: cycleExpenses,
      mealLogs: cycleMealLogs,
      deposits: cycleDeposits,
    };
  };

  const getCycleDetails = (cycleId: string): CycleDetails | null => {
    return cycleDetailsById[cycleId] ?? null;
  };

  const isCycleDetailsLoading = (cycleId: string) => Boolean(cycleDetailsLoadingById[cycleId]);

  const getCycleDetailsError = (cycleId: string) => cycleDetailsErrorById[cycleId] ?? null;

  const loadCycleDetails = async (cycleId: string, options: { force?: boolean } = {}) => {
    if (!userId || !messId) return;
    if (!options.force && cycleDetailsById[cycleId]) return;
    if (cycleDetailsLoadingById[cycleId]) return;

    setCycleDetailsLoadingById((prev) => ({ ...prev, [cycleId]: true }));
    setCycleDetailsErrorById((prev) => ({ ...prev, [cycleId]: null }));

    try {
      const rows = await fetchCycleRows(cycleId);
      if (!rows) return;

      setAllDeposits((prev) => [...prev.filter((deposit) => deposit.cycleId !== cycleId), ...rows.deposits]);
      setAllExpenses((prev) => [...prev.filter((expense) => expense.cycleId !== cycleId), ...rows.expenses]);
      setAllMealLogs((prev) => [...prev.filter((log) => log.cycleId !== cycleId), ...rows.mealLogs]);
      setLoadedCycleIds((prev) => new Set(prev).add(cycleId));

      const details = buildCycleDetails(cycleId, rows);
      if (details) {
        setCycleDetailsById((prev) => ({ ...prev, [cycleId]: details }));
      }
    } catch (error) {
      console.error('Error loading cycle details:', error);
      setCycleDetailsErrorById((prev) => ({
        ...prev,
        [cycleId]: error instanceof Error ? error.message : 'Unable to load cycle details.',
      }));
    } finally {
      setCycleDetailsLoadingById((prev) => ({ ...prev, [cycleId]: false }));
    }
  };

  useEffect(() => {
    if (loadedCycleIds.size === 0) {
      setCycleDetailsById({});
      return;
    }

    const nextDetails: Record<string, CycleDetails> = {};
    for (const cycleId of Array.from(loadedCycleIds)) {
      const details = buildCycleDetails(cycleId);
      if (details) {
        nextDetails[cycleId] = details;
      }
    }
    setCycleDetailsById(nextDetails);
  }, [loadedCycleIds, cycles, memberRoster, allExpenses, allMealLogs, allDeposits]);



  const DATA_CACHE_KEY = userId && messId ? `mealtrack-data-cache-${userId}-${messId}` : null;

  const loadData = async () => {
    if (!userId || !messId) return;

    const cacheKey = `mealtrack-data-cache-${userId}-${messId}`;

    // ── Offline path: hydrate from localStorage cache ────────────────────────
    if (!navigator.onLine) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const snap = JSON.parse(cached) as {
            members: Member[];
            cycles: Cycle[];
            deposits: CycleDeposit[];
            expenses: Expense[];
            mealLogs: MealLog[];
            changelog: ChangelogEntry[];
            loadedCycleIds: string[];
          };
          setMemberRoster(snap.members);
          setCycles(snap.cycles);
          setAllDeposits(snap.deposits);
          setAllExpenses(snap.expenses);
          setAllMealLogs(snap.mealLogs);
          setAllChangelogEntries(snap.changelog);
          setLoadedCycleIds(new Set(snap.loadedCycleIds));
          setDataError(null);
          setLoading(false);
          return;
        }
      } catch {
        // corrupt cache – fall through to show error
      }
      setDataError('You are offline and no cached data was found. Connect to the internet to load your data.');
      setLoading(false);
      return;
    }

    // ── Online path ──────────────────────────────────────────────────────────
    try {
      setLoading(true);

      const [membersResult, cyclesResult, changelogResult, profilesResult] = await Promise.all([
        supabase
          .from('members')
          .select('*')
          .eq('mess_id', messId)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase
          .from('cycles')
          .select('*')
          .eq('mess_id', messId)
          .is('deleted_at', null)
          .order('started_at', { ascending: false }),
        supabase
          .from('changelog_entries')
          .select('*, profiles(id, full_name, picture_url, role)')
          .eq('mess_id', messId)
          .order('created_at', { ascending: false })
          .range(0, CHANGELOG_PAGE_SIZE - 1),
        supabase
          .from('profiles')
          .select('id, full_name, picture_url, role')
          .eq('mess_id', messId),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (cyclesResult.error) throw cyclesResult.error;
      if (changelogResult.error) throw changelogResult.error;

      const nextProfilesMap = new Map<string, ChangelogActor>();
      ((profilesResult.data || []) as any[]).forEach((p) => {
        nextProfilesMap.set(p.id, {
          id: p.id,
          name: p.full_name,
          pictureUrl: p.picture_url ?? null,
          role: p.role ?? null,
        });
      });
      profilesMapRef.current = nextProfilesMap;

      const nextMembers = ((membersResult.data || []) as MemberRow[])
        .filter((member) => !member.deleted_at)
        .map((member) => ({
          id: member.id,
          name: member.name,
          deposit: 0,
          mealsEaten: 0,
          avatar: toAvatar(member.name, member.avatar),
          profileId: member.profile_id ?? null,
        }));

      const nextCycles = ((cyclesResult.data || []) as CycleRow[])
        .filter((cycle) => !cycle.deleted_at)
        .map((cycle) => ({
          id: cycle.id,
          name: cycle.name || getDefaultCycleBaseName(cycle.started_at),
          status: cycle.status,
          startedAt: cycle.started_at,
          closedAt: cycle.closed_at,
          finalizedAt: cycle.finalized_at,
          membersSnapshot: cycle.members_snapshot,
        }));

      const nextChangelogEntries = mapChangelogRows(
        (changelogResult.data || []) as ChangelogRow[],
        nextProfilesMap,
      );
      const initialCycleIds = nextCycles
        .filter((cycle) => cycle.status === 'active' || cycle.status === 'pending')
        .map((cycle) => cycle.id);
      const initialRows = await Promise.all(initialCycleIds.map((cycleId) => fetchCycleRows(cycleId)));
      const nextDeposits = initialRows.flatMap((rows) => rows?.deposits ?? []);
      const nextExpenses = initialRows.flatMap((rows) => rows?.expenses ?? []);
      const nextMealLogs = initialRows.flatMap((rows) => rows?.mealLogs ?? []);

      setMemberRoster(nextMembers);
      setCycles(nextCycles);
      setAllDeposits(nextDeposits);
      setAllExpenses(nextExpenses);
      setAllMealLogs(nextMealLogs);
      setLoadedCycleIds(new Set(initialCycleIds));
      setCycleDetailsErrorById({});
      setCycleDetailsLoadingById({});
      setAllChangelogEntries(nextChangelogEntries);
      setHasMoreChangelogEntries(nextChangelogEntries.length === CHANGELOG_PAGE_SIZE);
      setDataError(null);

      // Persist snapshot to localStorage for offline access
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          members: nextMembers,
          cycles: nextCycles,
          deposits: nextDeposits,
          expenses: nextExpenses,
          mealLogs: nextMealLogs,
          changelog: nextChangelogEntries,
          loadedCycleIds: initialCycleIds,
        }));
      } catch {
        // Quota exceeded or private browsing — non-fatal
      }
    } catch (error) {
      console.error('Error loading data:', error);

      // If we go offline mid-load, try falling back to cache
      if (!navigator.onLine) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const snap = JSON.parse(cached) as {
              members: Member[];
              cycles: Cycle[];
              deposits: CycleDeposit[];
              expenses: Expense[];
              mealLogs: MealLog[];
              changelog: ChangelogEntry[];
              loadedCycleIds: string[];
            };
            setMemberRoster(snap.members);
            setCycles(snap.cycles);
            setAllDeposits(snap.deposits);
            setAllExpenses(snap.expenses);
            setAllMealLogs(snap.mealLogs);
            setAllChangelogEntries(snap.changelog);
            setLoadedCycleIds(new Set(snap.loadedCycleIds));
            setDataError(null);
            setLoading(false);
            return;
          }
        } catch { /* ignore */ }
      }

      setDataError(
        error instanceof Error
          ? error.message
          : 'Unable to load your meal data. Please check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const retryLoadData = useCallback(() => {
    if (userId && messId) {
      setDataError(null);
      void loadData();
    }
  }, [userId, messId]);

  const loadMoreChangelogEntries = async () => {
    if (!userId || changelogLoading || !hasMoreChangelogEntries) return;

    setChangelogLoading(true);
    try {
      const from = allChangelogEntries.length;
      const to = from + CHANGELOG_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('changelog_entries')
        .select('*, profiles(id, full_name, picture_url, role)')
        .eq('mess_id', messId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const nextEntries = mapChangelogRows(
        (data || []) as ChangelogRow[],
        profilesMapRef.current,
      );
      setAllChangelogEntries((prev) => {
        const seen = new Set(prev.map((entry) => entry.id));
        return [...prev, ...nextEntries.filter((entry) => !seen.has(entry.id))];
      });
      setHasMoreChangelogEntries(nextEntries.length === CHANGELOG_PAGE_SIZE);
    } catch (error) {
      console.error('Error loading changelog entries:', error);
    } finally {
      setChangelogLoading(false);
    }
  };


  const getRequiredCycleId = (requestedCycleId?: string) => {
    return requestedCycleId ?? activeCycle?.id ?? null;
  };

  const allowsNegativeExpenseAmount = (cycleId: string) => {
    return cycles.find((cycle) => cycle.id === cycleId)?.status === 'pending';
  };

  const addMember = async (name: string) => {
    if (!userId || !messId) return;
    const targetCycleId = activeCycle?.id ?? null;

    const avatar = name.substring(0, 2).toUpperCase();
    const { data, error } = await supabase
      .from('members')
      .insert([{ name, avatar, user_id: userId, mess_id: messId, profile_id: null, sort_order: memberRoster.length }])
      .select()
      .single();

    if (error) {
      console.error('Error adding member:', error);
      throw new Error('Unable to add member. Please try again.');
    }

    setMemberRoster((prev) => [
      ...prev,
      {
        id: data.id,
        name: data.name,
        deposit: 0,
        mealsEaten: 0,
        avatar: toAvatar(data.name, data.avatar),
      },
    ]);

    await recordChangelog({
      cycleId: targetCycleId,
      entityType: 'member',
      entityId: data.id,
      action: 'create',
      title: `Added member ${data.name}`,
      changes: [
        buildSnapshotChange('name', 'Name', data.name),
      ],
    });
    void broadcastSharedUpdate();
  };

  const reorderMembers = async (memberIds: string[]) => {
    if (!userId || memberIds.length !== memberRoster.length) return;
    const byId = new Map(memberRoster.map((member) => [member.id, member]));
    const nextRoster = memberIds.map((id) => byId.get(id)).filter((member): member is Member => Boolean(member));
    if (nextRoster.length !== memberRoster.length) return;
    const previousRoster = memberRoster;
    setMemberRoster(nextRoster);
    const results = await Promise.all(memberIds.map((id, sortOrder) => supabase.from("members").update({ sort_order: sortOrder }).eq("id", id).eq("mess_id", messId)));
    if (results.some((result) => result.error)) {
      console.error("Error reordering members:", results.find((result) => result.error)?.error);
      setMemberRoster(previousRoster);
      throw new Error("Could not save member order.");
    }
    void broadcastSharedUpdate();
  };

  const updateMember = async (id: string, updates: Partial<Member>) => {
    if (!userId || !messId) return;
    const existingMember = memberRoster.find((member) => member.id === id);
    const targetCycleId = activeCycle?.id ?? null;
    if (!existingMember) return;

    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;

    const changes = [
      buildUpdateChange('name', 'Name', existingMember.name, updates.name ?? existingMember.name),
      buildUpdateChange('avatar', 'Avatar', existingMember.avatar ?? null, updates.avatar ?? existingMember.avatar ?? null),
    ].filter((change): change is ChangelogChange => Boolean(change));

    if (changes.length === 0) {
      return;
    }

    const { error } = await supabase
      .from('members')
      .update(dbUpdates)
      .eq('id', id)
      .eq('mess_id', messId);

    if (error) {
      console.error('Error updating member:', error);
      throw new Error('Unable to update member. Please try again.');
    }

    setMemberRoster((prev) => prev.map((member) => (
      member.id === id
        ? {
          ...member,
          ...updates,
          deposit: member.deposit,
          mealsEaten: member.mealsEaten,
        }
        : member
    )));

    await recordChangelog({
      cycleId: targetCycleId,
      entityType: 'member',
      entityId: id,
      action: 'update',
      title: `Updated member ${existingMember.name}`,
      changes,
    });
    void broadcastSharedUpdate();
  };

  const removeMember = async (id: string) => {
    if (!userId || !messId) return;
    const existingMember = memberRoster.find((member) => member.id === id);
    const targetCycleId = activeCycle?.id ?? null;
    if (!existingMember) return;

    const now = new Date();
    const { error } = await supabase
      .from('members')
      .update({
        deleted_at: now.toISOString(),
        delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString(),
      })
      .eq('id', id)
      .eq('mess_id', messId)
      .is('deleted_at', null);

    if (error) {
      console.error('Error removing member:', error);
      throw new Error('Unable to remove member. Please try again.');
    }

    setMemberRoster((prev) => prev.filter((member) => member.id !== id));

    await recordChangelog({
      cycleId: targetCycleId,
      entityType: 'member',
      entityId: id,
      action: 'delete',
      title: `Deleted member ${existingMember.name}`,
      changes: [
        buildSnapshotChange('name', 'Name', existingMember.name),
      ],
    });
    void broadcastSharedUpdate();
  };

  const restoreMember = async (id: string) => {
    if (!userId || !messId) return;

    const { data, error } = await supabase
      .from('members')
      .update({ deleted_at: null, delete_expires_at: null })
      .eq('id', id)
      .eq('mess_id', messId)
      .not('deleted_at', 'is', null)
      .select('id, name, avatar')
      .maybeSingle();

    if (error) {
      console.error('Error restoring member:', error);
      throw new Error('Unable to restore member. Please try again.');
    }

    if (data) {
      setMemberRoster((prev) => {
        if (prev.some((member) => member.id === data.id)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: data.id,
            name: data.name,
            deposit: 0,
            mealsEaten: 0,
            avatar: toAvatar(data.name, data.avatar),
          },
        ];
      });
    }

    void loadData();
    void broadcastSharedUpdate();
  };

  const addExpense = async (
    amount: number,
    description: string,
    type: 'meal' | 'fixed',
    paidBy: string,
    cycleId?: string,
    expenseDate?: string,
  ) => {
    if (!userId || !messId) return;

    const targetCycleId = getRequiredCycleId(cycleId);
    if (!targetCycleId) return;
    if (amount < 0 && !allowsNegativeExpenseAmount(targetCycleId)) {
      console.error('Negative expense amounts are only allowed for pending-cycle corrections.');
      return;
    }

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!navigator.onLine) {
      const tempId = `offline-${uuidv4()}`;
      const dateStr = expenseDate ?? new Date().toISOString();
      const optimisticExpense: Expense = {
        id: tempId,
        cycleId: targetCycleId,
        amount,
        description,
        type,
        date: dateStr,
        paidBy,
      };
      setAllExpenses((prev) => [optimisticExpense, ...prev]);
      setPendingSyncIds((prev) => new Set(prev).add(tempId));
      await enqueue({
        id: tempId,
        type: 'ADD_EXPENSE',
        payload: { amount, description, type, paidBy, date: dateStr, userId, messId, cycleId: targetCycleId },
        createdAt: Date.now(),
      });
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('expenses')
      .insert([{
        amount,
        description,
        type,
        paid_by: paidBy,
        date: expenseDate ?? new Date().toISOString(),
        user_id: userId,
        mess_id: messId,
        cycle_id: targetCycleId,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding expense:', error);
      throw new Error('Unable to add expense. Please try again.');
    }

    setAllExpenses((prev) => [{
      id: data.id,
      cycleId: data.cycle_id,
      amount: Number(data.amount),
      description: data.description,
      type: data.type,
      date: data.date,
      paidBy: data.paid_by,
    }, ...prev]);

    await recordChangelog({
      cycleId: targetCycleId,
      entityType: 'expense',
      entityId: data.id,
      action: 'create',
      title: `Added ${data.type} expense`,
      changes: [
        buildSnapshotChange('description', 'Description', data.description),
        buildSnapshotChange('amount', 'Amount', Number(data.amount)),
        buildSnapshotChange('type', 'Type', data.type),
        buildSnapshotChange('paid_by', 'Paid By', data.paid_by),
        buildSnapshotChange('date', 'Date', data.date),
      ],
    });
    void broadcastSharedUpdate();
  };

  const updateExpense = async (
    id: string,
    updates: {
      amount: number;
      description: string;
      type: 'meal' | 'fixed';
      paidBy: string;
      date?: string;
    },
  ) => {
    if (!userId || !messId) return;
    const existingExpense = allExpenses.find((expense) => expense.id === id);
    if (!existingExpense) return;
    if (updates.amount < 0 && !allowsNegativeExpenseAmount(existingExpense.cycleId)) {
      console.error('Negative expense amounts are only allowed for pending-cycle corrections.');
      return;
    }

    const oldDateKey = existingExpense.date ? new Date(existingExpense.date).toISOString().slice(0, 10) : '';
    const newDateKey = updates.date ? new Date(updates.date).toISOString().slice(0, 10) : oldDateKey;
    const isDateChanged = Boolean(updates.date && oldDateKey !== newDateKey);

    const changes = [
      buildUpdateChange('amount', 'Amount', existingExpense.amount, updates.amount),
      buildUpdateChange('description', 'Description', existingExpense.description, updates.description),
      buildUpdateChange('type', 'Type', existingExpense.type, updates.type),
      buildUpdateChange('paid_by', 'Paid By', existingExpense.paidBy, updates.paidBy),
      isDateChanged ? buildUpdateChange('date', 'Date', oldDateKey, newDateKey) : null,
    ].filter((change): change is ChangelogChange => Boolean(change));

    if (changes.length === 0) {
      return;
    }

    const nextDate = updates.date ? (updates.date.includes('T') ? updates.date : new Date(updates.date).toISOString()) : existingExpense.date;

    const { error } = await supabase
      .from('expenses')
      .update({
        amount: updates.amount,
        description: updates.description,
        type: updates.type,
        paid_by: updates.paidBy,
        date: nextDate,
      })
      .eq('id', id)
      .eq('mess_id', messId);

    if (error) {
      console.error('Error updating expense:', error);
      throw new Error('Unable to update expense. Please try again.');
    }

    setAllExpenses((prev) => prev.map((expense) => (
      expense.id === id
        ? {
          ...expense,
          amount: updates.amount,
          description: updates.description,
          type: updates.type,
          paidBy: updates.paidBy,
          date: nextDate,
        }
        : expense
    )));

    await recordChangelog({
      cycleId: existingExpense.cycleId,
      entityType: 'expense',
      entityId: id,
      action: 'update',
      title: `Updated ${existingExpense.type} expense`,
      changes,
    });
    void broadcastSharedUpdate();
  };

  const deleteExpense = async (id: string) => {
    if (!userId || !messId) return;
    const existingExpense = allExpenses.find((expense) => expense.id === id);
    if (!existingExpense) return;

    const now = new Date();
    const { error } = await supabase
      .from('expenses')
      .update({
        deleted_at: now.toISOString(),
        delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString(),
      })
      .eq('id', id)
      .eq('mess_id', messId)
      .is('deleted_at', null);

    if (error) {
      console.error('Error deleting expense:', error);
      throw new Error('Unable to delete expense. Please try again.');
    }

    setAllExpenses((prev) => prev.filter((expense) => expense.id !== id));

    await recordChangelog({
      cycleId: existingExpense.cycleId,
      entityType: 'expense',
      entityId: id,
      action: 'delete',
      title: `Deleted ${existingExpense.type} expense`,
      changes: [
        buildSnapshotChange('description', 'Description', existingExpense.description),
        buildSnapshotChange('amount', 'Amount', existingExpense.amount),
        buildSnapshotChange('type', 'Type', existingExpense.type),
        buildSnapshotChange('paid_by', 'Paid By', existingExpense.paidBy),
        buildSnapshotChange('date', 'Date', existingExpense.date),
      ],
    });
    void broadcastSharedUpdate();
  };

  const restoreExpense = async (id: string) => {
    if (!userId || !messId) return;

    const { data, error } = await supabase
      .from('expenses')
      .update({ deleted_at: null, delete_expires_at: null })
      .eq('id', id)
      .eq('mess_id', messId)
      .not('deleted_at', 'is', null)
      .select('id, cycle_id, amount, description, type, date, paid_by')
      .maybeSingle();

    if (error) {
      console.error('Error restoring expense:', error);
      throw new Error('Unable to restore expense. Please try again.');
    }

    if (data?.cycle_id) {
      setAllExpenses((prev) => {
        if (prev.some((expense) => expense.id === data.id)) {
          return prev;
        }

        return [{
          id: data.id,
          cycleId: data.cycle_id,
          amount: Number(data.amount),
          description: data.description,
          type: data.type,
          date: data.date,
          paidBy: data.paid_by,
        }, ...prev];
      });
    }

    void broadcastSharedUpdate();
  };

  const addDeposit = async (memberId: string, amount: number, cycleId?: string, note?: string) => {
    if (!userId || amount === 0) return;

    const targetCycleId = getRequiredCycleId(cycleId);
    if (!targetCycleId) return;
    const memberName = getMemberName(memberId, targetCycleId);
    const previousDepositBalance = allDeposits
      .filter((deposit) => deposit.cycleId === targetCycleId && deposit.memberId === memberId)
      .reduce((sum, deposit) => sum + deposit.amount, 0);
    const nextDepositBalance = previousDepositBalance + amount;

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!navigator.onLine) {
      const tempId = `offline-${uuidv4()}`;
      const optimisticDeposit: CycleDeposit = {
        id: tempId,
        cycleId: targetCycleId,
        memberId,
        amount,
        note: note ?? undefined,
        createdAt: new Date().toISOString(),
      };
      setAllDeposits((prev) => [...prev, optimisticDeposit]);
      setPendingSyncIds((prev) => new Set(prev).add(tempId));
      await enqueue({
        id: tempId,
        type: 'ADD_DEPOSIT',
        payload: { memberId, amount, cycleId: targetCycleId, note: note ?? null, userId, messId },
        createdAt: Date.now(),
      });
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('cycle_deposits')
      .insert([{
        member_id: memberId,
        cycle_id: targetCycleId,
        amount,
        note: note ?? null,
        user_id: userId,
        mess_id: messId,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding deposit:', error);
      throw new Error('Unable to add deposit. Please try again.');
    }

    setAllDeposits((prev) => [...prev, {
      id: data.id,
      cycleId: data.cycle_id,
      memberId: data.member_id,
      amount: Number(data.amount),
      note: data.note ?? undefined,
      createdAt: data.created_at,
    }]);

    await recordChangelog({
      cycleId: targetCycleId,
      entityType: 'deposit',
      entityId: data.id,
      action: 'update',
      title: `Updated deposit for ${memberName}`,
      changes: [
        buildSnapshotChange('member', 'Member', memberName),
        buildUpdateChange('deposit_balance', 'Deposit Balance', previousDepositBalance, nextDepositBalance)!,
        buildSnapshotChange('transaction_amount', 'Transaction', Number(data.amount)),
        ...(data.note ? [buildSnapshotChange('note', 'Note', data.note)] : []),
      ],
    });
    void broadcastSharedUpdate();
  };

  const saveMealLogs = async (
    entries: Array<{ memberId: string; count: number }>,
    dateStr: string,
    cycleId?: string,
  ) => {
    if (!userId || !messId) return;

    const targetCycleId = getRequiredCycleId(cycleId);
    if (!targetCycleId) return;

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!navigator.onLine) {
      const tempId = `offline-${uuidv4()}`;
      // Apply optimistic updates: update/insert local meal log state
      setAllMealLogs((prev) => {
        let next = [...prev];
        for (const entry of entries) {
          const normalizedCount = Number.isNaN(entry.count) ? 0 : entry.count;
          const existingIdx = next.findIndex(
            (log) => log.memberId === entry.memberId && log.date === dateStr && log.cycleId === targetCycleId,
          );
          if (existingIdx !== -1) {
            if (normalizedCount === 0) {
              next = next.filter((_, i) => i !== existingIdx);
            } else {
              next = next.map((log, i) =>
                i === existingIdx ? { ...log, count: normalizedCount } : log,
              );
            }
          } else if (normalizedCount > 0) {
            next = [
              ...next,
              {
                id: `offline-meal-${uuidv4()}`,
                cycleId: targetCycleId,
                memberId: entry.memberId,
                date: dateStr,
                count: normalizedCount,
              },
            ];
          }
        }
        return next;
      });
      setPendingSyncIds((prev) => new Set(prev).add(tempId));
      await enqueue({
        id: tempId,
        type: 'ADD_MEAL_LOG',
        payload: { entries, dateStr, cycleId: targetCycleId, userId, messId },
        createdAt: Date.now(),
      });
      return;
    }

    let nextMealLogs = [...allMealLogs];
    const mealLogChanges: ChangelogChange[] = [];

    for (const entry of entries) {
      const normalizedCount = Number.isNaN(entry.count) ? 0 : entry.count;
      const existingLog = nextMealLogs.find((log) => (
        log.memberId === entry.memberId && log.date === dateStr && log.cycleId === targetCycleId
      ));

      if (existingLog) {
        if (existingLog.count === normalizedCount) {
          continue;
        }

        if (normalizedCount === 0) {
          const { error } = await supabase
            .from('meal_logs')
            .delete()
            .eq('id', existingLog.id)
            .eq('mess_id', messId);

          if (error) {
            console.error('Error deleting meal log:', error);
            throw new Error('Unable to save meal log. Please try again.');
          }

          nextMealLogs = nextMealLogs.filter((log) => log.id !== existingLog.id);
          mealLogChanges.push({
            field: `member:${entry.memberId}`,
            label: getMemberName(entry.memberId, targetCycleId),
            from: existingLog.count,
            to: 0,
          });
          continue;
        }

        const { error } = await supabase
          .from('meal_logs')
          .update({ count: normalizedCount })
          .eq('id', existingLog.id)
          .eq('mess_id', messId);

        if (error) {
          console.error('Error updating meal log:', error);
          throw new Error('Unable to save meal log. Please try again.');
        }

        nextMealLogs = nextMealLogs.map((log) => (
          log.id === existingLog.id ? { ...log, count: normalizedCount } : log
        ));
        mealLogChanges.push({
          field: `member:${entry.memberId}`,
          label: getMemberName(entry.memberId, targetCycleId),
          from: existingLog.count,
          to: normalizedCount,
        });
        continue;
      }

      if (normalizedCount <= 0) {
        continue;
      }

      const { data, error } = await supabase
        .from('meal_logs')
        .insert([{
          member_id: entry.memberId,
          cycle_id: targetCycleId,
          date: dateStr,
          count: normalizedCount,
          user_id: userId,
          mess_id: messId,
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating meal log:', error);
        throw new Error('Unable to save meal log. Please try again.');
      }

      nextMealLogs = [...nextMealLogs, {
        id: data.id,
        cycleId: data.cycle_id,
        memberId: data.member_id,
        date: data.date,
        count: Number(data.count),
      }];
      mealLogChanges.push({
        field: `member:${entry.memberId}`,
        label: getMemberName(entry.memberId, targetCycleId),
        from: 0,
        to: Number(data.count),
      });
    }

    if (mealLogChanges.length === 0) {
      return;
    }

    setAllMealLogs(nextMealLogs);

    const sortedMealLogChanges = mealLogChanges.sort((left, right) => left.label.localeCompare(right.label));
    await recordChangelog({
      cycleId: targetCycleId,
      entityType: 'meal_log',
      entityId: targetCycleId,
      action: getMealLogAction(sortedMealLogChanges),
      title: `Saved meal log for ${sortedMealLogChanges.length} ${sortedMealLogChanges.length === 1 ? 'member' : 'members'}`,
      changes: [
        buildSnapshotChange('date', 'Date', dateStr),
        buildSnapshotChange('members_changed', 'Members Changed', sortedMealLogChanges.length),
        ...sortedMealLogChanges,
      ],
    });
    void broadcastSharedUpdate();
  };

  const logMeal = async (memberId: string, count: number, dateStr: string, cycleId?: string) => {
    await saveMealLogs([{ memberId, count }], dateStr, cycleId);
  };

  /**
   * Flush the offline queue against Supabase.
   * Called by OfflineToastManager when connectivity is restored.
   */
  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const ops = await dequeueAll();
      if (ops.length === 0) return;

      for (const op of ops) {
        try {
          await replayOp(op);
          await removeFromQueue(op.id);
          setPendingSyncIds((prev) => {
            const next = new Set(prev);
            next.delete(op.id);
            return next;
          });
        } catch (err) {
          console.error(`[offline-sync] Failed to replay op ${op.id}:`, err);
          // Keep the op in the queue so it retries next time
        }
      }

      // Refresh data after sync to get real server IDs
      void loadData();
    } finally {
      isSyncingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, messId]);

  /**
   * Replay a single queued operation against Supabase.
   * The optimistic local item (with its `offline-` prefixed ID) is replaced
   * by the real server record after a successful write.
   */
  const replayOp = async (op: OfflineOp) => {
    if (!userId || !messId) throw new Error('Not authenticated');

    if (op.type === 'ADD_EXPENSE') {
      const p = op.payload as {
        amount: number; description: string; type: 'meal' | 'fixed';
        paidBy: string; date: string; userId: string; messId: string; cycleId: string;
      };
      const { data, error } = await supabase
        .from('expenses')
        .insert([{
          amount: p.amount,
          description: p.description,
          type: p.type,
          paid_by: p.paidBy,
          date: p.date,
          user_id: userId,
          mess_id: messId,
          cycle_id: p.cycleId,
        }])
        .select()
        .single();
      if (error) throw error;
      // Replace the optimistic record with the real one
      setAllExpenses((prev) => [
        { id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by },
        ...prev.filter((e) => e.id !== op.id),
      ]);
      return;
    }

    if (op.type === 'ADD_DEPOSIT') {
      const p = op.payload as {
        memberId: string; amount: number; cycleId: string; note: string | null; userId: string; messId: string;
      };
      const { data, error } = await supabase
        .from('cycle_deposits')
        .insert([{
          member_id: p.memberId,
          cycle_id: p.cycleId,
          amount: p.amount,
          note: p.note,
          user_id: userId,
          mess_id: messId,
        }])
        .select()
        .single();
      if (error) throw error;
      setAllDeposits((prev) => [
        ...prev.filter((d) => d.id !== op.id),
        { id: data.id, cycleId: data.cycle_id, memberId: data.member_id, amount: Number(data.amount), note: data.note ?? undefined, createdAt: data.created_at },
      ]);
      return;
    }

    if (op.type === 'ADD_MEAL_LOG') {
      const p = op.payload as {
        entries: Array<{ memberId: string; count: number }>;
        dateStr: string; cycleId: string; userId: string; messId: string;
      };
      // Delegate to saveMealLogs which now runs online
      await saveMealLogs(p.entries, p.dateStr, p.cycleId);
      // Remove optimistic offline-meal-* entries — loadData() will refresh
      setAllMealLogs((prev) => prev.filter((log) => !log.id.startsWith('offline-')));
      return;
    }
  };

  const renameActiveCycle = async (name: string) => {
    if (!userId || !activeCycle) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Cycle name is required.');
    }

    if (trimmedName === activeCycle.name) {
      return;
    }

    const duplicateCycle = cycles.find((cycle) => (
      cycle.id !== activeCycle.id &&
      cycle.name.trim().toLowerCase() === trimmedName.toLowerCase()
    ));

    if (duplicateCycle) {
      throw new Error('A cycle with this name already exists.');
    }

    const { error } = await supabase
      .from('cycles')
      .update({ name: trimmedName })
      .eq('id', activeCycle.id)
      .eq('mess_id', messId)
      .eq('status', 'active');

    if (error) {
      console.error('Error renaming active cycle:', error);
      if (error.code === '23505') {
        throw new Error('A cycle with this name already exists.');
      }
      throw new Error('Unable to rename the current cycle right now.');
    }

    setCycles((prev) => prev.map((cycle) => (
      cycle.id === activeCycle.id ? { ...cycle, name: trimmedName } : cycle
    )));
    void broadcastSharedUpdate();
  };

  const closeActiveCycle = async () => {
    if (!userId || !activeCycle) return;
    if (pendingCycle) {
      throw new Error('Finish the pending cycle settlement before closing another cycle.');
    }

    const snapshot = memberRoster.map((member) => ({
      id: member.id,
      name: member.name,
      avatar: member.avatar,
    }));

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('cycles')
      .update({
        status: 'pending',
        closed_at: now,
        members_snapshot: snapshot,
      })
      .eq('id', activeCycle.id)
      .eq('mess_id', messId);

    if (updateError) {
      console.error('Error moving cycle to pending:', updateError);
      throw new Error('Unable to close the cycle. Please try again.');
    }

    setCycles((prev) => prev.map((cycle) =>
      cycle.id === activeCycle.id
        ? { ...cycle, status: 'pending' as CycleStatus, closedAt: now, membersSnapshot: snapshot }
        : cycle,
    ));
    void broadcastSharedUpdate();
  };

  const startNewCycle = async (name: string, startedAt?: string) => {
    if (!userId || !messId) return;
    if (activeCycle) {
      throw new Error('Close the current active cycle before starting a new one.');
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Cycle name is required.');
    }

    const duplicate = cycles.find(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('A cycle with this name already exists.');
    }

    const now = startedAt ?? new Date().toISOString();

    const { data: newCycle, error } = await supabase
      .from('cycles')
      .insert([{
        name: trimmedName,
        status: 'active',
        user_id: userId,
        mess_id: messId,
        started_at: now,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error starting new cycle:', error);
      if (error.code === '23505') {
        throw new Error('A cycle with this name already exists.');
      }
      throw new Error('Unable to start a new cycle. Please try again.');
    }

    setCycles((prev) => [
      {
        id: newCycle.id,
        name: newCycle.name ?? trimmedName,
        status: newCycle.status as CycleStatus,
        startedAt: newCycle.started_at,
        closedAt: newCycle.closed_at,
        finalizedAt: newCycle.finalized_at,
        membersSnapshot: newCycle.members_snapshot,
      },
      ...prev,
    ]);
    setLoadedCycleIds((prev) => new Set(prev).add(newCycle.id));
    void broadcastSharedUpdate();
  };

  const suggestCycleName = (date?: Date) => {
    return generateUniqueCycleName(date ?? new Date(), cycles);
  };

  const markCycleClosed = async (cycleId: string) => {
    if (!userId || !messId) return;

    const finalizedAt = new Date().toISOString();
    const { error } = await supabase
      .from('cycles')
      .update({
        status: 'closed',
        finalized_at: finalizedAt,
      })
      .eq('id', cycleId)
      .eq('mess_id', messId);

    if (error) {
      console.error('Error closing pending cycle:', error);
      throw new Error('Unable to finalize the cycle. Please try again.');
    }

    const { error: changelogError } = await supabase
      .from('changelog_entries')
      .delete()
      .eq('cycle_id', cycleId)
      .eq('mess_id', messId);

    if (changelogError) {
      console.error('Error deleting cycle changelog entries:', changelogError);
      // Non-fatal: the cycle is already closed, just log and continue
    }

    setCycles((prev) => prev.map((cycle) => (
      cycle.id === cycleId ? { ...cycle, status: 'closed', finalizedAt } : cycle
    )));
    setAllChangelogEntries((prev) => prev.filter((entry) => entry.cycleId !== cycleId));
    void broadcastSharedUpdate();
  };

  const deleteCycle = async (cycleId: string) => {
    if (!userId || !messId) return;

    const targetCycle = cycles.find((cycle) => cycle.id === cycleId);
    if (!targetCycle || targetCycle.status !== 'closed') {
      return;
    }

    const now = new Date();
    const { error } = await supabase
      .from('cycles')
      .update({
        deleted_at: now.toISOString(),
        delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString(),
      })
      .eq('id', cycleId)
      .eq('mess_id', messId)
      .eq('status', 'closed')
      .is('deleted_at', null);

    if (error) {
      console.error('Error deleting closed cycle:', error);
      throw new Error('Unable to delete the cycle. Please try again.');
    }

    setCycles((prev) => prev.filter((cycle) => cycle.id !== cycleId));
    setLoadedCycleIds((prev) => {
      const next = new Set(prev);
      next.delete(cycleId);
      return next;
    });
    setCycleDetailsById((prev) => {
      const { [cycleId]: _removed, ...next } = prev;
      return next;
    });
    setAllDeposits((prev) => prev.filter((deposit) => deposit.cycleId !== cycleId));
    setAllExpenses((prev) => prev.filter((expense) => expense.cycleId !== cycleId));
    setAllMealLogs((prev) => prev.filter((log) => log.cycleId !== cycleId));
  };

  const restoreCycle = async (cycleId: string) => {
    if (!userId || !messId) return;

    const { data, error } = await supabase
      .from('cycles')
      .update({ deleted_at: null, delete_expires_at: null })
      .eq('id', cycleId)
      .eq('mess_id', messId)
      .eq('status', 'closed')
      .not('deleted_at', 'is', null)
      .select('id, name, status, started_at, closed_at, finalized_at, members_snapshot')
      .maybeSingle();

    if (error) {
      console.error('Error restoring closed cycle:', error);
      throw new Error('Unable to restore the cycle. Please try again.');
    }

    if (data) {
      setCycles((prev) => {
        if (prev.some((cycle) => cycle.id === data.id)) {
          return prev;
        }

        return [{
          id: data.id,
          name: data.name || getDefaultCycleBaseName(data.started_at),
          status: data.status as CycleStatus,
          startedAt: data.started_at,
          closedAt: data.closed_at,
          finalizedAt: data.finalized_at,
          membersSnapshot: data.members_snapshot,
        }, ...prev];
      });
    }

    void loadData();
  };

  const activeDetails = activeCycle ? getCycleDetails(activeCycle.id) : null;

  const members = activeDetails?.members ?? [];
  const expenses = activeDetails?.expenses ?? [];
  const mealLogs = activeDetails?.mealLogs ?? [];
  const stats = activeDetails?.stats ?? {
    totalDeposits: 0,
    totalMealExpenses: 0,
    totalFixedExpenses: 0,
    totalMealsConsumed: 0,
    currentMealRate: 0,
    fixedCostPerMember: 0,
    remainingCash: 0,
  };

  const getMemberStats = (memberId: string, cycleId?: string) => {
    const targetCycleId = getRequiredCycleId(cycleId);
    if (!targetCycleId) {
      return { mealCost: 0, fixedCost: 0, totalCost: 0, balance: 0, mealsEaten: 0 };
    }

    const details = getCycleDetails(targetCycleId);
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
  };

  return (
    <MealContext.Provider
      value={{
        members,
        expenses,
        deposits: activeDetails?.deposits ?? [],
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
        addMember,
        updateMember,
        removeMember,
        restoreMember,
        reorderMembers,
        addExpense,
        updateExpense,
        deleteExpense,
        restoreExpense,
        addDeposit,
        saveMealLogs,
        logMeal,
        renameActiveCycle,
        closeActiveCycle,
        startNewCycle,
        suggestCycleName,
        markCycleClosed,
        deleteCycle,
        restoreCycle,
        stats,
        getMemberStats,
        getCycleDetails,
        loadCycleDetails,
        isCycleDetailsLoading,
        getCycleDetailsError,
        loadMoreChangelogEntries,
        pendingSyncIds,
        triggerSync,
        dataError,
        retryLoadData,
      }}
    >
      {children}
    </MealContext.Provider>
  );
}

export function useMeal() {
  const context = useContext(MealContext);
  if (context === undefined) {
    throw new Error('useMeal must be used within a MealProvider');
  }
  return context;
}
