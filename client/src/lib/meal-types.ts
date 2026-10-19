import type { OfflineOp } from './offline-queue';

export interface Member {
  id: string;
  name: string;
  deposit: number;
  mealsEaten: number;
  avatar?: string;
  profileId?: string | null;
  hasPendingDeposit?: boolean;
  archived?: boolean;
}

export interface Expense {
  id: string;
  cycleId: string;
  amount: number;
  description: string;
  type: 'meal' | 'utility';
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
export type ChangelogValue = string | number | boolean | null;

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

export interface SnapshotMember {
  id: string;
  name: string;
  avatar?: string;
}

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

export type MemberStats = Pick<
  CycleDetails['members'][number],
  'mealCost' | 'fixedCost' | 'totalCost' | 'balance' | 'mealsEaten'
>;

export interface MealDataContextType {
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
  initialLoading: boolean;
  refreshing: boolean;
  stats: CycleDetails['stats'];
  pendingSyncIds: Set<string>;
  failedSyncOps: OfflineOp[];
  archivedMembers: Member[];
  dataError: string | null;
  getMemberStats: (memberId: string, cycleId?: string) => MemberStats;
  getCycleDetails: (cycleId: string) => CycleDetails | null;
  isCycleDetailsLoading: (cycleId: string) => boolean;
  getCycleDetailsError: (cycleId: string) => string | null;
}

export interface MealActionsContextType {
  addMember: (name: string) => Promise<void>;
  updateMember: (id: string, updates: Partial<Member>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  restoreMember: (id: string) => Promise<void>;
  reorderMembers: (memberIds: string[]) => Promise<void>;
  addExpense: (amount: number, description: string, type: 'meal' | 'utility', paidBy: string, cycleId?: string, expenseDate?: string) => Promise<void>;
  updateExpense: (id: string, updates: { amount: number; description: string; type: 'meal' | 'utility'; paidBy: string; date?: string }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (id: string) => Promise<void>;
  addDeposit: (memberId: string, amount: number, cycleId?: string, note?: string) => Promise<void>;
  saveMealLogs: (entries: Array<{ memberId: string; count: number }>, date: string, cycleId?: string) => Promise<void>;
  logMeal: (memberId: string, count: number, date: string, cycleId?: string) => Promise<void>;
  renameActiveCycle: (name: string) => Promise<void>;
  closeActiveCycle: () => Promise<void>;
  startNewCycle: (name: string, startedAt?: string, carryForwards?: Array<{ memberId: string; amount: number }>) => Promise<void>;
  suggestCycleName: (date?: Date) => string;
  markCycleClosed: (cycleId: string) => Promise<void>;
  deleteCycle: (cycleId: string) => Promise<void>;
  restoreCycle: (cycleId: string) => Promise<void>;
  loadCycleDetails: (cycleId: string, options?: { force?: boolean }) => Promise<void>;
  loadMoreChangelogEntries: (cycleIds: string[], entityType: ChangelogEntityType | 'all', reset?: boolean) => Promise<void>;
  triggerSync: () => Promise<void>;
  retryFailedSync: () => Promise<void>;
  discardFailedSync: (id: string) => Promise<void>;
  retryLoadData: () => void;
}

export type MealContextType = MealDataContextType & MealActionsContextType;
