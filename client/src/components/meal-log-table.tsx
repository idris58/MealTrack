import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format, isToday } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Loader2, Rows3, Utensils } from 'lucide-react';

import { useIsMobile } from '@/hooks/use-mobile';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Shared meal log view used by the meals, history, and shared pages.
 *
 *  • Month switcher is primary: you see one month at a time (‹ March 2026 ›).
 *  • "All" pill: shows every day across all months in one list, lazy-loaded
 *    30 days at a time (auto on scroll + a "Load 30 more days" button).
 *  • Days view (default on phones) / Grid heatmap (default on desktop).
 *  • Member chips: focus on one person.
 *  Totals always cover the whole scope (the month, or everything in All mode),
 *  never just the rows that happen to be loaded.
 */

export type MealLogTableMember = { id: string; name: string; avatar?: string | null };
export type MealLogTableEntry = { id?: string; memberId: string; date: string; count: number };

type Props = {
  members: MealLogTableMember[];
  mealLogs: MealLogTableEntry[];
  /** Newest first, same as the existing pages already pass. */
  days: Date[];
  onDayClick?: (day: Date) => void;
  renderLog?: (log: MealLogTableEntry) => ReactNode;
  totalMeals?: number;
  maxHeight?: string;
  tintedRows?: boolean;
};

const PAGE_SIZE = 30;
const fmt = (n: number) => `${Math.round(n * 1000) / 1000}`;
const cellKey = (date: string, memberId: string) => `${date}|${memberId}`;
const initials = (m: MealLogTableMember) => m.avatar || m.name.slice(0, 1).toUpperCase();
const currentYear = new Date().getFullYear();
const dayLabel = (d: Date) => format(d, d.getFullYear() === currentYear ? 'dd MMM' : 'dd MMM yyyy');

function heat(count: number) {
  if (count <= 0) return 'text-muted-foreground/35';
  if (count < 1) return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (count < 2) return 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-100';
  if (count < 3) return 'bg-emerald-500/35 text-emerald-950 dark:text-emerald-50';
  return 'bg-emerald-500/60 text-emerald-950 dark:text-white';
}

export function MealLogTable({ members, mealLogs, days, onDayClick, renderLog, totalMeals, maxHeight = 'max-h-[70vh]', tintedRows = false }: Props) {
  const isMobile = useIsMobile();
  const [manualView, setManualView] = useState<'days' | 'grid' | null>(null);
  const view = manualView ?? (isMobile ? 'days' : 'grid');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);

  // Scope: one month (default) or everything.
  const [showAll, setShowAll] = useState(false);
  const [monthIndex, setMonthIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const monthOptions = useMemo(() => Array.from(new Set(days.map((d) => format(d, 'yyyy-MM')))), [days]);
  const selectedMonth = monthOptions[monthIndex] ?? monthOptions[0];

  useEffect(() => {
    setMonthIndex(0);
    setVisibleCount(PAGE_SIZE);
  }, [days]);

  // Restart from the newest 30 days whenever All mode is toggled.
  useEffect(() => setVisibleCount(PAGE_SIZE), [showAll]);

  // Every day in the current scope (used for totals).
  const scopeDays = useMemo(
    () => (showAll || !selectedMonth ? days : days.filter((d) => format(d, 'yyyy-MM') === selectedMonth)),
    [days, showAll, selectedMonth],
  );
  // Only lazy-load in All mode; a single month is at most 31 rows.
  const visibleDays = showAll ? scopeDays.slice(0, visibleCount) : scopeDays;
  const hasMore = showAll && visibleCount < scopeDays.length;
  const remaining = scopeDays.length - visibleCount;

  const lookup = useMemo(() => {
    const map = new Map<string, MealLogTableEntry>();
    mealLogs.forEach((log) => map.set(cellKey(log.date, log.memberId), log));
    return map;
  }, [mealLogs]);

  const shownMembers = focusId ? members.filter((m) => m.id === focusId) : members;
  const countFor = (day: Date, memberId: string) => lookup.get(cellKey(format(day, 'yyyy-MM-dd'), memberId))?.count ?? 0;
  const dayTotal = (day: Date) => shownMembers.reduce((sum, m) => sum + countFor(day, m.id), 0);
  const memberTotal = (id: string) => scopeDays.reduce((s, d) => s + countFor(d, id), 0);
  const grandTotal =
    showAll && !focusId && totalMeals !== undefined ? totalMeals : scopeDays.reduce((s, d) => s + dayTotal(d), 0);

  // Infinite scroll for All mode.
  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, scopeDays.length));
        }
      },
      { root, rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, view, visibleCount, scopeDays.length]);

  const monthLabel = selectedMonth ? format(new Date(`${selectedMonth}-01T00:00:00`), 'MMMM yyyy') : 'Meal logs';

  const loadMore = showAll ? (
    <div ref={sentinelRef} className="flex justify-center px-4 py-4">
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, scopeDays.length))}
          className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Load {Math.min(PAGE_SIZE, remaining)} more days
        </button>
      )}
    </div>
  ) : null;

  const chevron =
    'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="space-y-3 border-b bg-muted/20 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          {/* Month switcher (primary) + All */}
          <div className="flex min-w-0 items-center gap-1.5">
            <div className={cn('flex items-center', showAll && 'opacity-40')}>
              <button
                type="button"
                aria-label="Older month"
                disabled={showAll || monthIndex >= monthOptions.length - 1}
                onClick={() => setMonthIndex((i) => Math.min(i + 1, monthOptions.length - 1))}
                className={chevron}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 className="min-w-[7.5rem] truncate text-center font-heading text-base font-bold sm:min-w-[9rem] sm:text-lg">
                {showAll ? 'All months' : monthLabel}
              </h3>
              <button
                type="button"
                aria-label="Newer month"
                disabled={showAll || monthIndex <= 0}
                onClick={() => setMonthIndex((i) => Math.max(i - 1, 0))}
                className={chevron}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {monthOptions.length > 1 && (
              <button
                type="button"
                aria-pressed={showAll}
                onClick={() => setShowAll((v) => !v)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  showAll ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                View all
              </button>
            )}
          </div>

          <div role="tablist" aria-label="Meal log layout" className="flex shrink-0 rounded-lg border bg-background p-0.5">
            {([
              ['days', Rows3, 'Days'],
              ['grid', LayoutGrid, 'Grid'],
            ] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={view === value}
                aria-label={label}
                type="button"
                onClick={() => setManualView(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                  view === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Member focus chips */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setFocusId(null)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              !focusId ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            Everyone
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setFocusId(focusId === m.id ? null : m.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-3 text-xs font-semibold transition-colors',
                focusId === m.id ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <Avatar className="h-5 w-5 text-[9px]">
                <AvatarFallback>{initials(m)}</AvatarFallback>
              </Avatar>
              {m.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Days view ──────────────────────────────────────────── */}
      {view === 'days' && (
        <div ref={scrollRef} className={cn(maxHeight, 'overflow-y-auto overscroll-contain')}>
          <ul className="divide-y">
            {visibleDays.map((day) => {
              const total = dayTotal(day);
              const eating = shownMembers.filter((m) => countFor(day, m.id) > 0);
              const absent = shownMembers.length - eating.length;
              const today = isToday(day);
              const Wrapper = onDayClick ? 'button' : 'div';
              return (
                <li key={day.toISOString()}>
                  <Wrapper
                    {...(onDayClick ? { type: 'button' as const, onClick: () => onDayClick(day) } : {})}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      onDayClick && 'hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none',
                      today && 'bg-primary/[0.04]',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-xl border',
                        today ? 'border-primary bg-primary text-primary-foreground' : 'bg-background',
                      )}
                    >
                      <span className="text-[10px] font-medium leading-none opacity-80">{format(day, 'EEE')}</span>
                      <span className="mt-0.5 font-heading text-lg font-bold leading-none">{format(day, 'd')}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      {showAll && <p className="mb-1 text-[11px] text-muted-foreground">{dayLabel(day)}</p>}
                      {total === 0 ? (
                        <p className="pt-2.5 text-sm text-muted-foreground">
                          {onDayClick ? 'Nothing logged. Tap to add meals.' : 'Nothing logged'}
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {eating.map((m) => {
                              const log = lookup.get(cellKey(format(day, 'yyyy-MM-dd'), m.id));
                              const count = log?.count ?? 0;
                              return (
                                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 pr-2.5 text-xs">
                                  <Avatar className="h-5 w-5 text-[9px]">
                                    <AvatarFallback>{initials(m)}</AvatarFallback>
                                  </Avatar>
                                  <span className="max-w-[5.5rem] truncate font-medium">{m.name.split(' ')[0]}</span>
                                  <span className={cn('rounded-full px-1.5 font-bold tabular-nums', heat(count))}>
                                    {log && renderLog ? renderLog(log) : fmt(count)}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                          {absent > 0 && !focusId && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">{absent} not eating</p>
                          )}
                        </>
                      )}
                    </div>

                    <div className="shrink-0 pt-1 text-right">
                      <p className={cn('flex items-center justify-end gap-1 font-heading text-lg font-bold tabular-nums', total === 0 && 'text-muted-foreground/40')}>
                        {total > 0 && <Utensils className="h-3.5 w-3.5 text-emerald-600" />}
                        {total > 0 ? fmt(total) : '–'}
                      </p>
                    </div>
                  </Wrapper>
                </li>
              );
            })}
          </ul>
          {loadMore}
          <div className="sticky bottom-0 flex items-center justify-between border-t bg-card/95 px-4 py-2.5 text-sm backdrop-blur">
            <span className="font-semibold">{showAll ? 'Total (all months)' : `Total (${monthLabel})`}</span>
            <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(grandTotal)}</span>
          </div>
        </div>
      )}

      {/* ── Grid (heatmap) view ────────────────────────────────── */}
      {view === 'grid' && (
        <div ref={scrollRef} className={cn(maxHeight, 'overflow-auto overscroll-contain [scrollbar-gutter:stable]')}>
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm" onMouseLeave={() => setHoverCol(null)}>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-r bg-card px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                {shownMembers.map((m) => (
                  <th
                    key={m.id}
                    className={cn(
                      'sticky top-0 z-20 min-w-[76px] border-b bg-card px-2 py-2 text-center transition-colors',
                      hoverCol === m.id && 'bg-muted',
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Avatar className="h-6 w-6 text-[10px]">
                        <AvatarFallback>{initials(m)}</AvatarFallback>
                      </Avatar>
                      <span className="w-16 truncate text-[11px] font-semibold">{m.name.split(' ')[0]}</span>
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 top-0 z-30 min-w-[64px] border-b border-l bg-card px-3 py-3 text-right text-xs font-semibold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day, index) => {
                const dk = format(day, 'yyyy-MM-dd');
                const total = dayTotal(day);
                return (
                  <tr key={dk} onClick={() => onDayClick?.(day)} className={cn('group', onDayClick && 'cursor-pointer', tintedRows && index % 2 === 1 && 'bg-muted/20')}>
                    <td className={cn('sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-4 py-2.5 group-hover:bg-muted', isToday(day) && 'border-l-2 border-l-primary')}>
                      <span className={cn('block font-medium leading-tight', isToday(day) && 'text-primary')}>{dayLabel(day)}</span>
                      <span className="block text-[10px] text-muted-foreground">{format(day, 'EEEE')}</span>
                    </td>
                    {shownMembers.map((m) => {
                      const log = lookup.get(cellKey(dk, m.id));
                      const count = log?.count ?? 0;
                      return (
                        <td
                          key={m.id}
                          onMouseEnter={() => setHoverCol(m.id)}
                          className={cn('border-b p-1 text-center transition-colors group-hover:bg-muted/50', hoverCol === m.id && 'bg-muted/40')}
                        >
                          <span className={cn('mx-auto flex h-9 min-w-[3rem] items-center justify-center rounded-lg font-mono text-sm font-semibold tabular-nums', heat(count))}>
                            {count > 0 ? (log && renderLog ? renderLog(log) : fmt(count)) : '·'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-b border-l bg-card px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700 group-hover:bg-muted dark:text-emerald-400">
                      {total > 0 ? fmt(total) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-30 border-r border-t-2 bg-card px-4 py-3 font-bold">Total</td>
                {shownMembers.map((m) => (
                  <td key={m.id} className="sticky bottom-0 z-20 border-t-2 bg-card px-2 py-3 text-center font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fmt(memberTotal(m.id))}
                  </td>
                ))}
                <td className="sticky bottom-0 right-0 z-30 border-l border-t-2 bg-card px-3 py-3 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
          {loadMore}
        </div>
      )}

      {days.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No days to show yet.</p>
        </div>
      )}
    </div>
  );
}
