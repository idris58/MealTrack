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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Utensils,
  Wallet,
  TrendingUp,
  CalendarDays,
  Users,
  Sparkles,
  Bell,
  BadgeCheck,
  AlertCircle,
  ArrowUpRight,
  Clock,
  ShoppingBag,
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

function getGreeting(name: string): { greeting: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { greeting: `Good Morning, ${name}`, emoji: '🌅' };
  if (hour >= 12 && hour < 17) return { greeting: `Good Afternoon, ${name}`, emoji: '☀️' };
  if (hour >= 17 && hour < 21) return { greeting: `Good Evening, ${name}`, emoji: '🌆' };
  return { greeting: `Good Night, ${name}`, emoji: '🌙' };
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
    <div className="flex flex-col items-center justify-center gap-5 py-14 text-center">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/10 ring-2 ring-amber-500/20">
          <AlertCircle className="h-9 w-9 text-amber-500" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 shadow-md">
          <Users className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <div className="max-w-xs space-y-2">
        <h2 className="text-lg font-bold text-foreground">Account Not Linked, {name}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your profile isn't linked to a mess member yet. Please ask your
          Manager or Coordinator to link your account to start seeing your
          personal stats.
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
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent p-4 shadow-sm">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl" />
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <Bell className="h-4 w-4 text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Mess Notice
            </p>
            {expiresIn && (
              <span className="flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground whitespace-nowrap">
                <Clock className="h-2.5 w-2.5" /> {expiresIn}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{notice.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {notice.content}
          </p>
        </div>
      </div>
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
  const { greeting, emoji } = getGreeting(displayName);
  const cycleDays =
    activeCycle?.startedAt
      ? differenceInDays(new Date(), parseISO(activeCycle.startedAt)) + 1
      : 0;

  // ── Guard: unlinked ───────────────────────────────────────────────────────
  const isUnlinked = !myMember;

  return (
    <div className="space-y-4 pb-28">

      {/* ── Greeting Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-5 shadow-xl text-white">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-10 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">{emoji}</span>
              <h1 className="text-xl font-bold tracking-tight text-white truncate">{greeting}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
              <span className="text-xs text-slate-400">
                {format(new Date(), 'EEEE, d MMMM yyyy')}
              </span>
              {activeCycle && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs text-slate-400">
                    {activeCycle.name}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs text-slate-400">Day {cycleDays}</span>
                </>
              )}
            </div>
          </div>

          {/* Status badge */}
          {!isUnlinked && (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 shadow-sm">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Active Member
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Notice Banner (if any) ── */}
      <MemberNoticeCard />

      {/* ── Unlinked state ── */}
      {isUnlinked ? (
        <Card className="glass-card border border-border/60">
          <CardContent className="p-4">
            <UnlinkedMemberState name={displayName} />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Financial Hero Card ── */}
          {memberStats && (
            <Card
              className={cn(
                'relative overflow-hidden border-none text-white shadow-xl',
                memberStats.balance >= 0
                  ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800'
                  : 'bg-gradient-to-br from-rose-600 via-rose-700 to-orange-800'
              )}
            >
              {/* Decorative glows */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-white/5 blur-2xl" />

              <CardHeader className="pb-1 pt-4 px-4 sm:px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/80">
                    <Wallet className="h-3.5 w-3.5" />
                    My Balance This Cycle
                  </CardTitle>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md',
                      memberStats.balance >= 0
                        ? 'border-emerald-300/30 bg-emerald-400/20 text-emerald-100'
                        : 'border-rose-300/30 bg-rose-400/20 text-rose-100'
                    )}
                  >
                    {memberStats.balance >= 0 ? 'In Good Standing' : 'Payment Due'}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 px-4 pb-5 pt-1 sm:px-5">
                {/* Balance amount */}
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                    {memberStats.balance >= 0 ? '+' : '-'}{formatCurrency(memberStats.balance)}
                  </span>
                  <span className="text-sm text-white/70 font-medium">
                    {memberStats.balance >= 0 ? 'surplus / credit' : 'owed to mess'}
                  </span>
                </div>

                {/* Utilization bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-white/70 font-medium">
                    <span>Deposited: {formatCurrency(memberStats.totalDeposited)}</span>
                    <span>Used: {memberStats.utilPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/25">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700',
                        memberStats.balance >= 0
                          ? 'bg-gradient-to-r from-emerald-200 to-teal-100'
                          : 'bg-gradient-to-r from-rose-200 to-orange-100'
                      )}
                      style={{ width: `${memberStats.utilPct}%` }}
                    />
                  </div>
                </div>

                {/* Cost breakdown sub-boxes */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md shadow-sm hover:bg-white/15 transition-colors">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Meal Cost</p>
                      <Utensils className="h-3 w-3 text-white/50" />
                    </div>
                    <p className="font-heading text-lg font-extrabold text-white">
                      {formatCurrency(memberStats.mealCost)}
                    </p>
                    <p className="text-[9px] text-white/60 mt-0.5">
                      {formatMealCount(myMember!.mealsEaten)} meals eaten
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md shadow-sm hover:bg-white/15 transition-colors">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Fixed Share</p>
                      <ShoppingBag className="h-3 w-3 text-white/50" />
                    </div>
                    <p className="font-heading text-lg font-extrabold text-white">
                      {formatCurrency(memberStats.fixedCost)}
                    </p>
                    <p className="text-[9px] text-white/60 mt-0.5">
                      Bills & utilities
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Meal Activity + Mess Rate Row ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Today's Meals + 7-Day Strip */}
            <Card className="glass-card border border-border/70 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Meal Activity
                </CardTitle>
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Utensils className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 pt-0">
                {/* Today's status */}
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today</p>
                    {todayMeals > 0 ? (
                      <p className="text-sm font-bold text-foreground">
                        {todayMeals} meal{todayMeals !== 1 ? 's' : ''} logged
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground">No meals yet</p>
                    )}
                  </div>
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full text-lg font-extrabold',
                      todayMeals > 0
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {todayMeals > 0 ? todayMeals : '–'}
                  </div>
                </div>

                {/* Cycle total */}
                <div className="flex items-baseline justify-between border-b pb-3">
                  <span className="text-xs text-muted-foreground">Total this cycle</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {formatMealCount(myMember!.mealsEaten)} meals
                  </span>
                </div>

                {/* 7-Day strip */}
                <MemberMealStrip memberId={myMember!.id} mealLogs={mealLogs} />
              </CardContent>
            </Card>

            {/* Mess Economy Snapshot */}
            <Card className="glass-card border border-border/70 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Mess Economy
                </CardTitle>
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                {/* Meal rate feature */}
                <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/15 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-0.5">
                    Current Meal Rate
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading text-2xl font-extrabold text-foreground">
                      ৳{stats.currentMealRate.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">/ meal</span>
                  </div>
                </div>

                {/* Stats list */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5 text-blue-500" /> Active Members
                    </span>
                    <Link href="/app/members" className="flex items-center gap-0.5 font-bold text-blue-600 dark:text-blue-400 hover:underline">
                      {members.length} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Utensils className="h-3.5 w-3.5 text-emerald-500" /> Total Mess Meals
                    </span>
                    <span className="font-bold text-foreground">{formatMealCount(stats.totalMealsConsumed)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ShoppingBag className="h-3.5 w-3.5 text-violet-500" /> Fixed Cost / Head
                    </span>
                    <span className="font-bold text-foreground">{formatCurrency(stats.fixedCostPerMember)}</span>
                  </div>
                  {activeCycle && (
                    <div className="flex items-center justify-between py-1.5">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 text-amber-500" /> Cycle Duration
                      </span>
                      <span className="font-bold text-foreground">Day {cycleDays}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Recent Deposits ── */}
          <Card className="glass-card border border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Deposits
              </CardTitle>
              <Link
                href="/app/members"
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <span>View All</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {recentDeposits.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No deposits yet this cycle.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentDeposits.map((deposit, idx) => {
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
                        className={cn(
                          'flex items-center justify-between gap-3 py-2.5 transition-colors',
                          idx === 0 && 'pt-0'
                        )}
                      >
                        {/* Left icon */}
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            isRefund
                              ? 'bg-rose-500/10 text-rose-500'
                              : isCarryForward
                              ? 'bg-violet-500/10 text-violet-500'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          <Wallet className="h-3.5 w-3.5" />
                        </div>

                        {/* Center info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {deposit.note?.trim() || 'Deposit'}
                            </p>
                            {isCarryForward && (
                              <Badge variant="secondary" className="text-[9px] py-0 h-4 font-bold">
                                Carry-Forward
                              </Badge>
                            )}
                            {isRefund && (
                              <Badge
                                variant="destructive"
                                className="text-[9px] py-0 h-4 font-bold opacity-80"
                              >
                                Refund
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatRelativeDate(deposit.createdAt)}
                          </p>
                        </div>

                        {/* Amount */}
                        <span
                          className={cn(
                            'shrink-0 text-sm font-extrabold tabular-nums',
                            isRefund
                              ? 'text-rose-500'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {isRefund ? '-' : '+'}৳{Math.abs(deposit.amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
