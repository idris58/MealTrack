/**
 * member-dashboard.tsx  (v2, rebuilt from scratch)
 *
 * Personal home for a mess member. One job: answer "where do I stand, and what
 * should I do next?" in the first screen, then let people dig into details.
 *
 * Layout
 *  1. Header           – greeting, cycle day, progress through the cycle
 *  2. Standing         – balance, funds-used ring, runway / top-up guidance (the hero)
 *  3. At a glance      – meals, meal rate, deposited, today
 *  4. Notice           – active mess notice (only if one exists)
 *  5. Funds vs. cost   – cumulative chart across the cycle
 *  6. Meal rhythm      – last 7 days bars + 4-week calendar + streak
 *  7. Where it goes    – meal/fixed split + how you compare with the mess average
 *  8. Activity         – your latest deposits and the mess's latest expenses
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Flame,
  Hourglass,
  Link2Off,
  Megaphone,
  Moon,
  Receipt,
  Repeat2,
  ShoppingBag,
  Sun,
  Sunrise,
  Sunset,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { useMeal, type CycleDeposit } from '@/lib/meal-context';
import { useNotice } from '@/lib/notice-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

const money = (n: number, digits = 2) =>
  `৳${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const meals = (n: number) => `${Math.round((n + Number.EPSILON) * 1000) / 1000}`;
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

function greeting(): { text: string; Icon: LucideIcon } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: 'Good morning', Icon: Sunrise };
  if (h >= 12 && h < 17) return { text: 'Good afternoon', Icon: Sun };
  if (h >= 17 && h < 21) return { text: 'Good evening', Icon: Sunset };
  return { text: 'Good night', Icon: Moon };
}

function relativeDay(iso: string) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    const diff = differenceInCalendarDays(new Date(), d);
    return diff < 7 ? `${diff} days ago` : format(d, 'd MMM');
  } catch {
    return iso;
  }
}

function depositKind(d: CycleDeposit): 'deposit' | 'refund' | 'carry' {
  const note = (d.note ?? '').toLowerCase();
  if (note.includes('carry') || note.includes('forward') || note.includes('opening')) return 'carry';
  if (d.amount < 0 || note.includes('refund') || note.includes('deduct') || note.includes('correction')) return 'refund';
  return 'deposit';
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion: a single count-up on the balance figure (respects reduced motion)
// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
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

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary-foreground/0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-emerald-700 dark:text-emerald-400">{children}</span>
      <ArrowRight className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
    </Link>
  );
}

function Empty({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

// Circular gauge: how much of the member's deposited funds has been used.
function FundsRing({ pct, tone }: { pct: number; tone: 'good' | 'warn' | 'bad' }) {
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const color = tone === 'good' ? '#ffffff' : tone === 'warn' ? '#fde68a' : '#fecaca';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(clamped)} percent of your deposits used`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="font-heading text-3xl font-bold tabular-nums leading-none">{Math.round(clamped)}%</span>
        <span className="mt-1 text-[11px] text-white/70">of deposits used</span>
      </div>
    </div>
  );
}

// Two-line cumulative chart (deposits vs. cost) in plain SVG.
function FundsChart({ points }: { points: Array<{ label: string; deposits: number; cost: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const data = points.length === 1 ? [points[0], points[0]] : points;
  const max = Math.max(1, ...data.map((p) => Math.max(p.deposits, p.cost))) * 1.12;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const line = (key: 'deposits' | 'cost') => data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('deposits')} L${x(data.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const active = hover ?? data.length - 1;
  const ticks = [0, 0.5, 1].map((t) => max * t);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Deposited <b className="tabular-nums text-foreground">{money(data[active].deposits, 0)}</b></span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" />Your cost <b className="tabular-nums text-foreground">{money(data[active].cost, 0)}</b></span>
        <span className="ml-auto tabular-nums">{data[active].label}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full touch-none sm:h-52"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - rect.left) / rect.width;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
        }}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = (e.touches[0].clientX - rect.left) / rect.width;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id="md-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 4" />
        ))}
        <path d={area} fill="url(#md-area)" />
        <path d={line('deposits')} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={line('cost')} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} className="stroke-foreground/25" vectorEffect="non-scaling-stroke" />
        <text x={pad.l} y={H - 6} className="fill-muted-foreground" fontSize="11">{data[0].label}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-muted-foreground" fontSize="11">{data[data.length - 1].label}</text>
      </svg>
    </div>
  );
}

// Donut for the meal/fixed split.
function SplitDonut({ meal, fixed }: { meal: number; fixed: number }) {
  const total = meal + fixed;
  const size = 112;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mealLen = total > 0 ? (meal / total) * c : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        {total > 0 && (
          <>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="#8b5cf6" strokeDasharray={`${c - mealLen} ${c}`} strokeDashoffset={-mealLen} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="#10b981" strokeDasharray={`${mealLen} ${c}`} />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-lg font-semibold tabular-nums leading-none">{money(total, 0)}</span>
        <span className="mt-0.5 text-[10px] text-muted-foreground">your cost</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function MemberDashboard() {
  const { profile } = useAuth();
  const { members, mealLogs, deposits, expenses, stats, activeCycle } = useMeal();
  const { notice } = useNotice();

  const displayName = profile?.full_name?.trim() || 'Member';
  const firstName = displayName.split(' ')[0];
  const { text: greetText, Icon: GreetIcon } = greeting();

  const me = useMemo(() => {
    if (!profile) return null;
    return (
      members.find((m) => m.profileId === profile.id) ??
      members.find((m) => m.name.toLowerCase().trim() === profile.full_name.toLowerCase().trim()) ??
      null
    );
  }, [members, profile]);

  const view = useMemo(() => {
    if (!me || !activeCycle) return null;

    const today = startOfDay(new Date());
    const start = startOfDay(parseISO(activeCycle.startedAt));
    const elapsed = Math.max(1, differenceInCalendarDays(today, start) + 1);

    // Money
    const mine = deposits.filter((d) => d.memberId === me.id);
    const deposited = mine.reduce((s, d) => s + d.amount, 0);
    const mealCost = stats.currentMealRate * me.mealsEaten;
    const fixedCost = stats.fixedCostPerMember;
    const cost = mealCost + fixedCost;
    const balance = deposited - cost;
    const usedPct = deposited > 0 ? (cost / deposited) * 100 : cost > 0 ? 100 : 0;

    // Meals by date
    const byDate = new Map<string, number>();
    for (const l of mealLogs) if (l.memberId === me.id) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.count);
    const countOn = (d: Date) => byDate.get(dayKey(d)) ?? 0;

    // Runway: how many more days the surplus covers at the current pace
    const dailyMealCost = mealCost / elapsed;
    const runwayDays = balance > 0 && dailyMealCost > 0 ? Math.floor(balance / dailyMealCost) : null;

    // Cumulative chart (cost = meals so far × current rate + fixed share)
    const depositsByDate = new Map<string, number>();
    for (const d of mine) {
      const k = dayKey(parseISO(d.createdAt));
      depositsByDate.set(k, (depositsByDate.get(k) ?? 0) + d.amount);
    }
    let cumMeals = 0;
    let cumDeposits = 0;
    const series = Array.from({ length: elapsed }, (_, i) => {
      const d = addDays(start, i);
      const k = dayKey(d);
      cumMeals += byDate.get(k) ?? 0;
      cumDeposits += depositsByDate.get(k) ?? 0;
      return { label: format(d, 'd MMM'), deposits: cumDeposits, cost: cumMeals * stats.currentMealRate + fixedCost };
    });

    // Last 7 days
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      return { date: d, count: countOn(d) };
    });
    const weekTotal = week.reduce((s, w) => s + w.count, 0);

    // 4-week calendar, weeks start on Saturday
    const gridStart = startOfWeek(subDays(today, 27), { weekStartsOn: 6 });
    const weeks = Math.ceil((differenceInCalendarDays(today, gridStart) + 1) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => {
      const d = addDays(gridStart, i);
      return { date: d, count: countOn(d), future: d > today, outside: d < start };
    });

    // Streak (today may not be logged yet, so it doesn't break the streak)
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const d = subDays(today, i);
      if (countOn(d) > 0) streak++;
      else if (i === 0) continue;
      else break;
    }

    // Compare with the mess
    const perMember = new Map<string, number>();
    for (const l of mealLogs) perMember.set(l.memberId, (perMember.get(l.memberId) ?? 0) + l.count);
    const avgMeals = members.length ? stats.totalMealsConsumed / members.length : 0;
    const share = stats.totalMealsConsumed > 0 ? (me.mealsEaten / stats.totalMealsConsumed) * 100 : 0;
    const rank = 1 + Array.from(perMember.values()).filter((v) => v > me.mealsEaten).length;

    return {
      today, start, elapsed, mine, deposited, mealCost, fixedCost, cost, balance, usedPct,
      todayMeals: countOn(today), dailyMealCost, runwayDays, series, week, weekTotal, cells, streak,
      avgMeals, share, rank,
    };
  }, [me, activeCycle, deposits, mealLogs, members, stats]);

  const balanceShown = useCountUp(view?.balance ?? 0);

  // ── Guard states ───────────────────────────────────────────────────────────
  const Header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GreetIcon className="h-4 w-4" />
          {format(new Date(), 'EEEE, d MMMM')}
        </p>
        <h1 className="mt-1 truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {greetText}, {firstName}
        </h1>
      </div>
      {activeCycle && view && (
        <div className="w-full min-w-[12rem] sm:w-64">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="truncate font-medium">{activeCycle.name}</span>
            <span className="tabular-nums text-muted-foreground">Day {view.elapsed}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (view.elapsed / 30) * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Started {format(view.start, 'd MMM yyyy')}</p>
        </div>
      )}
    </header>
  );

  if (!me) {
    return (
      <div className="space-y-6 pb-28">
        {Header}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Link2Off className="h-5 w-5" />
          </span>
          <h2 className="font-heading text-lg font-semibold">Your account isn't linked to a member yet</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Ask your manager or a coordinator to link your account in Members. Your balance, meals and deposits will show up here right after.
          </p>
        </div>
      </div>
    );
  }

  if (!activeCycle || !view) {
    return (
      <div className="space-y-6 pb-28">
        {Header}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Hourglass className="h-5 w-5" />
          </span>
          <h2 className="font-heading text-lg font-semibold">No cycle is running</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Your numbers appear as soon as your manager starts a new cycle. Past cycles are in History.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/app/history">Open history</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Derived presentation ──────────────────────────────────────────────────
  const positive = view.balance >= 0;
  const tone: 'good' | 'warn' | 'bad' = !positive ? 'bad' : view.usedPct >= 80 ? 'warn' : 'good';
  const heroBg = !positive
    ? 'from-rose-600 via-rose-700 to-orange-800'
    : tone === 'warn'
      ? 'from-amber-600 via-orange-600 to-rose-700'
      : 'from-emerald-600 via-emerald-700 to-teal-800';

  const guidance = !positive
    ? `Pay ${money(view.balance, 0)} to your manager to clear your due.`
    : view.runwayDays === null
      ? 'No spending yet, so there is nothing to forecast.'
      : view.runwayDays <= 3
        ? `Your funds cover about ${view.runwayDays} more day${view.runwayDays === 1 ? '' : 's'} at your current pace. Consider topping up.`
        : `Your funds cover roughly ${view.runwayDays} more days at your current pace.`;

  const heatClass = (n: number) =>
    n <= 0 ? 'bg-muted/60' : n < 1 ? 'bg-emerald-500/25' : n < 2 ? 'bg-emerald-500/45' : n < 3 ? 'bg-emerald-500/70' : 'bg-emerald-500';

  const weekMax = Math.max(2, ...view.week.map((w) => w.count));
  const recentDeposits = [...view.mine].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5);
  const recentExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const vsAvg = view.avgMeals > 0 ? Math.round(((me.mealsEaten - view.avgMeals) / view.avgMeals) * 100) : 0;

  const glance: Array<{ label: string; value: string; sub: string; icon: LucideIcon; accent: string }> = [
    { label: 'Meals eaten', value: meals(me.mealsEaten), sub: `${meals(view.weekTotal)} in the last 7 days`, icon: Utensils, accent: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Meal rate', value: money(stats.currentMealRate), sub: 'Per meal, this cycle', icon: TrendingUp, accent: 'text-sky-600 bg-sky-500/10' },
    { label: 'Deposited', value: money(view.deposited, 0), sub: `${view.mine.filter((d) => d.amount > 0).length} payment${view.mine.filter((d) => d.amount > 0).length === 1 ? '' : 's'}`, icon: Wallet, accent: 'text-violet-600 bg-violet-500/10' },
    { label: 'Today', value: view.todayMeals > 0 ? meals(view.todayMeals) : 'None yet', sub: view.todayMeals > 0 ? 'Logged for you' : 'Nothing logged', icon: CalendarDays, accent: 'text-amber-600 bg-amber-500/10' },
  ];

  const insights: Array<{ icon: LucideIcon; text: string }> = [
    { icon: Flame, text: view.streak > 1 ? `${view.streak}-day meal streak.` : view.streak === 1 ? 'You ate in the mess today.' : 'No meals logged recently.' },
    { icon: TrendingUp, text: view.avgMeals > 0 ? `${Math.abs(vsAvg)}% ${vsAvg >= 0 ? 'above' : 'below'} the mess average of ${meals(view.avgMeals)} meals.` : 'The mess average will show once meals are logged.' },
    { icon: Receipt, text: `You pay ${money(view.dailyMealCost)} a day on meals, plus a ${money(view.fixedCost, 0)} fixed share.` },
  ];

  return (
    <div className="space-y-5 pb-28 sm:space-y-6">
      {Header}

      {/* ── Standing (hero) ─────────────────────────────────────────────── */}
      <section className={cn('relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg sm:p-7', heroBg)} aria-labelledby="standing-title">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="standing-title" className="flex items-center gap-2 text-sm font-medium text-white/80">
              {positive ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
              {positive ? 'You are in credit' : 'You owe the mess'}
            </h2>
            <p className="mt-2 font-heading text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
              {positive ? '+' : '−'}{money(balanceShown)}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">{guidance}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-white text-slate-900 hover:bg-white/90">
                <Link href="/app/members">View my ledger</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white">
                <Link href="/app/meals">See meal logs</Link>
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-5 self-start sm:self-center">
            <FundsRing pct={view.usedPct} tone={tone} />
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-white/65">Deposited</dt><dd className="font-semibold tabular-nums">{money(view.deposited)}</dd></div>
              <div><dt className="text-xs text-white/65">Meals</dt><dd className="font-semibold tabular-nums">{money(view.mealCost)}</dd></div>
              <div><dt className="text-xs text-white/65">Fixed share</dt><dd className="font-semibold tabular-nums">{money(view.fixedCost)}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── At a glance ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {glance.map(({ label, value, sub, icon: Icon, accent }) => (
          <div key={label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', accent)}><Icon className="h-4 w-4" /></span>
            <p className="mt-3 text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate font-heading text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Notice ──────────────────────────────────────────────────────── */}
      {notice && (
        <aside className="flex gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/25" role="status">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"><Megaphone className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-semibold text-amber-950 dark:text-amber-100">{notice.title || 'Notice from your mess'}</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Expires {formatDistanceToNow(parseISO(notice.expiresAt), { addSuffix: true })}</p>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/80">{notice.content}</p>
          </div>
        </aside>
      )}

      {/* ── Funds vs. cost ──────────────────────────────────────────────── */}
      <Panel title="Funds and cost" hint="Cumulative across this cycle. Move over the chart to see any day." icon={TrendingUp}>
        <FundsChart points={view.series} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-5 sm:gap-6">
        {/* ── Meal rhythm ───────────────────────────────────────────────── */}
        <Panel
          title="Meal rhythm"
          hint={view.streak > 1 ? `${view.streak}-day streak` : 'Your last 4 weeks'}
          icon={Utensils}
          className="lg:col-span-3"
          action={<TextLink href="/app/meals">All meals</TextLink>}
        >
          <div className="flex h-28 items-end gap-2" role="img" aria-label="Meals per day for the last 7 days">
            {view.week.map(({ date, count }) => (
              <div key={dayKey(date)} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{count > 0 ? meals(count) : ''}</span>
                <div className="flex w-full flex-1 items-end rounded-lg bg-muted/50">
                  <div
                    className={cn('w-full rounded-lg transition-[height] duration-500', isToday(date) ? 'bg-emerald-500' : 'bg-emerald-500/55')}
                    style={{ height: `${count > 0 ? Math.max(12, (count / weekMax) * 100) : 0}%` }}
                  />
                </div>
                <span className={cn('text-[11px]', isToday(date) ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{format(date, 'EEE')}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground">
              {['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {view.cells.map(({ date, count, future, outside }) => (
                <div
                  key={dayKey(date)}
                  title={future ? undefined : `${format(date, 'EEE d MMM')}: ${count > 0 ? `${meals(count)} meal${count === 1 ? '' : 's'}` : 'no meals'}`}
                  className={cn(
                    'aspect-square rounded-md',
                    future ? 'invisible' : outside ? 'border border-dashed bg-transparent' : heatClass(count),
                    isToday(date) && 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-card',
                  )}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
              Fewer
              {[0, 0.5, 1.5, 2.5, 3].map((n) => <i key={n} className={cn('h-2.5 w-2.5 rounded-sm', heatClass(n))} />)}
              More
            </div>
          </div>
        </Panel>

        {/* ── Where it goes ─────────────────────────────────────────────── */}
        <Panel title="Where your money goes" hint="And how you compare" icon={ShoppingBag} className="lg:col-span-2">
          <div className="flex items-center gap-4">
            <SplitDonut meal={view.mealCost} fixed={view.fixedCost} />
            <ul className="min-w-0 flex-1 space-y-2.5 text-sm">
              <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted-foreground"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Meals</span><b className="tabular-nums">{money(view.mealCost, 0)}</b></li>
              <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-muted-foreground"><i className="h-2.5 w-2.5 rounded-full bg-violet-500" />Fixed share</span><b className="tabular-nums">{money(view.fixedCost, 0)}</b></li>
            </ul>
          </div>
          <ul className="mt-5 space-y-3 border-t pt-4">
            {insights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm leading-snug text-muted-foreground">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          {view.share > 0 && (
            <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              You account for <b className="text-foreground">{view.share.toFixed(0)}%</b> of all meals and rank <b className="text-foreground">#{view.rank}</b> of {members.length}.
            </p>
          )}
        </Panel>
      </div>

      {/* ── Activity ────────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2 sm:gap-6">
        <Panel title="Your deposits" hint="Latest five" icon={Wallet} action={<TextLink href="/app/members">Full ledger</TextLink>}>
          {recentDeposits.length === 0 ? (
            <Empty icon={Wallet} title="No deposits yet" body="When your manager records a payment from you, it appears here." />
          ) : (
            <ul className="divide-y">
              {recentDeposits.map((d) => {
                const kind = depositKind(d);
                const out = kind === 'refund';
                const Icon = out ? ArrowDownLeft : kind === 'carry' ? Repeat2 : ArrowUpRight;
                return (
                  <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', out ? 'bg-rose-500/10 text-rose-600' : kind === 'carry' ? 'bg-violet-500/10 text-violet-600' : 'bg-emerald-500/10 text-emerald-600')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.note?.trim() || (out ? 'Refund' : kind === 'carry' ? 'Opening balance' : 'Deposit')}</p>
                      <p className="text-xs text-muted-foreground">{relativeDay(d.createdAt)}</p>
                    </div>
                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', out ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400')}>
                      {out ? '−' : '+'}{money(d.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Latest mess expenses" hint="Everything is visible to everyone" icon={Receipt} action={<TextLink href="/app/expenses">All expenses</TextLink>}>
          {recentExpenses.length === 0 ? (
            <Empty icon={Receipt} title="No expenses yet" body="Grocery and bill entries from your manager will appear here." />
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
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(e.amount, 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}