/**
 * member-deposits-view.tsx
 * Premium personal deposits & ledger interface for Members on /app/members.
 *
 * Features:
 * – Cycle selector (active cycle + pending cycles only)
 * – Financial overview hero: total deposited, total incurred, net balance, utilization bar
 * – Interactive transaction timeline with filter tabs (All / Deposits / Refunds / Carry-Forward)
 * – Search and sort controls
 * – Rich color-coded transaction cards with relative date stamps and type badges
 * – Copy Statement to clipboard action
 * – Deposit instructions helper card
 * – Unlinked profile fallback
 */

import { useMemo, useState, useCallback } from 'react';
import { format, isToday, isYesterday, parseISO, differenceInDays } from 'date-fns';
import { useAuth } from '@/lib/auth-context';
import { useMeal, type CycleDeposit, type Cycle } from '@/lib/meal-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Wallet, TrendingUp, ArrowUpDown, Search, Copy, Check, ChevronDown,
  AlertCircle, ArrowUp, ArrowDown, Repeat2, Info, MessageCircle,
  ShoppingBag, Utensils, Banknote, RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `৳${Math.abs(amount).toFixed(2)}`;
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    const diff = differenceInDays(new Date(), date);
    if (diff < 7) return `${diff} days ago`;
    return format(date, 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatAbsoluteDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy, hh:mm a');
  } catch {
    return dateStr;
  }
}

type TxType = 'deposit' | 'refund' | 'carry_forward';

function classifyTx(deposit: CycleDeposit): TxType {
  const note = (deposit.note ?? '').toLowerCase();
  if (note.includes('carry') || note.includes('forward') || note.includes('opening')) return 'carry_forward';
  if (deposit.amount < 0 || note.includes('refund') || note.includes('deduct') || note.includes('correction')) return 'refund';
  return 'deposit';
}

// ── Unlinked State ────────────────────────────────────────────────────────────

function UnlinkedState({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-orange-400/10 ring-2 ring-amber-500/20">
          <AlertCircle className="h-9 w-9 text-amber-500" />
        </div>
      </div>
      <div className="max-w-xs space-y-2">
        <h2 className="text-lg font-bold text-foreground">Account Not Linked, {name}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your profile isn't linked to a mess member yet. Ask your Manager or Coordinator to link your account so your deposits can be tracked.
        </p>
      </div>
    </div>
  );
}

// ── Cycle Selector ────────────────────────────────────────────────────────────

function CycleSelector({
  cycles, selected, onChange,
}: { cycles: Cycle[]; selected: string; onChange: (id: string) => void }) {
  const selectedCycle = cycles.find((c) => c.id === selected);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs font-semibold">
          <RefreshCw className="h-3 w-3" />
          <span className="max-w-28 truncate">{selectedCycle?.name ?? 'Select Cycle'}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuRadioGroup value={selected} onValueChange={onChange}>
          {cycles.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id} className="text-xs">
              <span className="truncate">{c.name}</span>
              <Badge
                variant={c.status === 'active' ? 'default' : 'secondary'}
                className="ml-auto shrink-0 text-[9px] px-1.5 h-4 font-bold"
              >
                {c.status === 'active' ? 'Active' : 'Pending'}
              </Badge>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Transaction Card ──────────────────────────────────────────────────────────

function TxCard({ deposit }: { deposit: CycleDeposit }) {
  const txType = classifyTx(deposit);
  const isRefund = txType === 'refund';
  const isCarry = txType === 'carry_forward';

  const iconCls = isRefund
    ? 'bg-rose-500/10 text-rose-500'
    : isCarry
      ? 'bg-violet-500/10 text-violet-500'
      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

  const Icon = isRefund ? ArrowDown : isCarry ? Repeat2 : ArrowUp;
  const amountCls = isRefund ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400';
  const amountSign = isRefund ? '-' : '+';

  return (
    <div className="group flex items-center gap-3.5 rounded-xl border border-border/50 bg-card px-4 py-3.5 shadow-sm transition-all hover:border-border hover:shadow-md">
      {/* Icon */}
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconCls)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">
            {deposit.note?.trim() || (isRefund ? 'Deduction / Refund' : isCarry ? 'Opening Balance' : 'Deposit')}
          </p>
          {isCarry && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-bold shrink-0">
              Carry-Forward
            </Badge>
          )}
          {isRefund && (
            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-bold opacity-80 shrink-0">
              Refund
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground" title={formatAbsoluteDate(deposit.createdAt)}>
          {formatRelativeDate(deposit.createdAt)}
        </p>
      </div>

      {/* Amount */}
      <span className={cn('shrink-0 text-base font-extrabold tabular-nums', amountCls)}>
        {amountSign}৳{Math.abs(deposit.amount).toFixed(2)}
      </span>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Wallet className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {filtered ? 'No matching transactions' : 'No deposits yet'}
        </p>
        <p className="text-xs text-muted-foreground">
          {filtered ? 'Try a different filter or search term.' : 'Your deposits for this cycle will appear here.'}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'deposit' | 'refund' | 'carry_forward';
type SortOrder = 'newest' | 'oldest';

export function MemberDepositsView() {
  const { profile } = useAuth();
  const { members, deposits, cycles, activeCycle, pendingCycle, stats, getCycleDetails, loadCycleDetails } = useMeal();

  // ── Resolve linked member ──────────────────────────────────────────────────
  const myMember = useMemo(() => {
    if (!profile) return null;
    return (
      members.find((m) => m.profileId === profile.id) ??
      members.find((m) => m.name.toLowerCase().trim() === profile.full_name.toLowerCase().trim()) ??
      null
    );
  }, [members, profile]);

  // ── Available cycles (active + pending only) ───────────────────────────────
  const availableCycles = useMemo(() => {
    return cycles.filter((c) => c.status === 'active' || c.status === 'pending');
  }, [cycles]);

  const [selectedCycleId, setSelectedCycleId] = useState<string>(() => activeCycle?.id ?? pendingCycle?.id ?? '');
  const selectedCycle = availableCycles.find((c) => c.id === selectedCycleId) ?? availableCycles[0] ?? null;

  // Load details for the selected cycle if needed (for pending cycles)
  useMemo(() => {
    if (selectedCycleId && selectedCycleId !== activeCycle?.id) {
      void loadCycleDetails(selectedCycleId);
    }
  }, [selectedCycleId]);

  // ── Deposits for selected cycle ────────────────────────────────────────────
  const cycleDeposits = useMemo(() => {
    if (!myMember) return [];
    if (selectedCycleId === activeCycle?.id) {
      // Active cycle deposits come directly from context
      return deposits.filter((d) => d.memberId === myMember.id);
    }
    // Pending cycle: use getCycleDetails
    const details = selectedCycleId ? getCycleDetails(selectedCycleId) : null;
    if (!details) return [];
    return details.deposits.filter((d) => d.memberId === myMember.id);
  }, [myMember, selectedCycleId, activeCycle?.id, deposits, getCycleDetails]);

  // ── Cycle-aware stats ──────────────────────────────────────────────────────
  const cycleStats = useMemo(() => {
    if (!myMember) return null;
    if (selectedCycleId === activeCycle?.id) {
      const totalDeposited = cycleDeposits.reduce((s, d) => s + d.amount, 0);
      const mealCost = stats.currentMealRate * myMember.mealsEaten;
      const fixedCost = stats.fixedCostPerMember;
      const totalCost = mealCost + fixedCost;
      const balance = totalDeposited - totalCost;
      const utilPct = totalDeposited > 0 ? Math.min(100, Math.round((totalCost / totalDeposited) * 100)) : 0;
      return { totalDeposited, mealCost, fixedCost, totalCost, balance, utilPct, mealsEaten: myMember.mealsEaten };
    }
    // Pending cycle via getCycleDetails
    const details = getCycleDetails(selectedCycleId);
    if (!details) return null;
    const memberDetail = details.members.find((m) => m.id === myMember.id);
    if (!memberDetail) return null;
    const totalDeposited = cycleDeposits.reduce((s, d) => s + d.amount, 0);
    const { mealCost, fixedCost, totalCost, balance } = memberDetail;
    const utilPct = totalDeposited > 0 ? Math.min(100, Math.round((totalCost / totalDeposited) * 100)) : 0;
    return { totalDeposited, mealCost, fixedCost, totalCost, balance, utilPct, mealsEaten: memberDetail.mealsEaten };
  }, [myMember, selectedCycleId, activeCycle?.id, cycleDeposits, stats, getCycleDetails]);

  // ── Filter / search / sort ─────────────────────────────────────────────────
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const filteredDeposits = useMemo(() => {
    let list = [...cycleDeposits];
    // Filter by tab
    if (filterTab !== 'all') {
      list = list.filter((d) => classifyTx(d) === filterTab);
    }
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => (d.note ?? '').toLowerCase().includes(q) || d.amount.toString().includes(q));
    }
    // Sort
    list.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [cycleDeposits, filterTab, search, sortOrder]);

  // ── Copy Statement ─────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const copyStatement = useCallback(async () => {
    if (!cycleStats || !selectedCycle) return;
    const lines = [
      `📋 MealTrack Deposit Statement`,
      `Member: ${profile?.full_name ?? 'N/A'}`,
      `Cycle: ${selectedCycle.name}`,
      `─────────────────────────────`,
      `Total Deposited: ৳${cycleStats.totalDeposited.toFixed(2)}`,
      `Meal Cost (${cycleStats.mealsEaten} meals): ৳${cycleStats.mealCost.toFixed(2)}`,
      `Fixed Share: ৳${cycleStats.fixedCost.toFixed(2)}`,
      `Total Incurred: ৳${cycleStats.totalCost.toFixed(2)}`,
      `Net Balance: ${cycleStats.balance >= 0 ? '+' : '-'}৳${Math.abs(cycleStats.balance).toFixed(2)} ${cycleStats.balance >= 0 ? '(Surplus)' : '(Due)'}`,
      `─────────────────────────────`,
      `Transactions:`,
      ...cycleDeposits
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((d) => `• ${formatAbsoluteDate(d.createdAt)} — ${d.note?.trim() || 'Deposit'}: ${d.amount >= 0 ? '+' : ''}৳${d.amount.toFixed(2)}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [cycleStats, cycleDeposits, selectedCycle, profile]);

  // ── Guards ────────────────────────────────────────────────────────────────
  const displayName = profile?.full_name ?? 'Member';
  if (!myMember) {
    return (
      <div className="pb-24">
        <div className="mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-500/10 via-card to-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
              <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-heading tracking-tight">My Deposits</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Personal deposit history & ledger</p>
            </div>
          </div>
        </div>
        <Card className="glass-card border border-border/60">
          <CardContent className="p-4">
            <UnlinkedState name={displayName} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const filterTabs: { key: FilterTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'All', icon: <Wallet className="h-3 w-3" />, count: cycleDeposits.length },
    { key: 'deposit', label: 'Deposits', icon: <ArrowUp className="h-3 w-3" />, count: cycleDeposits.filter((d) => classifyTx(d) === 'deposit').length },
    { key: 'refund', label: 'Refunds', icon: <ArrowDown className="h-3 w-3" />, count: cycleDeposits.filter((d) => classifyTx(d) === 'refund').length },
    { key: 'carry_forward', label: 'Carry-Forward', icon: <Repeat2 className="h-3 w-3" />, count: cycleDeposits.filter((d) => classifyTx(d) === 'carry_forward').length },
  ];

  return (
    <div className="space-y-4 pb-28">

      {/* ── Page Header ── */}
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-card to-card p-4 sm:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight truncate">My Deposits</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Personal deposit history & ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {availableCycles.length > 1 && (
              <CycleSelector cycles={availableCycles} selected={selectedCycleId} onChange={setSelectedCycleId} />
            )}
            {availableCycles.length <= 1 && selectedCycle && (
              <Badge variant={selectedCycle.status === 'active' ? 'default' : 'secondary'} className="text-[10px] font-bold">
                {selectedCycle.name} · {selectedCycle.status === 'active' ? 'Active' : 'Pending'}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs font-semibold"
              onClick={() => void copyStatement()}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Statement'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Financial Hero Card ── */}
      {cycleStats && (
        <Card
          className={cn(
            'relative overflow-hidden border-none text-white shadow-xl',
            cycleStats.balance >= 0
              ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800'
              : 'bg-gradient-to-br from-rose-600 via-rose-700 to-orange-800'
          )}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-white/5 blur-2xl" />

          <CardHeader className="pb-1 pt-4 px-4 sm:px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/80">
                <TrendingUp className="h-3.5 w-3.5" /> Net Balance
              </CardTitle>
              <span className={cn(
                'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md',
                cycleStats.balance >= 0
                  ? 'border-emerald-300/30 bg-emerald-400/20 text-emerald-100'
                  : 'border-rose-300/30 bg-rose-400/20 text-rose-100'
              )}>
                {cycleStats.balance >= 0 ? '✓ In Good Standing' : '! Payment Due'}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 px-4 pb-5 pt-1 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                {cycleStats.balance >= 0 ? '+' : '-'}{formatCurrency(cycleStats.balance)}
              </span>
              <p className="text-sm font-semibold text-white/80">
                {cycleStats.balance >= 0 ? 'Surplus' : 'Owed to mess'}
              </p>
            </div>
            <p className="mt-1 text-sm font-medium text-white/70">
              {cycleStats.balance >= 0 ? "You're all clear" : 'Please clear your due'}
            </p>

            {/* Cost breakdown sub-boxes */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md hover:bg-white/15 transition-colors">
                <div className="flex items-center gap-1 mb-0.5"><Utensils className="h-2.5 w-2.5 text-white/60" /><p className="text-[9px] font-bold uppercase tracking-wider text-white/70">Meal Cost</p></div>
                <p className="font-heading text-base font-extrabold text-white">{formatCurrency(cycleStats.mealCost)}</p>
                <p className="text-[9px] text-white/50 mt-0.5">{cycleStats.mealsEaten} meals</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md hover:bg-white/15 transition-colors">
                <div className="flex items-center gap-1 mb-0.5"><ShoppingBag className="h-2.5 w-2.5 text-white/60" /><p className="text-[9px] font-bold uppercase tracking-wider text-white/70">Fixed Share</p></div>
                <p className="font-heading text-base font-extrabold text-white">{formatCurrency(cycleStats.fixedCost)}</p>
                <p className="text-[9px] text-white/50 mt-0.5">Bills & utilities</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-md hover:bg-white/15 transition-colors">
                <div className="flex items-center gap-1 mb-0.5"><Banknote className="h-2.5 w-2.5 text-white/60" /><p className="text-[9px] font-bold uppercase tracking-wider text-white/70">Deposited</p></div>
                <p className="font-heading text-base font-extrabold text-white">{formatCurrency(cycleStats.totalDeposited)}</p>
                <p className="text-[9px] text-white/50 mt-0.5">{cycleDeposits.filter((d) => d.amount > 0).length} transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Transaction Timeline ── */}
      <Card className="glass-card border border-border/70 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Transaction History
            </CardTitle>
            {/* Sort toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => setSortOrder((s) => s === 'newest' ? 'oldest' : 'newest')}
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by note or amount…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold transition-all',
                  filterTab === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[9px] font-semibold leading-tight',
                    filterTab === tab.key
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted-foreground/15 text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Transaction list */}
          <div className="space-y-2">
            {filteredDeposits.length === 0 ? (
              <EmptyState filtered={filterTab !== 'all' || search.trim().length > 0} />
            ) : (
              filteredDeposits.map((deposit) => <TxCard key={deposit.id} deposit={deposit} />)
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Deposit Instructions Card ── */}
      <Card className="glass-card border border-blue-500/20 shadow-sm">
        <CardContent className="px-4 py-4">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Info className="h-4 w-4 text-blue-500" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">How to Submit a Deposit</p>
              <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
                <p className="flex items-start gap-1.5"><MessageCircle className="h-3 w-3 mt-0.5 text-blue-400 shrink-0" /> Contact your Manager to record your deposit.</p>
                <p className="flex items-start gap-1.5"><Banknote className="h-3 w-3 mt-0.5 text-blue-400 shrink-0" /> Pay via cash, bKash, Nagad, or other agreed method.</p>
                <p className="flex items-start gap-1.5"><Check className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" /> Your balance updates here once the Manager records it.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
