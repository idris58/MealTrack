import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  Hourglass,
  Link2Off,
  Receipt,
  Repeat2,
  Search,
  Share2,
  ShoppingBag,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import { useMeal, type CycleDeposit } from '@/lib/meal-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const money = (n: number, digits = 2) =>
  `৳${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const signed = (n: number, digits = 2) => `${n < 0 ? '−' : '+'}${money(n, digits)}`;
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;

type Kind = 'deposit' | 'refund' | 'carry';

function kindOf(d: CycleDeposit): Kind {
  const note = (d.note ?? '').toLowerCase();
  if (note.includes('carry') || note.includes('forward') || note.includes('opening')) return 'carry';
  if (d.amount < 0 || note.includes('refund') || note.includes('deduct') || note.includes('correction')) return 'refund';
  return 'deposit';
}

const KIND_META: Record<Kind, { label: string; fallback: string; icon: LucideIcon; tint: string }> = {
  deposit: { label: 'Deposit', fallback: 'Deposit', icon: ArrowUpRight, tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  refund: { label: 'Refund or deduction', fallback: 'Refund or deduction', icon: ArrowDownLeft, tint: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  carry: { label: 'Carry-forward', fallback: 'Opening balance', icon: Repeat2, tint: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
};

function dayLabel(d: Date) {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, d MMMM yyyy');
}

function safeParse(iso: string) {
  try {
    return parseISO(iso);
  } catch {
    return new Date(iso);
  }
}

function useCountUp(target: number, duration = 800) {
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

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error('Could not copy', { description: 'Your browser blocked clipboard access.' });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Funds bar: what your money was spent on, and what is left
// ─────────────────────────────────────────────────────────────────────────────

function FundsBar({ deposited, mealCost, fixedCost }: { deposited: number; mealCost: number; fixedCost: number }) {
  const cost = mealCost + fixedCost;
  const total = Math.max(deposited, cost, 1);
  const pct = (v: number) => `${(Math.max(0, v) / total) * 100}%`;
  const left = Math.max(0, deposited - cost);
  const due = Math.max(0, cost - deposited);

  return (
    <div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10" role="img" aria-label="How your deposits are used">
        <div className="flex h-full">
          <div className="h-full bg-emerald-400" style={{ width: pct(mealCost) }} />
          <div className="h-full bg-violet-400" style={{ width: pct(fixedCost) }} />
          <div className="h-full bg-white/25" style={{ width: pct(left) }} />
        </div>
        {due > 0 && (
          <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(deposited) }} aria-hidden />
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-white/70">
        <li className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-400" />Meals {money(mealCost, 0)}</li>
        <li className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet-400" />Fixed share {money(fixedCost, 0)}</li>
        {due > 0 ? (
          <li className="flex items-center gap-1.5 text-rose-300"><i className="h-2 w-2 rounded-full bg-rose-400" />Not yet covered {money(due, 0)}</li>
        ) : (
          <li className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-white/40" />Left {money(left, 0)}</li>
        )}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger row
// ─────────────────────────────────────────────────────────────────────────────

function LedgerRow({
  deposit,
  running,
  open,
  onToggle,
}: {
  deposit: CycleDeposit;
  running: number;
  open: boolean;
  onToggle: () => void;
}) {
  const kind = kindOf(deposit);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const when = safeParse(deposit.createdAt);
  const negative = deposit.amount < 0;
  const ref = deposit.id.replace(/^offline-/, '').slice(0, 8).toUpperCase();
  const pending = deposit.id.startsWith('offline-');

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-2"
      >
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', meta.tint)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{deposit.note?.trim() || meta.fallback}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {format(when, 'h:mm a')}
            {kind !== 'deposit' ? ` · ${meta.label}` : ''}
            {pending ? ' · Waiting to sync' : ''}
          </span>
        </span>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', negative ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
          {signed(deposit.amount)}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <dl className="mb-3 ml-12 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/50 p-3 text-xs sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Recorded</dt><dd className="mt-0.5 font-medium">{format(when, 'd MMM yyyy, h:mm a')}</dd></div>
          <div><dt className="text-muted-foreground">Type</dt><dd className="mt-0.5 font-medium">{meta.label}</dd></div>
          <div><dt className="text-muted-foreground">Total after this</dt><dd className="mt-0.5 font-medium tabular-nums">{money(running)}</dd></div>
          <div><dt className="text-muted-foreground">Reference</dt><dd className="mt-0.5 font-mono font-medium">{ref}</dd></div>
        </dl>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small layout pieces
// ─────────────────────────────────────────────────────────────────────────────

function Card({ title, hint, icon: Icon, action, children, className }: { title: string; hint?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm sm:p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <h2 className="truncate font-heading text-base font-semibold leading-tight">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function PageHeader({ cycleName }: { cycleName?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Deposits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cycleName ? `Your payments, costs and balance in ${cycleName}.` : 'Your payments, costs and balance.'}
        </p>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Filter = 'all' | Kind;

export function MemberDepositsView() {
  const { profile } = useAuth();
  const { members, deposits, mealLogs, activeCycle, stats } = useMeal();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<7 | 14 | 30>(14);

  const me = useMemo(() => {
    if (!profile) return null;
    return (
      members.find((m) => m.profileId === profile.id) ??
      members.find((m) => m.name.toLowerCase().trim() === profile.full_name.toLowerCase().trim()) ??
      null
    );
  }, [members, profile]);

  const v = useMemo(() => {
    if (!me || !activeCycle) return null;

    const today = startOfDay(new Date());
    const start = startOfDay(parseISO(activeCycle.startedAt));
    const elapsed = Math.max(1, differenceInCalendarDays(today, start) + 1);

    const mine = deposits.filter((d) => d.memberId === me.id);
    const chrono = [...mine].sort((a, b) => +safeParse(a.createdAt) - +safeParse(b.createdAt));

    const running = new Map<string, number>();
    let acc = 0;
    for (const d of chrono) {
      acc += d.amount;
      running.set(d.id, acc);
    }

    const net = acc;
    const paidIn = mine.filter((d) => kindOf(d) === 'deposit' && d.amount > 0).reduce((s, d) => s + d.amount, 0);
    const carriedIn = mine.filter((d) => kindOf(d) === 'carry' && d.amount > 0).reduce((s, d) => s + d.amount, 0);
    const takenOut = mine.filter((d) => d.amount < 0).reduce((s, d) => s + Math.abs(d.amount), 0);
    const payments = mine.filter((d) => d.amount > 0).length;
    const lastPayment = [...chrono].reverse().find((d) => d.amount > 0) ?? null;

    const rate = stats.currentMealRate;
    const mealCost = rate * me.mealsEaten;
    const fixedCost = stats.fixedCostPerMember;
    const cost = mealCost + fixedCost;
    const balance = net - cost;
    const burn = mealCost / elapsed;
    const runway = balance > 0 && burn > 0 ? Math.floor(balance / burn) : null;

    // Balance journey
    const mealsByDay = new Map<string, number>();
    for (const l of mealLogs) if (l.memberId === me.id) mealsByDay.set(l.date, (mealsByDay.get(l.date) ?? 0) + l.count);
    const paidByDay = new Map<string, number>();
    for (const d of mine) {
      const k = dayKey(safeParse(d.createdAt));
      paidByDay.set(k, (paidByDay.get(k) ?? 0) + d.amount);
    }
    let cm = 0;
    let cd = 0;
    const series = Array.from({ length: elapsed }, (_, i) => {
      const day = addDays(start, i);
      const k = dayKey(day);
      cm += mealsByDay.get(k) ?? 0;
      cd += paidByDay.get(k) ?? 0;
      return { label: format(day, 'd MMM'), value: cd - (cm * rate + fixedCost) };
    });

    return { mine, running, net, paidIn, carriedIn, takenOut, payments, lastPayment, rate, mealCost, fixedCost, cost, balance, burn, runway, series, elapsed };
  }, [me, activeCycle, deposits, mealLogs, stats]);

  const shown = useCountUp(v?.balance ?? 0);

  // Ledger: filter → search → sort → group by day
  const groups = useMemo(() => {
    if (!v) return [];
    const q = query.trim().toLowerCase();
    const list = v.mine
      .filter((d) => filter === 'all' || kindOf(d) === filter)
      .filter((d) => !q || (d.note ?? '').toLowerCase().includes(q) || String(Math.abs(d.amount)).includes(q))
      .sort((a, b) => (newestFirst ? 1 : -1) * (+safeParse(b.createdAt) - +safeParse(a.createdAt)));

    const out: Array<{ key: string; date: Date; items: CycleDeposit[]; net: number }> = [];
    for (const d of list) {
      const date = safeParse(d.createdAt);
      const key = dayKey(date);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(d);
        last.net += d.amount;
      } else out.push({ key, date, items: [d], net: d.amount });
    }
    return out;
  }, [v, filter, query, newestFirst]);

  // ── Statement tools ───────────────────────────────────────────────────────
  const statementText = () => {
    if (!v || !activeCycle) return '';
    const rows = [...v.mine]
      .sort((a, b) => +safeParse(b.createdAt) - +safeParse(a.createdAt))
      .map((d) => `${format(safeParse(d.createdAt), 'd MMM yyyy, h:mm a')}  ${d.note?.trim() || KIND_META[kindOf(d)].fallback}  ${signed(d.amount)}`);
    return [
      'MealTrack deposit statement',
      `Member: ${profile?.full_name ?? ''}`,
      `Cycle: ${activeCycle.name}`,
      '',
      `Deposited: ${money(v.net)}`,
      `Meals: ${money(v.mealCost)}`,
      `Fixed share: ${money(v.fixedCost)}`,
      `Balance: ${signed(v.balance)} (${v.balance >= 0 ? 'in credit' : 'due'})`,
      '',
      'Transactions',
      ...(rows.length ? rows : ['No transactions yet.']),
    ].join('\n');
  };

  const shareStatement = async () => {
    const text = statementText();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'MealTrack deposit statement', text });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    await copyText(text, 'Statement copied');
  };

  const exportCsv = () => {
    if (!v || !activeCycle) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
      ['Date', 'Time', 'Type', 'Note', 'Amount', 'Total after'].join(','),
      ...[...v.mine]
        .sort((a, b) => +safeParse(a.createdAt) - +safeParse(b.createdAt))
        .map((d) => {
          const t = safeParse(d.createdAt);
          return [format(t, 'yyyy-MM-dd'), format(t, 'HH:mm'), esc(KIND_META[kindOf(d)].label), esc(d.note ?? ''), d.amount.toFixed(2), (v.running.get(d.id) ?? 0).toFixed(2)].join(',');
        }),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mealtrack-deposits-${activeCycle.name.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success('Statement exported', { description: 'Your CSV download has started.' });
  };

  // ── Guard states ──────────────────────────────────────────────────────────
  if (!me) {
    return (
      <div className="space-y-6 pb-28">
        <PageHeader />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600"><Link2Off className="h-5 w-5" /></span>
          <h2 className="font-heading text-lg font-semibold">Your account isn't linked to a member</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Ask your manager or a coordinator to link your account in Members. Once linked, your deposits and balance appear here.
          </p>
        </div>
      </div>
    );
  }

  if (!activeCycle || !v) {
    return (
      <div className="space-y-6 pb-28">
        <PageHeader />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Hourglass className="h-5 w-5" /></span>
          <h2 className="font-heading text-lg font-semibold">No cycle is running</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Your wallet opens when your manager starts a new cycle. Settled cycles are available in History.
          </p>
        </div>
      </div>
    );
  }

  // ── Derived presentation ──────────────────────────────────────────────────
  const positive = v.balance >= 0;
  const low = positive && v.runway !== null && v.runway <= 3;
  const status = !positive ? { text: 'Payment due', cls: 'bg-rose-400/20 text-rose-200' } : low ? { text: 'Running low', cls: 'bg-amber-400/20 text-amber-200' } : { text: 'Covered', cls: 'bg-emerald-400/20 text-emerald-200' };

  const topUp = (days: number) => roundUp10(Math.max(0, v.burn * days - v.balance));
  const planAmount = topUp(horizon);
  const clearDue = positive ? 0 : roundUp10(Math.abs(v.balance));

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: v.mine.length },
    { key: 'deposit', label: 'Deposits', count: v.mine.filter((d) => kindOf(d) === 'deposit').length },
    { key: 'refund', label: 'Refunds', count: v.mine.filter((d) => kindOf(d) === 'refund').length },
    { key: 'carry', label: 'Carry-forward', count: v.mine.filter((d) => kindOf(d) === 'carry').length },
  ];

  return (
    <div className="space-y-5 pb-28 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader cycleName={activeCycle.name} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyText(statementText(), 'Statement copied')}>
            <Copy className="h-3.5 w-3.5" />Copy
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void shareStatement()}>
            <Share2 className="h-3.5 w-3.5" />Share
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Wallet card ─────────────────────────────────────────────── */}
        <section
          className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d2620] text-white shadow-lg lg:col-start-1 lg:row-start-1"
          aria-labelledby="wallet-balance"
        >
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="wallet-balance" className="flex items-center gap-2 text-sm font-medium text-white/70">
                <Wallet className="h-4 w-4" />
                {positive ? 'Available balance' : 'Amount due'}
              </h2>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', status.cls)}>
                {positive ? <Check className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
                {status.text}
              </span>
            </div>

            <p className="mt-3 font-heading text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
              {money(shown)}
            </p>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/70">
              {!positive
                ? `You've used ${money(v.cost, 0)} against ${money(v.net, 0)} deposited. Pay ${money(clearDue, 0)} to clear your due.`
                : v.runway === null
                  ? `You've deposited ${money(v.net, 0)} and haven't been charged much yet.`
                  : `At your current pace this covers about ${v.runway} more day${v.runway === 1 ? '' : 's'}.`}
            </p>

            <div className="mt-6"><FundsBar deposited={v.net} mealCost={v.mealCost} fixedCost={v.fixedCost} /></div>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-y divide-white/10 border-t border-white/10 sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: 'Total deposited', value: money(v.paidIn, 0), sub: `${v.payments} payment${v.payments === 1 ? '' : 's'}` },
              { label: 'Previous balance', value: money(v.carriedIn, 0), sub: 'From last cycle' },
              { label: 'Refunded or deducted', value: money(v.takenOut, 0), sub: 'Taken out' },
              { label: 'Last payment', value: v.lastPayment ? format(safeParse(v.lastPayment.createdAt), 'd MMM') : 'None', sub: v.lastPayment ? money(v.lastPayment.amount, 0) : 'No payments yet' },
            ].map((s) => (
              <div key={s.label} className="px-4 py-3.5 sm:px-5">
                <dt className="text-xs text-white/55">{s.label}</dt>
                <dd className="mt-0.5 font-heading text-lg font-semibold tabular-nums">{s.value}</dd>
                <p className="text-[11px] text-white/45">{s.sub}</p>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Rail: planner + charges ─────────────────────────────────── */}
        <div className="space-y-5 sm:space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          <Card title="Recommended payment" hint="How much to pay to stay covered" icon={CalendarClock}>
            <div role="radiogroup" aria-label="Cover me for" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={horizon === d}
                  onClick={() => setHorizon(d)}
                  className={cn('rounded-lg py-1.5 text-xs font-medium transition-colors', horizon === d ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {d} days
                </button>
              ))}
            </div>

            <div className="mt-4">
              {planAmount > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">Pay your manager</p>
                  <p className="mt-0.5 font-heading text-3xl font-semibold tabular-nums">{money(planAmount, 0)}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {v.burn > 0 ? `Based on ${money(v.burn)} a day in meals so far.` : 'You have no meal costs yet.'}
                    {!positive ? ` This includes your ${money(clearDue, 0)} due.` : ''}
                  </p>
                  <Button className="mt-3 w-full gap-1.5" onClick={() => void copyText(String(planAmount), 'Amount copied')}>
                    <Copy className="h-4 w-4" />Copy amount
                  </Button>
                </>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>You're covered for the next {horizon} days. Nothing to pay right now.</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Your costs" hint="What this cycle has cost you" icon={Receipt}>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><Utensils className="h-4 w-4 text-emerald-500" />
                  <span>Meals<span className="block text-xs">{Math.round(me.mealsEaten * 1000) / 1000} × {money(v.rate)}</span></span>
                </dt>
                <dd className="font-medium tabular-nums">{money(v.mealCost)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><ShoppingBag className="h-4 w-4 text-violet-500" />
                  <span>Fixed share<span className="block text-xs">Bills split equally</span></span>
                </dt>
                <dd className="font-medium tabular-nums">{money(v.fixedCost)}</dd>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <dt className="font-medium">Total charged</dt>
                <dd className="font-heading text-base font-semibold tabular-nums">{money(v.cost)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Total deposited</dt>
                <dd className="tabular-nums">{money(v.net)}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                <dt className="font-medium">{positive ? 'Balance' : 'Due'}</dt>
                <dd className={cn('font-semibold tabular-nums', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{signed(v.balance)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* ── Ledger ──────────────────────────────────────────────────── */}
        <Card
          title="Ledger"
          hint={`${v.mine.length} transaction${v.mine.length === 1 ? '' : 's'} this cycle`}
          icon={Banknote}
          className="lg:col-start-1 lg:row-start-2"
          action={
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => setNewestFirst((s) => !s)}>
              <ArrowUpDown className="h-3.5 w-3.5" />{newestFirst ? 'Newest first' : 'Oldest first'}
            </Button>
          }
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by note or amount" className="pl-9" aria-label="Search transactions" />
          </div>

          <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                aria-pressed={filter === t.key}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === t.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                <span className={cn('tabular-nums', filter === t.key ? 'text-primary-foreground/80' : 'text-muted-foreground/70')}>{t.count}</span>
              </button>
            ))}
          </div>

          <div className="mt-4">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
                <Wallet className="h-5 w-5 text-muted-foreground/60" />
                <p className="text-sm font-medium">{v.mine.length === 0 ? 'No deposits yet' : 'Nothing matches'}</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {v.mine.length === 0
                    ? 'Pay your manager, and once they record it, it appears here.'
                    : 'Try another filter or clear the search.'}
                </p>
                {(filter !== 'all' || query) && (
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => { setFilter('all'); setQuery(''); }}>Clear filters</Button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {groups.map((g) => (
                  <div key={g.key}>
                    <div className="mb-1 flex items-baseline justify-between border-b pb-1.5 text-xs">
                      <h3 className="font-medium text-foreground">{dayLabel(g.date)}</h3>
                      <span className="tabular-nums text-muted-foreground">{signed(g.net)}</span>
                    </div>
                    <ul className="divide-y divide-border/60">
                      {g.items.map((d) => (
                        <LedgerRow
                          key={d.id}
                          deposit={d}
                          running={v.running.get(d.id) ?? 0}
                          open={openId === d.id}
                          onToggle={() => setOpenId((cur) => (cur === d.id ? null : d.id))}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="mt-6 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            Pay your manager by cash, bKash, Nagad or another agreed method. Your manager records the payment, and it shows up here as soon as it's saved.
          </p>
        </Card>
      </div>
    </div>
  );
}
