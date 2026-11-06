import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  parseISO,
  startOfDay,
} from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  CloudOff,
  Hourglass,
  Megaphone,
  Minus,
  Play,
  Plus,
  Receipt,
  ScrollText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import {
  useMealActions,
  useMealChangelog,
  useMealCycles,
  useMealMembers,
  useMealRows,
  useMealStats,
  useMealStatus,
  useRealtimeEvents,
} from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { useNotice } from '@/lib/notice-context';
import { supabase } from '@/lib/supabase';
import { runMutation } from '@/lib/run-mutation';
import { normalizeBengaliDigits } from '@/lib/localized-number';
import { formatMealCount, formatMoney, formatSignedMoney } from '@/lib/display-format';
import { useCountUp } from '@/hooks/use-count-up';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OnboardingTour } from '@/components/onboarding-tour';
import { ExpenseForm } from '@/components/expense-form';
import { MealCountEditor } from '@/components/meal-count-editor';
import { NoticeDialog } from '@/components/notice-dialog';
import { DepositAmountConfirmation, LARGE_DEPOSIT_THRESHOLD } from '@/components/deposit-amount-confirmation';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const money = (n: number, digits = 0) => formatMoney(n, digits);
const signedMoney = (n: number, digits = 0) => formatSignedMoney(n, digits);
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const validAmount = /^[0-9\u09E6-\u09EF]*\.?[0-9\u09E6-\u09EF]*$/;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

/** Settings is lazy-loaded, so wait for the target section to exist before scrolling. */
function scrollWhenReady(id: string, tries = 25) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (tries > 0) window.setTimeout(() => scrollWhenReady(id, tries - 1), 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentational pieces
// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  title,
  hint,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm sm:p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-heading text-base font-semibold leading-tight">{title}</h2>
            {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function LinkAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
    >
      {children}
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function EmptyBlock({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  accent: string;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string; good: boolean };
}) {
  const TrendIcon = trend?.dir === 'up' ? TrendingUp : trend?.dir === 'down' ? TrendingDown : Minus;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', accent)}>
          <Icon className="h-4 w-4" />
        </span>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              trend.dir === 'flat'
                ? 'bg-muted text-muted-foreground'
                : trend.good
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {trend.text}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-heading text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick deposit dialog body
// ─────────────────────────────────────────────────────────────────────────────

function QuickDeposit({
  members,
  initialMemberId,
  initialAmount,
  cycleId,
  onClose,
}: {
  members: Array<{ id: string; name: string }>;
  initialMemberId?: string;
  initialAmount?: number;
  cycleId: string;
  onClose: () => void;
}) {
  const { addDeposit } = useMealActions();
  const [memberId, setMemberId] = useState(initialMemberId ?? members[0]?.id ?? '');
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [busy, setBusy] = useState(false);
  const [showConfirmLarge, setShowConfirmLarge] = useState(false);

  const executeDeposit = async (amount: number) => {
    if (busy) return;
    setBusy(true);
    const signedAmount = mode === 'deduct' ? -Math.abs(amount) : Math.abs(amount);
    const kind = mode === 'deduct' ? 'refund' : 'deposit';
    try {
      const saved = await runMutation(() => addDeposit(memberId, signedAmount, cycleId, undefined, kind));
      if (!saved) return;

      onClose();
      const memberName = members.find((member) => member.id === memberId)?.name ?? 'member';
      let undoUsed = false;
      toast.success(mode === 'deduct' ? 'Refund recorded' : 'Deposit recorded', {
        description: `${money(Math.abs(signedAmount))} for ${memberName}`,
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => {
            if (undoUsed) return;
            undoUsed = true;
            void runMutation(async () => {
              await addDeposit(
                memberId,
                -signedAmount,
                cycleId,
                mode === 'deduct' ? 'Undo refund' : 'Undo deposit',
                signedAmount > 0 ? 'refund' : 'deposit',
              );
              toast.success('Deposit reversed', { description: `A balancing entry was recorded for ${memberName}.` });
            });
          },
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number.parseFloat(normalizeBengaliDigits(amount.trim()));
    if (busy || !memberId || !Number.isFinite(val) || val === 0) return;
    if (Math.abs(val) >= LARGE_DEPOSIT_THRESHOLD && !showConfirmLarge) {
      setShowConfirmLarge(true);
      return;
    }
    await executeDeposit(val);
  };

  const parsedAmount = Number.parseFloat(normalizeBengaliDigits(amount.trim()));
  const isLargeAmount = Number.isFinite(parsedAmount) && Math.abs(parsedAmount) >= LARGE_DEPOSIT_THRESHOLD;
  const selectedMemberName = members.find((member) => member.id === memberId)?.name;

  return (
    <form onSubmit={submit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <label className="text-sm font-medium">Member</label>
        <Select value={memberId} onValueChange={(value) => { setMemberId(value); setShowConfirmLarge(false); }}>
          <SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger>
          <SelectContent>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={mode === 'add' ? 'default' : 'outline'} onClick={() => { setMode('add'); setShowConfirmLarge(false); }} disabled={busy}>Collect</Button>
        <Button type="button" variant={mode === 'deduct' ? 'destructive' : 'outline'} onClick={() => { setMode('deduct'); setShowConfirmLarge(false); }} disabled={busy}>Refund</Button>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Amount (৳)</label>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => { if (validAmount.test(e.target.value)) { setAmount(e.target.value); setShowConfirmLarge(false); } }}
          autoFocus
          disabled={busy}
        />
      </div>
      {showConfirmLarge && isLargeAmount ? (
        <DepositAmountConfirmation
          amount={parsedAmount}
          mode={mode}
          memberName={selectedMemberName}
          isSubmitting={busy}
          onEdit={() => setShowConfirmLarge(false)}
          onConfirm={() => void executeDeposit(parsedAmount)}
        />
      ) : (
        <Button type="submit" className="w-full" disabled={busy || !amount}>
          {busy ? 'Saving…' : mode === 'deduct' ? 'Record refund' : 'Record deposit'}
        </Button>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Attention = {
  id: string;
  tone: 'warn' | 'bad' | 'info';
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onClick?: () => void; href?: string };
};

const ENTITY_ICON: Record<string, LucideIcon> = {
  member: Users,
  expense: ShoppingBag,
  meal_log: Utensils,
  deposit: Wallet,
};

export function ManagerDashboard() {
  const { stats } = useMealStats();
  const { members, getMemberStats } = useMealMembers();
  const { mealLogs, expenses, deposits } = useMealRows();
  const { activeCycle, pendingCycle } = useMealCycles();
  const { activeCycleChangelogEntries } = useMealChangelog();
  const { pendingSyncIds, failedSyncOps } = useMealStatus();
  const { mealOffRequests: mealOffRevision } = useRealtimeEvents();
  const { profile, canManageExpenses, canOperateMeals, canManageDeposits, canManageCycles } = useAuth();
  const { notice } = useNotice();
  const [, setLocation] = useLocation();

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState<{ memberId?: string; amount?: number } | null>(null);
  const [feedTab, setFeedTab] = useState<'activity' | 'expenses'>('activity');
  const [pendingMealOff, setPendingMealOff] = useState(0);

  const messId = profile?.mess_id ?? null;
  const firstName = (profile?.full_name ?? 'there').trim().split(' ')[0];
  const canPostNotice = profile?.role === 'manager' || profile?.role === 'coordinator';

  const goToCycleSettings = () => {
    setLocation('/app/settings');
    scrollWhenReady('cycle-operations');
  };

  // Pending meal-off requests (same source as the PWA app badge).
  useEffect(() => {
    if (!messId || !canOperateMeals) {
      setPendingMealOff(0);
      return;
    }
    let active = true;
    void supabase
      .from('meal_off_requests')
      .select('id', { count: 'exact', head: true })
      .eq('mess_id', messId)
      .eq('status', 'pending')
      .then(({ count, error }) => {
        if (active && !error && typeof count === 'number') setPendingMealOff(count);
      });
    return () => { active = false; };
  }, [messId, canOperateMeals, mealOffRevision]);

  const v = useMemo(() => {
    if (!activeCycle) return null;

    const today = startOfDay(new Date());
    const start = startOfDay(parseISO(activeCycle.startedAt));
    const elapsed = Math.min(400, Math.max(1, differenceInCalendarDays(today, start) + 1));
    const keys = Array.from({ length: elapsed }, (_, i) => dayKey(addDays(start, i)));
    const idxOf = (key: string) => {
      const i = keys.indexOf(key);
      if (i >= 0) return i;
      return key < keys[0] ? 0 : keys.length - 1;
    };

    const days = keys.map((k) => ({ key: k, meal: 0, fixed: 0, deposits: 0, meals: 0 }));
    for (const e of expenses) days[idxOf(e.date.slice(0, 10))][e.type === 'meal' ? 'meal' : 'fixed'] += e.amount;
    for (const d of deposits) days[idxOf(dayKey(parseISO(d.createdAt)))].deposits += d.amount;
    for (const l of mealLogs) days[idxOf(l.date.slice(0, 10))].meals += l.count;

    let cumMealExp = 0;
    let cumMeals = 0;
    const rate: Array<number | null> = [];
    for (const d of days) {
      cumMealExp += d.meal;
      cumMeals += d.meals;
      rate.push(cumMeals > 0 ? cumMealExp / cumMeals : null);
    }

    const totalSpent = stats.totalMealExpenses + stats.totalFixedExpenses;
    const burn = totalSpent / elapsed;
    const runway = stats.remainingCash > 0 && burn > 0 ? Math.floor(stats.remainingCash / burn) : null;
    const usedPct = stats.totalDeposits > 0 ? Math.min(100, (totalSpent / stats.totalDeposits) * 100) : totalSpent > 0 ? 100 : 0;

    const rateNow = rate[rate.length - 1];
    const ratePrev = rate.length > 1 ? rate[rate.length - 2] : null;
    const rateDelta = rateNow != null && ratePrev ? ((rateNow - ratePrev) / ratePrev) * 100 : null;

    const todaySpent = days[elapsed - 1].meal + days[elapsed - 1].fixed;

    const todayKey = dayKey(today);
    const todayLogs = mealLogs.filter((l) => l.date.slice(0, 10) === todayKey && l.count > 0);
    const todayByMember = new Map(todayLogs.map((l) => [l.memberId, l.count]));
    const todayMeals = todayLogs.reduce((s, l) => s + l.count, 0);
    const hasLogToday = mealLogs.some((l) => l.date.slice(0, 10) === todayKey);

    const ledger = members
      .map((m) => ({ member: m, ...getMemberStats(m.id), deposit: m.deposit }))
      .sort((a, b) => a.balance - b.balance);
    const dues = ledger.filter((r) => r.balance < -0.5);
    const totalDue = dues.reduce((s, r) => s + Math.abs(r.balance), 0);
    const maxAbs = Math.max(1, ...ledger.map((r) => Math.abs(r.balance)));

    return {
      elapsed, cycleDay: elapsed, totalSpent, todaySpent, burn, runway, usedPct,
      rateDelta, todayMeals, todayByMember, hasLogToday,
      ledger, dues, totalDue, maxAbs,
    };
  }, [activeCycle, expenses, deposits, mealLogs, stats, members, getMemberStats]);

  const cashShown = useCountUp(stats.remainingCash);

  const recentExpenses = useMemo(() => [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [expenses]);
  const recentActivity = activeCycleChangelogEntries.slice(0, 6);

  const attention = useMemo<Attention[]>(() => {
    const list: Attention[] = [];
    if (pendingCycle) {
      list.push({
        id: 'pending',
        tone: 'warn',
        icon: Hourglass,
        title: `${pendingCycle.name} awaits settlement`,
        body: canManageCycles
          ? 'Settle balances and lock the cycle to archive it.'
          : 'Record settlement installments. The manager locks the cycle.',
        action: { label: 'Open settlement', href: '/app/history' },
      });
    }
    if (pendingMealOff > 0) {
      list.push({
        id: 'meal-off',
        tone: 'info',
        icon: UtensilsCrossed,
        title: `${pendingMealOff} meal-off request${pendingMealOff === 1 ? '' : 's'} to review`,
        body: 'Approve or decline before planning upcoming meals.',
        action: { label: 'Review requests', href: '/app/meals' },
      });
    }
    if (activeCycle && v && members.length > 0 && !v.hasLogToday) {
      list.push({
        id: 'meals',
        tone: 'warn',
        icon: CalendarCheck,
        title: "Today's meals aren't logged",
        body: 'Record meal counts so the meal rate stays accurate.',
        action: canOperateMeals ? { label: 'Log meals', onClick: () => setMealOpen(true) } : undefined,
      });
    }
    if (v && v.dues.length > 0) {
      list.push({
        id: 'dues',
        tone: 'bad',
        icon: CircleDollarSign,
        title: `${v.dues.length} member${v.dues.length === 1 ? '' : 's'} owe ${money(v.totalDue)}`,
        body: `Largest: ${v.dues[0].member.name} (${money(Math.abs(v.dues[0].balance))}).`,
        action: canManageDeposits
          ? { label: 'Collect', onClick: () => setDepositOpen({ memberId: v.dues[0].member.id, amount: Math.ceil(Math.abs(v.dues[0].balance)) }) }
          : undefined,
      });
    }
    if (v && v.runway !== null && v.runway <= 5) {
      list.push({
        id: 'runway',
        tone: 'bad',
        icon: AlertTriangle,
        title: `Cash covers ~${v.runway} more day${v.runway === 1 ? '' : 's'}`,
        body: `At ${money(v.burn)} spent per day. Consider collecting deposits.`,
      });
    }
    if (activeCycle && stats.remainingCash < 0) {
      list.push({
        id: 'deficit',
        tone: 'bad',
        icon: AlertTriangle,
        title: `Cash deficit of ${money(stats.remainingCash)}`,
        body: 'Expenses exceed total deposits collected.',
      });
    }
    const syncing = pendingSyncIds.size;
    if (failedSyncOps.length > 0 || syncing > 0) {
      list.push({
        id: 'sync',
        tone: 'info',
        icon: CloudOff,
        title: failedSyncOps.length > 0
          ? `${failedSyncOps.length} change${failedSyncOps.length === 1 ? '' : 's'} need attention`
          : `${syncing} change${syncing === 1 ? '' : 's'} waiting to sync`,
        body: failedSyncOps.length > 0 ? 'Review the failed offline changes.' : 'They will upload automatically when you are online.',
      });
    }
    return list;
  }, [pendingCycle, pendingMealOff, activeCycle, v, members.length, canOperateMeals, canManageDeposits, canManageCycles, stats.remainingCash, pendingSyncIds, failedSyncOps]);

  const toneClasses = {
    warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    bad: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  } as const;

  // ── Header ────────────────────────────────────────────────────────────────
  const header = (
    <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.12] via-card to-card p-5 shadow-sm sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="mt-1 truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
          {activeCycle && v ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {activeCycle.name}
              </span>
              <span className="text-xs text-muted-foreground">
                Day {v.cycleDay} · started {format(parseISO(activeCycle.startedAt), 'd MMM')} · {members.length} member{members.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No cycle is running right now.</p>
          )}
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:pb-0">
          {canOperateMeals && (
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setMealOpen(true)} disabled={!activeCycle || members.length === 0}>
              <Utensils className="h-4 w-4" />Log meals
            </Button>
          )}
          {canManageExpenses && (
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5 bg-background/70" onClick={() => setExpenseOpen(true)} disabled={!activeCycle}>
              <Plus className="h-4 w-4" />Expense
            </Button>
          )}
          {canManageDeposits && (
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5 bg-background/70" onClick={() => setDepositOpen({})} disabled={!activeCycle || members.length === 0}>
              <Wallet className="h-4 w-4" />Collect
            </Button>
          )}
          {canPostNotice && (
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5 bg-background/70" onClick={() => setNoticeOpen(true)}>
              <Megaphone className="h-4 w-4" />Notice
            </Button>
          )}
        </div>
      </div>
    </header>
  );

  // ── No active cycle ───────────────────────────────────────────────────────
  if (!activeCycle || !v) {
    return (
      <div className="space-y-5 pb-24">
        <OnboardingTour />
        {header}
        {pendingCycle && (
          <Link href="/app/history" className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/25">
            <Hourglass className="h-5 w-5 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{pendingCycle.name} is pending settlement</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/70">Settle balances and lock it before starting the next cycle.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-amber-700" />
          </Link>
        )}
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed bg-card/60 px-6 py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Play className="h-6 w-6" /></span>
          <div>
            <h2 className="font-heading text-xl font-semibold">Start a cycle to light up your dashboard</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Cash flow, meal rate, member balances and live trends appear as soon as a cycle is running.
            </p>
          </div>
          {canManageCycles ? (
            <Button className="gap-2" onClick={goToCycleSettings}><Play className="h-4 w-4" />Start new cycle</Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only the manager can start a new cycle.</p>
          )}
        </div>
        {noticeOpen && <NoticeDialog mode={notice ? 'read' : 'post'} open={noticeOpen} onOpenChange={setNoticeOpen} />}
      </div>
    );
  }

  const positive = stats.remainingCash >= 0;
  const rateTrend = v.rateDelta == null
    ? undefined
    : {
        dir: Math.abs(v.rateDelta) < 0.5 ? 'flat' as const : v.rateDelta > 0 ? 'up' as const : 'down' as const,
        text: `${Math.abs(v.rateDelta).toFixed(1)}%`,
        good: v.rateDelta <= 0,
      };

  return (
    <div className="space-y-5 pb-24 sm:space-y-6">
      <OnboardingTour />
      {header}

      {/* Cash command center + attention */}
      <div className="grid gap-5 lg:grid-cols-12 sm:gap-6">
        <section className="relative isolate overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 text-white shadow-xl shadow-emerald-950/10 lg:col-span-8" aria-labelledby="financial-health-title">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-teal-300/[0.08] blur-3xl" />
          <div className="relative p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="financial-health-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Financial health</h2>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="font-heading text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
                    {positive ? '' : '−'}{money(cashShown)}
                  </span>
                  <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', positive ? 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100' : 'border-rose-200/30 bg-rose-400/15 text-rose-100')}>{positive ? 'Healthy reserve' : 'Cash deficit'}</span>
                </div>
              </div>
              <Link href="/app/reports" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-emerald-50 transition-colors hover:bg-white/10">Open reports<ArrowRight className="h-3 w-3" /></Link>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-emerald-100/70">Spent / deposits</span><span className="text-right font-semibold tabular-nums text-white">{money(v.totalSpent)} / {money(stats.totalDeposits)} · {Math.round(v.usedPct)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ring-white/10" role="progressbar" aria-label={`${Math.round(v.usedPct)}% of deposits deployed`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.usedPct)}>
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-200 to-teal-100 shadow-[0_0_12px_rgba(167,243,208,0.35)] transition-all" style={{ width: `${v.usedPct}%` }} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: 'Meal costs', value: money(stats.totalMealExpenses) },
                { label: 'Utility costs', value: money(stats.totalFixedExpenses) },
                { label: 'Utility/member', value: money(stats.fixedCostPerMember) },
              ].map((item, index) => (
                <div key={item.label} className={cn('min-w-0 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 shadow-sm backdrop-blur-sm', index === 2 && 'hidden sm:block')}>
                  <p className="text-xs text-emerald-100/65">{item.label}</p>
                  <p className="mt-0.5 truncate font-semibold tabular-nums text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Panel
          title="Needs attention"
          hint={attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'} to review` : 'Nothing urgent'}
          icon={AlertTriangle}
          className="lg:col-span-4"
        >
          {attention.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-500/[0.07] px-4 py-10 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold">All clear</p>
              <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">Meals are logged, balances are healthy and nothing is waiting on you.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {attention.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-xl border p-3">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClasses[a.tone])}><a.icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{a.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
                    {a.action && (
                      a.action.href ? (
                        <Link href={a.action.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{a.action.label}<ArrowRight className="h-3 w-3" /></Link>
                      ) : (
                        <button type="button" onClick={a.action.onClick} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{a.action.label}<ArrowRight className="h-3 w-3" /></button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        <Kpi label="Meal rate" value={money(stats.currentMealRate, 2)} sub="Per meal, this cycle" icon={Utensils} accent="bg-emerald-500/10 text-emerald-600" trend={rateTrend} />
        <Kpi label="Meals served" value={formatMealCount(stats.totalMealsConsumed)} sub={`${formatMealCount(v.todayMeals)} today`} icon={CalendarCheck} accent="bg-sky-500/10 text-sky-600" />
        <Kpi label="Total spending" value={money(v.totalSpent)} sub={`Today ${money(v.todaySpent)}`} icon={Receipt} accent="bg-violet-500/10 text-violet-600" />
        <Kpi label="Total collected" value={money(stats.totalDeposits)} sub={`${members.length} active members`} icon={Wallet} accent="bg-amber-500/10 text-amber-600" />
      </div>

      {/* Ledger + today */}
      <div className="grid gap-5 lg:grid-cols-12 sm:gap-6">
        <Panel
          title="Member balances"
          hint={v.dues.length ? `${v.dues.length} owing ${money(v.totalDue)}` : 'Everyone is in credit'}
          icon={Users}
          className="lg:col-span-7"
          action={<LinkAction href="/app/members">Manage</LinkAction>}
        >
          {v.ledger.length === 0 ? (
            <EmptyBlock icon={Users} title="No members yet" body="Add or invite members to start tracking balances." />
          ) : (
            <ul className="max-h-[26rem] divide-y overflow-y-auto overscroll-y-auto pr-1">
              {v.ledger.map((r) => {
                const due = r.balance < -0.5;
                const width = `${(Math.abs(r.balance) / v.maxAbs) * 100}%`;
                return (
                  <li key={r.member.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar className="h-9 w-9 shrink-0 text-xs">
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">{r.member.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{r.member.name}</p>
                        <p className={cn('shrink-0 text-sm font-semibold tabular-nums', due ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {signedMoney(Math.round(r.balance))}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', due ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width }} />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        Paid {money(r.deposit)} · Cost {money(r.totalCost)} · {formatMealCount(r.mealsEaten)} meals
                      </p>
                    </div>
                    {canManageDeposits && (
                      <Button size="sm" variant={due ? 'default' : 'ghost'} className="h-8 shrink-0 px-2.5 text-xs" aria-label={`Record deposit for ${r.member.name}`} onClick={() => setDepositOpen({ memberId: r.member.id, amount: due ? Math.ceil(Math.abs(r.balance)) : undefined })}>
                        {due ? 'Collect' : <Plus className="h-4 w-4" />}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Today's meals"
          hint={v.hasLogToday ? `${formatMealCount(v.todayMeals)} meals · ${v.todayByMember.size}/${members.length} eating` : 'Not logged yet'}
          icon={Utensils}
          className="lg:col-span-5"
          action={canOperateMeals ? <button type="button" onClick={() => setMealOpen(true)} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">{v.hasLogToday ? 'Edit' : 'Log now'}</button> : undefined}
        >
          {members.length === 0 ? (
            <EmptyBlock icon={Users} title="No members" body="Add members before logging meals." />
          ) : (
            <>
              <div className="mb-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Attendance</span>
                  <span className="tabular-nums">{v.todayByMember.size} of {members.length}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${members.length ? (v.todayByMember.size / members.length) * 100 : 0}%` }} />
                </div>
              </div>
              <ul className="grid max-h-[24rem] grid-cols-2 gap-2 overflow-y-auto overscroll-y-auto pr-1">
                {members.map((m) => {
                  const c = v.todayByMember.get(m.id) ?? 0;
                  return (
                    <li key={m.id} className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-2', c > 0 ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : 'bg-muted/30')}>
                      <Avatar className="h-6 w-6 shrink-0 text-[10px]"><AvatarFallback>{m.avatar}</AvatarFallback></Avatar>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.name.split(' ')[0]}</span>
                      <span className={cn('text-xs font-bold tabular-nums', c > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/60')}>{c > 0 ? formatMealCount(c) : '–'}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* Feed */}
      <Panel
        title="Recent"
        hint={feedTab === 'activity' ? 'Latest changes by your team' : 'Latest expenses in this cycle'}
        icon={ScrollText}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-muted/40 p-0.5">
              {(['activity', 'expenses'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setFeedTab(t)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors', feedTab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t}</button>
              ))}
            </div>
            <LinkAction href={feedTab === 'activity' ? '/app/changelog' : '/app/expenses'}>All</LinkAction>
          </div>
        }
      >
        {feedTab === 'activity' ? (
          recentActivity.length === 0 ? (
            <EmptyBlock icon={ScrollText} title="No activity yet" body="Meal logs, expenses and deposits will show up here as your team works." />
          ) : (
            <ul className="divide-y">
              {recentActivity.map((e) => {
                const Icon = ENTITY_ICON[e.entityType] ?? Zap;
                return (
                  <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.actor?.name ?? 'System'} · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}</p>
                    </div>
                    <Avatar className="h-6 w-6 shrink-0">
                      {e.actor?.pictureUrl && <AvatarImage src={e.actor.pictureUrl} alt={e.actor.name} />}
                      <AvatarFallback className="text-[9px]">{(e.actor?.name ?? 'SY').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </li>
                );
              })}
            </ul>
          )
        ) : recentExpenses.length === 0 ? (
          <EmptyBlock icon={Receipt} title="No expenses yet" body="Grocery and bill entries will appear here." />
        ) : (
          <ul className="divide-y">
            {recentExpenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', e.type === 'meal' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-violet-500/10 text-violet-600')}>
                  {e.type === 'meal' ? <ShoppingBag className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.description}</p>
                  <p className="truncate text-xs text-muted-foreground">{format(parseISO(e.date), 'd MMM')} · Paid by {e.paidBy}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Dialogs */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-emerald-500" />Add new expense</DialogTitle>
            <DialogDescription>Record a grocery, meal, or utility expense for this cycle.</DialogDescription>
          </DialogHeader>
          <ExpenseForm mode="create" onClose={() => setExpenseOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={mealOpen} onOpenChange={setMealOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Utensils className="h-5 w-5 text-emerald-500" />Log meals by date</DialogTitle>
            <DialogDescription>Update meal counts for each member on the selected date.</DialogDescription>
          </DialogHeader>
          <MealCountEditor members={members} mealLogs={mealLogs} onClose={() => setMealOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!depositOpen} onOpenChange={(o) => !o && setDepositOpen(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-500" />Record deposit</DialogTitle>
            <DialogDescription>Collect a payment or record a refund for a member.</DialogDescription>
          </DialogHeader>
          {depositOpen && (
            <QuickDeposit
              members={members}
              initialMemberId={depositOpen.memberId}
              initialAmount={depositOpen.amount}
              cycleId={activeCycle.id}
              onClose={() => setDepositOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {noticeOpen && <NoticeDialog mode={notice ? 'read' : 'post'} open={noticeOpen} onOpenChange={setNoticeOpen} />}
    </div>
  );
}
