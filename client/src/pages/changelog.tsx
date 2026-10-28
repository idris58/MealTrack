import { useEffect, useState } from 'react';
import { format, formatDistanceToNow, isToday, isValid, isYesterday, parseISO } from 'date-fns';
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
import { Skeleton } from '@/components/ui/skeleton';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  useMealActions,
  useMealData,
  type ChangelogAction,
  type ChangelogActor,
  type ChangelogChange,
  type ChangelogEntityType,
  type ChangelogEntry,
} from '@/lib/meal-context';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';
import { PageHeader } from '@/components/page-header';

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
  return entry.action;
}

type DisplayChangelogEntry = ChangelogEntry & {
  deletedThenRestored?: boolean;
  editChain?: ChangelogEntry[];
};

function numericValue(value: ChangelogChange['value'] | ChangelogChange['from'] | ChangelogChange['to']) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedCurrency(value: number) {
  return `${value < 0 ? '−' : '+'}${formatCurrency(Math.abs(value))}`;
}

function getDepositAmount(entry: ChangelogEntry) {
  return numericValue(
    getChange(entry, 'transaction_amount')?.value ?? getChange(entry, 'amount')?.value,
  );
}

function getDisplayTitle(entry: DisplayChangelogEntry): string {
  if (entry.editChain && entry.editChain.length >= 3) {
    return `${getEditChainLabel(entry.editChain[0])} · ${entry.editChain.length} edits`;
  }
  if (entry.entityType === 'deposit') {
    const amount = getDepositAmount(entry);
    const member = getChange(entry, 'member')?.value;
    if (amount !== null) {
      const kind = amount < 0 ? 'Deduction' : 'Deposit';
      const removed = entry.action === 'delete' ? 'Deleted ' : '';
      return `${removed}${kind} ${formatSignedCurrency(amount)}${member ? ` for ${member}` : ''}`;
    }
  }
  if (entry.title.startsWith('Restored')) {
    const restoredItem = entry.title.replace(/^Restored\s*/i, '');
    return entry.deletedThenRestored ? `Deleted then restored ${restoredItem}` : entry.title;
  }
  if (entry.entityType === 'meal_log') {
    const changedMembers = entry.changes.filter((change) => change.field.startsWith('member:')).length;
    if (changedMembers > 0) {
      return `Meals updated for ${changedMembers} ${changedMembers === 1 ? 'member' : 'members'}`;
    }
  }
  return entry.title;
}

function mealLogChanges(entry: ChangelogEntry) {
  return entry.changes.filter((change) => change.field.startsWith('member:'));
}

function mealCount(value: ChangelogChange['from'] | ChangelogChange['to']) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMealCount(value: number) {
  return formatValue(value);
}

function formatSignedMealCount(value: number) {
  return `${value >= 0 ? '+' : ''}${formatMealCount(value)}`;
}

function getEntrySummary(entry: ChangelogEntry): string {
  if (entry.entityType === 'meal_log') {
    const dateChange = getChange(entry, 'date');
    const dateValue = typeof dateChange?.value === 'string' ? parseISO(dateChange.value) : null;
    const entryDate = parseISO(entry.createdAt);
    const formattedDate = dateValue && isValid(dateValue)
      ? format(dateValue, 'd MMM')
      : isValid(entryDate)
        ? format(entryDate, 'd MMM')
        : 'Unknown date';
    const rows = mealLogChanges(entry);
    const net = rows.reduce((sum, change) => sum + mealCount(change.to) - mealCount(change.from), 0);
    const memberLabel = `${rows.length} ${rows.length === 1 ? 'member' : 'members'}`;
    return `${formattedDate} · ${memberLabel} · ${formatSignedMealCount(net)} meals`;
  }

  if (entry.entityType === 'deposit') {
    const balanceChange = getChange(entry, 'deposit_balance');
    const balanceFrom = numericValue(balanceChange?.from);
    const balanceTo = numericValue(balanceChange?.to);
    if (balanceFrom !== null && balanceTo !== null) {
      return `Balance ${formatCurrency(balanceFrom)} → ${formatCurrency(balanceTo)}`;
    }
    const amount = getDepositAmount(entry);
    if (amount !== null) {
      const prefix = amount < 0 ? 'Deduction' : 'Deposit';
      return `${prefix}: ${formatSignedCurrency(amount)}`;
    }
    return 'Deposit balance updated';
  }

  if (entry.entityType === 'expense') {
    const amountChange = getChange(entry, 'amount');
    const from = numericValue(amountChange?.from);
    const to = numericValue(amountChange?.to);
    if (from !== null && to !== null) {
      const amountSummary = `${formatCurrency(from)} → ${formatCurrency(to)} (${formatSignedCurrency(to - from)})`;
      const otherChanges = entry.changes
        .filter((change) => change.field !== 'amount')
        .slice(0, 1)
        .map(formatChangeLabel);
      return [amountSummary, ...otherChanges].join(' · ');
    }
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

function collapseRestorePairs(entries: ChangelogEntry[]): DisplayChangelogEntry[] {
  const pairedDeleteIds = new Set<string>();
  const pairedRestoreIds = new Set<string>();

  for (const restored of entries) {
    if (!restored.title.startsWith('Restored')) continue;
    const restoredAt = Date.parse(restored.createdAt);
    const matchingDelete = entries
      .filter((candidate) => candidate.action === 'delete'
        && candidate.entityType === restored.entityType
        && candidate.entityId === restored.entityId
        && candidate.cycleId === restored.cycleId
        && candidate.actor?.id === restored.actor?.id
        && !pairedDeleteIds.has(candidate.id))
      .map((candidate) => ({ candidate, deletedAt: Date.parse(candidate.createdAt) }))
      .filter(({ deletedAt }) => Number.isFinite(deletedAt)
        && deletedAt <= restoredAt
        && restoredAt - deletedAt <= 10_000)
      .sort((a, b) => b.deletedAt - a.deletedAt)[0]?.candidate;

    if (matchingDelete) {
      pairedDeleteIds.add(matchingDelete.id);
      pairedRestoreIds.add(restored.id);
    }
  }

  return entries
    .filter((entry) => !pairedDeleteIds.has(entry.id))
    .map((entry) => ({ ...entry, deletedThenRestored: pairedRestoreIds.has(entry.id) }));
}

function collapseEditChains(entries: DisplayChangelogEntry[]): DisplayChangelogEntry[] {
  const collapsed: DisplayChangelogEntry[] = [];

  for (let index = 0; index < entries.length;) {
    const first = entries[index];
    if (first.action !== 'update' || first.title.startsWith('Restored')) {
      collapsed.push(first);
      index++;
      continue;
    }

    const chain = [first];
    let nextIndex = index + 1;
    while (nextIndex < entries.length) {
      const next = entries[nextIndex];
      if (
        next.action !== 'update'
        || next.title.startsWith('Restored')
        || next.entityType !== first.entityType
        || next.entityId !== first.entityId
        || next.cycleId !== first.cycleId
      ) break;
      chain.push(next);
      nextIndex++;
    }

    if (chain.length >= 3) collapsed.push({ ...first, editChain: chain });
    else collapsed.push(...chain);
    index = nextIndex;
  }

  return collapsed;
}

function getEditChainLabel(entry: ChangelogEntry) {
  if (entry.entityType === 'member') {
    const name = getChange(entry, 'name');
    const latestName = name?.to ?? name?.value;
    if (typeof latestName === 'string' && latestName) return latestName;
    return entry.title.replace(/^(Updated|Added|Archived|Restored) member\s+/i, '');
  }
  if (entry.entityType === 'expense') {
    const description = getChange(entry, 'description');
    const latestDescription = description?.to ?? description?.value;
    if (typeof latestDescription === 'string' && latestDescription) return latestDescription;
  }
  return getDisplayTitle(entry);
}

function getDetailedChanges(entry: ChangelogEntry): ChangelogChange[] {
  if (entry.entityType === 'meal_log') return mealLogChanges(entry);
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

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function groupEntriesByDay(entries: ChangelogEntry[]) {
  const groups = new Map<string, { label: string; entries: ChangelogEntry[] }>();

  for (const entry of entries) {
    const date = parseISO(entry.createdAt);
    const key = isValid(date) ? format(date, 'yyyy-MM-dd') : 'unknown-date';
    const label = !isValid(date)
      ? 'Unknown date'
      : isToday(date)
        ? 'Today'
        : isYesterday(date)
          ? 'Yesterday'
          : format(date, 'EEE, d MMM yyyy');
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { label, entries: [entry] });
  }

  return Array.from(groups, ([key, group]) => ({ key, ...group }));
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

const ENTITY_STYLE: Record<ChangelogEntityType, { icon: React.ElementType; label: string; color: string; border: string }> = {
  member: { icon: Users, label: 'Member', color: 'text-violet-500', border: 'border-violet-500/30' },
  expense: { icon: DollarSign, label: 'Expense', color: 'text-blue-500', border: 'border-blue-500/30' },
  meal_log: { icon: UtensilsCrossed, label: 'Meal', color: 'text-orange-500', border: 'border-orange-500/30' },
  deposit: { icon: RefreshCcw, label: 'Deposit', color: 'text-teal-500', border: 'border-teal-500/30' },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActorAvatar({ actor }: { actor?: ChangelogActor | null }) {
  if (!actor) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-background">
        <span className="text-xs font-semibold text-muted-foreground">SYS</span>
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

  if (entry.entityType === 'expense' && change.field === 'amount') {
    const from = numericValue(change.from);
    const to = numericValue(change.to);
    if (from !== null && to !== null) {
      const delta = to - from;
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-foreground/70">Amount</span>
          <span className="tabular-nums text-muted-foreground">{formatCurrency(from)}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          <span className="tabular-nums font-medium">{formatCurrency(to)}</span>
          <span className={cn(
            'rounded px-1.5 font-semibold tabular-nums',
            delta > 0
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              : delta < 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground',
          )}>
            {formatSignedCurrency(delta)}
          </span>
        </div>
      );
    }
  }

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

function MealDiff({ changes }: { changes: ChangelogChange[] }) {
  const rows = changes.filter((change) => change.field.startsWith('member:'));
  const net = rows.reduce((sum, change) => sum + mealCount(change.to) - mealCount(change.from), 0);

  return (
    <div className="space-y-1.5">
      {rows.map((change) => {
        const from = mealCount(change.from);
        const to = mealCount(change.to);
        const delta = to - from;
        return (
          <div key={change.field} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-1.5 text-xs">
            <span className="min-w-0 truncate font-medium">{change.label}</span>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              <span className="text-muted-foreground line-through">{formatMealCount(from)}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
              <b>{formatMealCount(to)}</b>
              <span className={cn(
                'rounded px-1.5 font-semibold',
                delta > 0
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : delta < 0
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-muted text-muted-foreground',
              )}>
                {formatSignedMealCount(delta)}
              </span>
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-right text-xs text-muted-foreground">
        Net {formatSignedMealCount(net)} meals · {rows.length} {rows.length === 1 ? 'member' : 'members'}
      </p>
    </div>
  );
}

function EditChainHistory({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <ol className="space-y-2.5">
      {[...entries].reverse().map((edit) => {
        const changes = getDetailedChanges(edit);
        const timestamp = new Date(edit.createdAt);
        return (
          <li key={edit.id} className="relative rounded-lg border bg-background px-3 py-2.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-xs font-medium">{edit.actor?.name ?? 'System'}</span>
              <time
                dateTime={edit.createdAt}
                title={format(timestamp, "MMM d, yyyy 'at' h:mm a")}
                className="text-xs text-muted-foreground"
              >
                {formatDistanceToNow(timestamp, { addSuffix: true })}
              </time>
            </div>
            <div className="space-y-2">
              {edit.entityType === 'meal_log' ? (
                <MealDiff changes={changes} />
              ) : changes.map((change, index) => (
                <ChangeRow key={`${edit.id}-${change.field}-${index}`} change={change} entry={edit} />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ChangelogCard({ entry }: { entry: DisplayChangelogEntry }) {
  const [open, setOpen] = useState(false);

  const displayAction = getDisplayAction(entry);
  const actionStyle = ACTION_STYLE[displayAction];
  const entityStyle = ENTITY_STYLE[entry.entityType];
  const EntityIcon = entityStyle.icon;
  const detailed = getDetailedChanges(entry);
  const summary = getEntrySummary(entry);
  const isRestore = entry.title.startsWith('Restored');
  const depositAmount = entry.entityType === 'deposit' ? getDepositAmount(entry) : null;
  const depositBadge = entry.entityType === 'deposit' && entry.action !== 'delete' && depositAmount !== null;
  const badgeLabel = isRestore
    ? 'Restored'
    : depositBadge
      ? depositAmount < 0 ? 'Deduction' : 'Deposit'
      : actionStyle.label;
  const badgeClass = isRestore
    ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
    : depositBadge
      ? depositAmount < 0
        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      : actionStyle.badge;
  const timelineDotClass = isRestore
    ? 'bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.15)]'
    : depositBadge
      ? depositAmount < 0
        ? 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]'
        : ACTION_STYLE.create.dot
      : actionStyle.dot;

  const timestamp = new Date(entry.createdAt);
  const relativeTime = formatDistanceToNow(timestamp, { addSuffix: true });
  const exactTime = format(timestamp, "MMM d, yyyy 'at' h:mm a");
  const detailsId = `changelog-details-${entry.id}`;
  const toggleDetails = () => {
    if (detailed.length > 0) setOpen((current) => !current);
  };
  const handleHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDetails();
    }
  };

  return (
    <div className="group relative flex gap-3">
      {/* Timeline dot */}
      <div className="relative flex flex-col items-center">
        <div
          className={cn(
            'relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full transition-transform group-hover:scale-125',
            timelineDotClass,
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
            <div
              role={detailed.length > 0 ? 'button' : undefined}
              tabIndex={detailed.length > 0 ? 0 : undefined}
              aria-expanded={detailed.length > 0 ? open : undefined}
              aria-controls={detailed.length > 0 ? detailsId : undefined}
              onClick={toggleDetails}
              onKeyDown={handleHeaderKeyDown}
              className={cn(
                'flex flex-wrap items-start justify-between gap-3 rounded-md',
                detailed.length > 0 && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              {/* Left: title + meta */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-semibold leading-tight">{getDisplayTitle(entry)}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{summary}</p>
              </div>
              {/* Right: badges */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn('gap-1 border text-xs', entityStyle.border)}>
                  <EntityIcon className={cn('h-3 w-3', entityStyle.color)} />
                  {entityStyle.label}
                </Badge>
                <Badge variant="outline" className={cn('border text-xs', badgeClass)}>
                  {badgeLabel}
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
                <span title={exactTime} className="text-xs text-muted-foreground">
                  {relativeTime}
                </span>
                {detailed.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    aria-expanded={open}
                    aria-controls={detailsId}
                    onClick={toggleDetails}
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
            <div id={detailsId} className="border-t bg-muted/30 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Change Details
              </p>
              <div className="space-y-2">
                {entry.editChain ? (
                  <EditChainHistory entries={entry.editChain} />
                ) : entry.entityType === 'meal_log' ? (
                  <MealDiff changes={detailed} />
                ) : detailed.map((change, idx) => (
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

function ChangelogSkeletonCards() {
  return (
    <div className="relative space-y-3 pl-4" aria-label="Loading changelog entries" aria-busy="true">
      <div className="absolute left-[5px] top-0 h-full w-px bg-border" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="relative rounded-xl border bg-card p-4 shadow-sm">
          <span className="absolute -left-[13px] top-6 h-3 w-3 rounded-full bg-muted ring-4 ring-background" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Skeleton className="h-5 w-14 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangelogSection({
  title,
  description,
  entries,
  cycleStat,
  loading,
}: {
  title: string;
  description: string;
  entries: DisplayChangelogEntry[];
  cycleStat?: { create: number; update: number; delete: number };
  loading: boolean;
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
          loading ? (
            <ChangelogSkeletonCards />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No matching entries in this section.</p>
            </div>
          )
        ) : (
          <div className="relative pl-4">
            {/* Vertical timeline line */}
            <div className="absolute left-[5px] top-0 h-full w-px bg-border" />
            <div className="space-y-0">
              {groupEntriesByDay(entries).map((group) => (
                <div key={group.key}>
                  <h3 className="sticky top-16 z-10 -ml-4 flex items-center gap-2 bg-background/90 py-2 text-sm font-semibold text-foreground backdrop-blur">
                    <span>{group.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">· {group.entries.length} {group.entries.length === 1 ? 'change' : 'changes'}</span>
                  </h3>
                  {group.entries.map((entry) => (
                    <ChangelogCard key={entry.id} entry={entry} />
                  ))}
                </div>
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
  } = useMealData();
  const { loadMoreChangelogEntries } = useMealActions();

  const [actionFilter, setActionFilter] = useState<ChangelogAction | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<ChangelogEntityType | 'all'>('all');
  const [search, setSearch] = useState('');
  const cycleIds = [pendingCycle?.id, activeCycle?.id].filter((id): id is string => Boolean(id));
  const displayedActiveEntries = collapseEditChains(collapseRestorePairs(activeCycleChangelogEntries));
  const displayedPendingEntries = collapseEditChains(collapseRestorePairs(pendingCycleChangelogEntries));

  useEffect(() => {
    const scopedCycleIds = [pendingCycle?.id, activeCycle?.id].filter((id): id is string => Boolean(id));
    if (scopedCycleIds.length) void loadMoreChangelogEntries(scopedCycleIds, entityFilter, actionFilter, search, true);
  }, [activeCycle?.id, pendingCycle?.id, actionFilter, entityFilter, search, loadMoreChangelogEntries]);

  useEffect(() => {
    if (profile?.role === 'member') setLocation('/app');
  }, [profile?.role, setLocation]);

  const hasCycleSections = Boolean(pendingCycle || activeCycle);

  const computeStats = (entries: ChangelogEntry[]) => ({
    create: entries.filter((e) => getDisplayAction(e) === 'create').length,
    update: entries.filter((e) => getDisplayAction(e) === 'update').length,
    delete: entries.filter((e) => getDisplayAction(e) === 'delete').length,
  });

  if (profile?.role === 'member') return null;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader icon={ScrollText} title="Changelog" description={pendingCycle
        ? 'Track settlement changes in the pending cycle alongside new active cycle activity.'
        : activeCycle
          ? 'Track create, update, and delete activity for the current active cycle.'
          : 'No active cycle is available yet.'}>
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
      </PageHeader>

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
                type="button"
                aria-pressed={isActive}
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
                type="button"
                aria-pressed={isActive}
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
              entries={displayedActiveEntries}
              cycleStat={computeStats(displayedActiveEntries)}
              loading={changelogLoading}
            />
          )}

          {pendingCycle && (
            <ChangelogSection
              title="Pending Cycle"
              description="Settlement and correction activity for the cycle awaiting finalization."
              entries={displayedPendingEntries}
              cycleStat={computeStats(displayedPendingEntries)}
              loading={changelogLoading}
            />
          )}

          {hasMoreChangelogEntries && (
            <div className="flex justify-center pt-2">
              <Button
                id="changelog-load-more"
                type="button"
                variant="outline"
                onClick={() => void loadMoreChangelogEntries(cycleIds, entityFilter, actionFilter, search)}
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
