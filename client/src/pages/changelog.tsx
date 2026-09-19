import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  DollarSign,
  Loader2,
  PlusCircle,
  RefreshCcw,
  ScrollText,
  Search,
  Trash2,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  useMeal,
  type ChangelogAction,
  type ChangelogActor,
  type ChangelogChange,
  type ChangelogEntityType,
  type ChangelogEntry,
} from '@/lib/meal-context';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';

// ── Config ─────────────────────────────────────────────────────────────────────

const ACTION_FILTERS: { label: string; value: ChangelogAction | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Created', value: 'create' },
  { label: 'Updated', value: 'update' },
  { label: 'Deleted', value: 'delete' },
];

const ENTITY_FILTERS: {
  label: string;
  value: ChangelogEntityType | 'all';
  icon: React.ElementType;
}[] = [
  { label: 'All', value: 'all', icon: ClipboardList },
  { label: 'Members', value: 'member', icon: Users },
  { label: 'Meals', value: 'meal_log', icon: UtensilsCrossed },
  { label: 'Expenses', value: 'expense', icon: DollarSign },
  { label: 'Deposits', value: 'deposit', icon: RefreshCcw },
];

// ── Pure helpers ───────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  const abs = Math.abs(value).toFixed(2);
  return value < 0 ? `-৳${abs}` : `৳${abs}`;
}

function formatValue(value: string | number | boolean | null | undefined): string {
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    if (isValid(parsed) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return format(parsed, 'PPP');
    }
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return 'Empty';
  return String(value);
}

function getChange(entry: ChangelogEntry, field: string) {
  return entry.changes.find((c) => c.field === field);
}

function getDisplayAction(entry: ChangelogEntry): ChangelogAction {
  return entry.entityType === 'deposit' ? 'update' : entry.action;
}

function getDisplayTitle(entry: ChangelogEntry): string {
  if (entry.entityType === 'deposit') {
    const member = getChange(entry, 'member')?.value;
    return `Updated deposit for ${member ?? 'member'}`;
  }
  return entry.title;
}

function getEntrySummary(entry: ChangelogEntry): string {
  if (entry.entityType === 'meal_log') {
    const dateChange = getChange(entry, 'date');
    const changedMembers =
      entry.changes.filter((c) => c.field.startsWith('member:')).length || 1;
    const formattedDate = dateChange
      ? formatValue(dateChange.value)
      : format(new Date(entry.createdAt), 'PPP');
    return `${formattedDate} · ${changedMembers} ${changedMembers === 1 ? 'member change' : 'member changes'}`;
  }

  if (entry.entityType === 'deposit') {
    const txChange =
      getChange(entry, 'transaction_amount') ?? getChange(entry, 'amount');
    if (txChange && typeof txChange.value === 'number') {
      const prefix = txChange.value < 0 ? 'Deduction' : 'Transaction';
      return `${prefix}: ${formatCurrency(txChange.value)}`;
    }
    return 'Deposit balance updated';
  }

  const meaningful = entry.changes.filter(
    (c) => c.field !== 'member' && c.field !== 'members_changed',
  );
  if (meaningful.length === 0) return 'View details';
  return meaningful
    .slice(0, 2)
    .map((c) => formatChangeLabel(c))
    .join(' · ');
}

function formatChangeLabel(change: ChangelogChange): string {
  if (
    typeof change.value === 'number' &&
    ['amount', 'deposit_balance', 'transaction_amount'].includes(change.field)
  ) {
    return `${change.label}: ${formatCurrency(change.value)}`;
  }
  if (
    typeof change.from === 'number' &&
    typeof change.to === 'number' &&
    ['amount', 'deposit_balance', 'transaction_amount'].includes(change.field)
  ) {
    return `${change.label}: ${formatCurrency(change.from)} → ${formatCurrency(change.to)}`;
  }
  if (change.from !== undefined || change.to !== undefined) {
    return `${change.label}: ${formatValue(change.from)} → ${formatValue(change.to)}`;
  }
  return `${change.label}: ${formatValue(change.value)}`;
}

function getDetailedChanges(entry: ChangelogEntry): ChangelogChange[] {
  if (
    entry.entityType === 'meal_log' &&
    entry.changes.some((c) => c.field.startsWith('member:'))
  ) {
    return [
      ...entry.changes.filter((c) => c.field === 'date'),
      ...entry.changes.filter((c) => c.field.startsWith('member:')),
    ];
  }
  if (entry.entityType === 'deposit') {
    const member = getChange(entry, 'member');
    const balance = getChange(entry, 'deposit_balance');
    const transaction =
      getChange(entry, 'transaction_amount') ?? getChange(entry, 'amount');
    const note = getChange(entry, 'note');
    return [
      ...(member ? [member] : []),
      ...(balance ? [balance] : []),
      ...(transaction ? [{ ...transaction, field: 'transaction_amount', label: 'Transaction' }] : []),
      ...(note ? [note] : []),
    ];
  }
  return entry.changes.filter((c) => c.field !== 'members_changed');
}

function filterEntries(
  entries: ChangelogEntry[],
  actionFilter: ChangelogAction | 'all',
  entityFilter: ChangelogEntityType | 'all',
  search: string,
) {
  const term = search.toLowerCase().trim();
  return entries.filter((entry) => {
    if (actionFilter !== 'all' && getDisplayAction(entry) !== actionFilter) return false;
    if (entityFilter !== 'all' && entry.entityType !== entityFilter) return false;
    if (term) {
      const titleMatch = getDisplayTitle(entry).toLowerCase().includes(term);
      const authorMatch = entry.actor?.name.toLowerCase().includes(term) ?? false;
      const summaryMatch = getEntrySummary(entry).toLowerCase().includes(term);
      if (!titleMatch && !authorMatch && !summaryMatch) return false;
    }
    return true;
  });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Action styling ─────────────────────────────────────────────────────────────

const ACTION_STYLE: Record<ChangelogAction, { dot: string; badge: string; label: string; icon: React.ElementType }> = {
  create: {
    dot: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    label: 'Created',
    icon: PlusCircle,
  },
  update: {
    dot: 'bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.15)]',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    label: 'Updated',
    icon: RefreshCcw,
  },
  delete: {
    dot: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    label: 'Deleted',
    icon: Trash2,
  },
};

const ENTITY_STYLE: Record<ChangelogEntityType, { icon: React.ElementType; label: string; color: string }> = {
  member: { icon: Users, label: 'Member', color: 'text-violet-500' },
  expense: { icon: DollarSign, label: 'Expense', color: 'text-blue-500' },
  meal_log: { icon: UtensilsCrossed, label: 'Meal', color: 'text-orange-500' },
  deposit: { icon: RefreshCcw, label: 'Deposit', color: 'text-teal-500' },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActorAvatar({ actor }: { actor?: ChangelogActor | null }) {
  if (!actor) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-background">
        <span className="text-[10px] font-semibold text-muted-foreground">SYS</span>
      </div>
    );
  }

  return (
    <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background">
      {actor.pictureUrl && <AvatarImage src={actor.pictureUrl} alt={actor.name} />}
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {getInitials(actor.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function ChangeValuePill({ label, value, type }: { label: string; value: string; type: 'from' | 'to' | 'single' }) {
  const styles = {
    from: 'bg-rose-500/8 text-rose-600 dark:text-rose-400 line-through opacity-75',
    to: 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 font-medium',
    single: 'bg-primary/8 text-primary font-medium',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs', styles[type])}>
      {label && <span className="mr-1 text-muted-foreground">{label}:</span>}
      {value}
    </span>
  );
}

function ChangeRow({ change, entry }: { change: ChangelogChange; entry: ChangelogEntry }) {
  const isCurrency =
    ['amount', 'deposit_balance', 'transaction_amount'].includes(change.field);

  const formatVal = (v: string | number | boolean | null | undefined) => {
    if (isCurrency && typeof v === 'number') return formatCurrency(v);
    return formatValue(v);
  };

  if (change.from !== undefined || change.to !== undefined) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium text-foreground/70">{change.label}</span>
        <ChangeValuePill label="" value={formatVal(change.from)} type="from" />
        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
        <ChangeValuePill label="" value={formatVal(change.to)} type="to" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-medium text-foreground/70">{change.label}</span>
      <ChangeValuePill label="" value={formatVal(change.value)} type={entry.action === 'delete' ? 'from' : 'to'} />
    </div>
  );
}

function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);

  const displayAction = getDisplayAction(entry);
  const actionStyle = ACTION_STYLE[displayAction];
  const entityStyle = ENTITY_STYLE[entry.entityType];
  const EntityIcon = entityStyle.icon;
  const detailed = getDetailedChanges(entry);
  const summary = getEntrySummary(entry);

  const timestamp = new Date(entry.createdAt);
  const relativeTime = formatDistanceToNow(timestamp, { addSuffix: true });
  const exactTime = format(timestamp, "MMM d, yyyy 'at' h:mm a");

  return (
    <div className="group relative flex gap-3">
      {/* Timeline dot */}
      <div className="relative flex flex-col items-center">
        <div
          className={cn(
            'relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full transition-transform group-hover:scale-125',
            actionStyle.dot,
          )}
        />
      </div>

      {/* Card */}
      <div className="min-w-0 flex-1 pb-6">
        <div
          className={cn(
            'overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200',
            open ? 'shadow-md' : 'hover:shadow-md',
          )}
        >
          {/* Header */}
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              {/* Left: title + meta */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-semibold leading-tight">{getDisplayTitle(entry)}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{summary}</p>
              </div>
              {/* Right: badges */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn('gap-1 border text-[11px]', ENTITY_STYLE[entry.entityType].color.replace('text-', 'border-').replace('-500', '-500/30'))}>
                  <EntityIcon className={cn('h-3 w-3', entityStyle.color)} />
                  {entityStyle.label}
                </Badge>
                <Badge variant="outline" className={cn('border text-[11px]', actionStyle.badge)}>
                  {actionStyle.label}
                </Badge>
              </div>
            </div>

            {/* Footer: author + time + expand button */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <ActorAvatar actor={entry.actor} />
                <p className="text-xs font-medium leading-none">
                  {entry.actor?.name ?? 'System'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span title={exactTime} className="text-[11px] text-muted-foreground">
                  {relativeTime}
                </span>
                {detailed.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setOpen((o) => !o)}
                  >
                    Details
                    <ChevronsUpDown className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Expanded details */}
          {open && detailed.length > 0 && (
            <div className="border-t bg-muted/30 px-4 py-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Change Details
              </p>
              <div className="space-y-2">
                {detailed.map((change, idx) => (
                  <ChangeRow key={`${entry.id}-${change.field}-${idx}`} change={change} entry={entry} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangelogSection({
  title,
  description,
  entries,
  cycleStat,
}: {
  title: string;
  description: string;
  entries: ChangelogEntry[];
  cycleStat?: { create: number; update: number; delete: number };
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {cycleStat && (
            <div className="flex gap-1.5">
              <span className="rounded-md border bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                +{cycleStat.create}
              </span>
              <span className="rounded-md border bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                ~{cycleStat.update}
              </span>
              <span className="rounded-md border bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                -{cycleStat.delete}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-180')} />
            {collapsed ? 'Show' : 'Hide'}
          </Button>
        </div>
      </div>

      {!collapsed && (
        entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No matching entries in this section.</p>
          </div>
        ) : (
          <div className="relative pl-4">
            {/* Vertical timeline line */}
            <div className="absolute left-[5px] top-0 h-full w-px bg-border" />
            <div className="space-y-0">
              {entries.map((entry) => (
                <ChangelogCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )
      )}
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  const [, setLocation] = useLocation();
  const { profile } = useAuth();
  const {
    activeCycle,
    activeCycleChangelogEntries,
    pendingCycle,
    pendingCycleChangelogEntries,
    hasMoreChangelogEntries,
    changelogLoading,
    loadMoreChangelogEntries,
  } = useMeal();

  const [actionFilter, setActionFilter] = useState<ChangelogAction | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<ChangelogEntityType | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (profile?.role === 'member') setLocation('/app');
  }, [profile?.role, setLocation]);

  if (profile?.role === 'member') return null;

  const filteredPending = useMemo(
    () => filterEntries(pendingCycleChangelogEntries, actionFilter, entityFilter, search),
    [actionFilter, entityFilter, pendingCycleChangelogEntries, search],
  );

  const filteredActive = useMemo(
    () => filterEntries(activeCycleChangelogEntries, actionFilter, entityFilter, search),
    [actionFilter, activeCycleChangelogEntries, entityFilter, search],
  );

  const hasCycleSections = Boolean(pendingCycle || activeCycle);

  const computeStats = (entries: ChangelogEntry[]) => ({
    create: entries.filter((e) => getDisplayAction(e) === 'create').length,
    update: entries.filter((e) => getDisplayAction(e) === 'update').length,
    delete: entries.filter((e) => getDisplayAction(e) === 'delete').length,
  });

  return (
    <div className="space-y-6 pb-10">
      {/* Page header */}
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <ScrollText className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">Changelog</h1>
              <p className="hidden sm:block mt-1 text-sm leading-6 text-muted-foreground">
                {pendingCycle
                  ? 'Track settlement changes in the pending cycle alongside new active cycle activity.'
                  : activeCycle
                    ? 'Track create, update, and delete activity for the current active cycle.'
                    : 'No active cycle is available yet.'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = '/app/history';
              }
            }}
            className="gap-1.5 border-border/80 bg-background/80 shadow-sm transition-all hover:bg-background hover:shadow shrink-0 sm:h-9"
          >
            <ArrowLeft className="h-4 w-4 text-primary" />
            <span>Back</span>
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        {/* Search */}
        <InputGroup>
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput
            id="changelog-search"
            placeholder="Search by title, description, or author name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>

        {/* Action filter pills */}
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-muted-foreground">Action:</span>
          {ACTION_FILTERS.map((opt) => {
            const isActive = actionFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setActionFilter(opt.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Entity filter pills */}
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs font-medium text-muted-foreground">Type:</span>
          {ENTITY_FILTERS.map((opt) => {
            const isActive = entityFilter === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setEntityFilter(opt.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {!hasCycleSections ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="font-medium">No cycle data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a new cycle to begin tracking changes here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {activeCycle && (
            <ChangelogSection
              title="Active Cycle"
              description="Changes happening in the current running cycle."
              entries={filteredActive}
              cycleStat={computeStats(filteredActive)}
            />
          )}

          {pendingCycle && (
            <ChangelogSection
              title="Pending Cycle"
              description="Settlement and correction activity for the cycle awaiting finalization."
              entries={filteredPending}
              cycleStat={computeStats(filteredPending)}
            />
          )}

          {hasMoreChangelogEntries && (
            <div className="flex justify-center pt-2">
              <Button
                id="changelog-load-more"
                type="button"
                variant="outline"
                onClick={() => void loadMoreChangelogEntries()}
                disabled={changelogLoading}
                className="gap-2"
              >
                {changelogLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {changelogLoading ? 'Loading…' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
