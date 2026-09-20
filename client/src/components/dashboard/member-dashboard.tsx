/**
 * member-dashboard.tsx
 * A premium, personalized dashboard for Members in MealTrack.
 * Greets the user, shows their financial standing, meal activity,
 * recent deposits, and active mess notices.
 */

import { useMemo } from 'react';
import { format, isToday, parseISO, differenceInDays } from 'date-fns';
import { useAuth } from '@/lib/auth-context';
import { useMeal } from '@/lib/meal-context';
import { useNotice } from '@/lib/notice-context';
import { cn } from '@/lib/utils';
import {
  Utensils,
  Wallet,
  TrendingUp,
  CalendarDays,
  Users,
  Sparkles,
  Bell,
  AlertCircle,
  Clock,
  ShoppingBag,
  ChevronRight,
  Activity,
  CreditCard,
} from 'lucide-react';
import { MemberMealStrip } from '@/components/dashboard/member-meal-strip';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `৳${Math.abs(amount).toFixed(2)}`;
}

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

function getGreeting(name: string): { greeting: string; emoji: string; sub: string } {
  const hour = new Date().getHours();
  const firstName = name.split(' ')[0];
  if (hour >= 5 && hour < 12)
    return { greeting: 'Good Morning', emoji: '🌅', sub: `Rise & shine, ${firstName}!` };
  if (hour >= 12 && hour < 17)
    return { greeting: 'Good Afternoon', emoji: '☀️', sub: `Hope your day's going well, ${firstName}!` };
  if (hour >= 17 && hour < 21)
    return { greeting: 'Good Evening', emoji: '🌆', sub: `Relax and unwind, ${firstName}!` };
  return { greeting: 'Good Night', emoji: '🌙', sub: `Rest well, ${firstName}!` };
}

function formatRelativeDate(dateStr: string) {
  try {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    const diff = differenceInDays(new Date(), date);
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return format(date, 'dd MMM');
  } catch {
    return dateStr;
  }
}

// ── Subcomponent: Unlinked State ──────────────────────────────────────────────

function UnlinkedMemberState({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 ring-2 ring-amber-500/20 shadow-xl">
          <AlertCircle className="h-10 w-10 text-amber-500" />
        </div>
        <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
          <Users className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="max-w-xs space-y-2">
        <h2 className="text-lg font-bold text-foreground">Account Not Linked, {name}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your profile isn't linked to a mess member yet. Please ask your Manager or Coordinator to link your account to start seeing your personal stats.
        </p>
      </div>
    </div>
  );
}

// ── Subcomponent: Notice Banner ───────────────────────────────────────────────

function MemberNoticeCard() {
  const { notice } = useNotice();
  if (!notice) return null;

  const expiresIn = (() => {
    try {
      const diff = differenceInDays(parseISO(notice.expiresAt), new Date());
      if (diff === 0) return 'Expires today';
      if (diff === 1) return 'Expires tomorrow';
      return `Expires in ${diff} days`;
    } catch {
      return '';
    }
  })();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-500/12 via-purple-500/8 to-fuchsia-500/5 p-4 shadow-sm backdrop-blur-sm">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-500/15 blur-2xl" />
      <div className="pointer-events-none absolute -left-5 bottom-0 h-20 w-20 rounded-full bg-fuchsia-500/10 blur-xl" />
      <div className="relative flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 ring-1 ring-violet-500/20">
          <Bell className="h-4 w-4 text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">
              Mess Notice
            </p>
            {expiresIn && (
              <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-500 whitespace-nowrap">
                <Clock className="h-2.5 w-2.5" /> {expiresIn}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-foreground">{notice.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {notice.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Economy Row Item ──────────────────────────────────────────────────────────

function EcoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="group flex items-center justify-between px-3 py-2.5 transition-all duration-150 hover:bg-muted/50">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-xs font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MemberDashboard() {
  const { profile } = useAuth();
  const { members, mealLogs, deposits, stats, activeCycle } = useMeal();

  // ── Find the linked member record ─────────────────────────────────────────
  const myMember = useMemo(() => {
    if (!profile) return null;
    return (
      members.find((m) => m.profileId === profile.id) ??
      members.find(
        (m) =>
          m.name.toLowerCase().trim() ===
          profile.full_name.toLowerCase().trim()
      ) ??
      null
    );
  }, [members, profile]);

  // ── Personal financial stats ──────────────────────────────────────────────
  const memberStats = useMemo(() => {
    if (!myMember) return null;
    const memberDeposits = deposits.filter((d) => d.memberId === myMember.id);
    const totalDeposited = memberDeposits.reduce((s, d) => s + d.amount, 0);
    const mealCost = stats.currentMealRate * (myMember.mealsEaten || 0);
    const fixedCost = stats.fixedCostPerMember;
    const totalCost = mealCost + fixedCost;
    const balance = totalDeposited - totalCost;
    const utilPct =
      totalDeposited > 0 ? Math.min(100, Math.round((totalCost / totalDeposited) * 100)) : 0;
    return { totalDeposited, mealCost, fixedCost, totalCost, balance, utilPct };
  }, [myMember, deposits, stats]);

  // ── Today's meals ─────────────────────────────────────────────────────────
  const todayMeals = useMemo(() => {
    if (!myMember) return 0;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return mealLogs.find((l) => l.memberId === myMember.id && l.date === todayStr)?.count ?? 0;
  }, [myMember, mealLogs]);

  // ── Recent deposits (last 5 in this cycle) ────────────────────────────────
  const recentDeposits = useMemo(() => {
    if (!myMember) return [];
    return deposits
      .filter((d) => d.memberId === myMember.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [myMember, deposits]);

  // ── Greeting ──────────────────────────────────────────────────────────────
  const displayName = profile?.full_name ?? 'Member';
  const { greeting, emoji, sub } = getGreeting(displayName);
  const cycleDays =
    activeCycle?.startedAt
      ? differenceInDays(new Date(), parseISO(activeCycle.startedAt)) + 1
      : 0;

  const isUnlinked = !myMember;
  const isPositive = (memberStats?.balance ?? 0) >= 0;

  return (
    <div className="space-y-4 pb-28">

      {/* ── Greeting Header ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-[#0f1724] dark:to-slate-950 p-5 shadow-2xl text-white">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-8 h-36 w-36 rounded-full bg-violet-500/15 blur-2xl" />
        <div className="pointer-events-none absolute right-20 bottom-0 h-24 w-24 rounded-full bg-teal-400/10 blur-2xl" />
        {/* Subtle dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-0.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl shadow-inner ring-1 ring-white/10"
                aria-hidden="true"
              >
                {emoji}
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 leading-none mb-0.5">
                  {format(new Date(), 'EEEE, d MMMM yyyy')}
                </p>
                <h1 className="text-xl font-extrabold tracking-tight text-white leading-none">
                  {greeting},{' '}
                  <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                    {displayName.split(' ')[0]}
                  </span>
                </h1>
              </div>
            </div>
            <p className="text-xs text-white/40 pl-12">{sub}</p>
          </div>

          {/* Cycle day badge */}
          {activeCycle && (
            <div className="shrink-0 flex flex-col items-center gap-0.5 rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-white/10 text-center">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Cycle</span>
              <span className="font-heading text-2xl font-black leading-none text-white">{cycleDays}</span>
              <span className="text-[8px] font-bold text-white/40">days</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Notice Banner (if any) ── */}
      <MemberNoticeCard />

      {/* ── Unlinked state ── */}
      {isUnlinked ? (
        <div className="glass-card rounded-3xl border border-border/60 p-6">
          <UnlinkedMemberState name={displayName} />
        </div>
      ) : (
        <>
          {/* ── Financial Hero Card ── */}
          {memberStats && (
            <div
              className={cn(
                'relative overflow-hidden rounded-3xl p-5 shadow-2xl text-white',
                isPositive
                  ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700'
                  : 'bg-gradient-to-br from-rose-500 via-rose-600 to-orange-700'
              )}
            >
              {/* Layered glow effects */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-black/20 blur-3xl" />
              <div className="pointer-events-none absolute right-10 bottom-5 h-28 w-28 rounded-full bg-white/5 blur-2xl" />

              <div className="relative space-y-4">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                      <Wallet className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
                      My Balance This Cycle
                    </span>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest backdrop-blur-md ring-1',
                      isPositive
                        ? 'bg-emerald-400/20 ring-emerald-300/30 text-emerald-50'
                        : 'bg-rose-400/20 ring-rose-300/30 text-rose-50'
                    )}
                  >
                    {isPositive ? '✦ In Good Standing' : '⚠ Payment Due'}
                  </span>
                </div>

                {/* Balance Hero */}
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-heading text-5xl font-black tracking-tight sm:text-6xl drop-shadow-md">
                      {isPositive ? '+' : '-'}{formatCurrency(memberStats.balance)}
                    </span>
                    <p className="text-sm font-semibold text-white/80">
                      {isPositive ? "Surplus" : 'Owed to mess'}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white/70">
                    {isPositive ? "You're all clear" : 'Please clear your due'}
                  </p>
                </div>

                {/* Cost breakdown sub-boxes */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className={cn(
                    'flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]',
                    isPositive ? 'border-white/15 bg-emerald-400/20' : 'border-white/15 bg-rose-400/20'
                  )}>
                    <Utensils className="h-3.5 w-3.5 text-white/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/60 leading-none mb-0.5">Meal Cost</p>
                      <p className="text-sm font-extrabold text-white leading-none truncate">{formatCurrency(memberStats.mealCost)}</p>
                      <p className="text-[9px] text-white/50 mt-0.5">{formatMealCount(myMember!.mealsEaten)} meals</p>
                    </div>
                  </div>
                  <div className={cn(
                    'flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]',
                    isPositive ? 'border-white/15 bg-emerald-400/20' : 'border-white/15 bg-rose-400/20'
                  )}>
                    <ShoppingBag className="h-3.5 w-3.5 text-white/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/60 leading-none mb-0.5">Fixed Share</p>
                      <p className="text-sm font-extrabold text-white leading-none truncate">{formatCurrency(memberStats.fixedCost)}</p>
                      <p className="text-[9px] text-white/50 mt-0.5">Bills & utilities</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Meal Activity + Mess Rate Row ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Today's Meals + 7-Day Strip */}
            <div className="glass-card rounded-3xl border border-border/60 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/20">
                    <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Meal Activity
                  </span>
                </div>
              </div>

              <div className="space-y-3 px-4 pb-4 pt-0">
                {/* Today's status pill */}
                <div
                  className={cn(
                    'flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors',
                    todayMeals > 0
                      ? 'border-emerald-500/20 bg-emerald-500/8'
                      : 'border-border/60 bg-muted/40'
                  )}
                >
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">
                      Today
                    </p>
                    {todayMeals > 0 ? (
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        {todayMeals} meal{todayMeals !== 1 ? 's' : ''} logged ✓
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground">No meals yet</p>
                    )}
                  </div>
                  <div
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-2xl text-base font-black shadow-sm',
                      todayMeals > 0
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/25'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {todayMeals > 0 ? todayMeals : '—'}
                  </div>
                </div>

                {/* Cycle total */}
                <div className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Total this cycle</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {formatMealCount(myMember!.mealsEaten)} meals
                  </span>
                </div>

                <div className="border-t border-border/40" />

                {/* 7-Day strip */}
                <MemberMealStrip memberId={myMember!.id} mealLogs={mealLogs} />
              </div>
            </div>

            {/* Mess Economy Snapshot */}
            <div className="glass-card rounded-3xl border border-border/60 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-500/12 ring-1 ring-blue-500/20">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Mess Economy
                  </span>
                </div>
                <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-blue-500/10">
                  <Sparkles className="h-3 w-3 text-blue-500" />
                </div>
              </div>

              <div className="space-y-3 px-4 pb-4 pt-0">
                {/* Meal rate hero */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/12 via-indigo-500/8 to-violet-500/5 border border-blue-500/15 px-4 py-4">
                  <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-500/15 blur-2xl" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">
                    Current Meal Rate
                  </p>
                  <div className="relative flex items-baseline gap-1.5">
                    <span className="font-heading text-3xl font-black text-foreground">
                      ৳{stats.currentMealRate.toFixed(2)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">/ meal</span>
                  </div>
                </div>

                {/* Stats list */}
                <div className="rounded-2xl border border-border/50 overflow-hidden divide-y divide-border/40">
                  <EcoRow
                    icon={<Utensils className="h-3.5 w-3.5 text-emerald-500" />}
                    label="Total Mess Meals"
                    value={formatMealCount(stats.totalMealsConsumed)}
                  />
                  <EcoRow
                    icon={<ShoppingBag className="h-3.5 w-3.5 text-violet-500" />}
                    label="Fixed Cost / Head"
                    value={formatCurrency(stats.fixedCostPerMember)}
                  />
                  {activeCycle && (
                    <EcoRow
                      icon={<CalendarDays className="h-3.5 w-3.5 text-amber-500" />}
                      label="Cycle Duration"
                      value={`Day ${cycleDays}`}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent Deposits ── */}
          <div className="glass-card rounded-3xl border border-border/60 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/20">
                  <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Recent Deposits
                </span>
              </div>
              <Link
                href="/app/members"
                className="flex items-center gap-1 rounded-xl bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                View All <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="px-4 pb-4 pt-1">
              {recentDeposits.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/60 ring-1 ring-border/50">
                    <Wallet className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">No deposits yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Your deposits will appear here</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentDeposits.map((deposit) => {
                    const isCarryForward =
                      deposit.note?.toLowerCase().includes('carry') ||
                      deposit.note?.toLowerCase().includes('forward') ||
                      deposit.note?.toLowerCase().includes('opening');
                    const isRefund =
                      deposit.amount < 0 ||
                      deposit.note?.toLowerCase().includes('refund') ||
                      deposit.note?.toLowerCase().includes('correction');

                    return (
                      <div
                        key={deposit.id}
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-150 hover:bg-muted/50"
                      >
                        {/* Left icon */}
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-150 group-hover:scale-105',
                            isRefund
                              ? 'bg-rose-500/12 ring-rose-500/20 text-rose-500'
                              : isCarryForward
                                ? 'bg-violet-500/12 ring-violet-500/20 text-violet-500'
                                : 'bg-emerald-500/12 ring-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          <Wallet className="h-4 w-4" />
                        </div>

                        {/* Center info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {deposit.note?.trim() || 'Deposit'}
                            </p>
                            {isCarryForward && (
                              <Badge variant="secondary" className="text-[9px] py-0 h-4 font-bold shrink-0">
                                Carry-Forward
                              </Badge>
                            )}
                            {isRefund && (
                              <Badge
                                variant="destructive"
                                className="text-[9px] py-0 h-4 font-bold opacity-80 shrink-0"
                              >
                                Refund
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatRelativeDate(deposit.createdAt)}
                          </p>
                        </div>

                        {/* Amount pill */}
                        <span
                          className={cn(
                            'shrink-0 rounded-xl px-2.5 py-1 text-xs font-black tabular-nums',
                            isRefund
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {isRefund ? '-' : '+'}৳{Math.abs(deposit.amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
