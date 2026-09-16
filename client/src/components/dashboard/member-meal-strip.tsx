/**
 * member-meal-strip.tsx
 * A compact 7-day visual meal history strip for the Member Dashboard.
 * Shows each day's meal count as an animated chip with subtle visual cues.
 */
import { useMemo } from 'react';
import { format, subDays, isSameDay, isToday } from 'date-fns';
import type { MealLog } from '@/lib/meal-context';
import { cn } from '@/lib/utils';
import { Utensils } from 'lucide-react';

interface MemberMealStripProps {
  memberId: string;
  mealLogs: MealLog[];
}

export function MemberMealStrip({ memberId, mealLogs }: MemberMealStripProps) {
  const today = new Date();

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i); // oldest to newest
      const dateStr = format(date, 'yyyy-MM-dd');
      const log = mealLogs.find(
        (l) => l.memberId === memberId && l.date === dateStr
      );
      return {
        date,
        dateStr,
        label: format(date, 'EEE'), // Mon, Tue, etc.
        dayNum: format(date, 'd'),
        count: log?.count ?? 0,
        isToday: isToday(date),
      };
    });
  }, [memberId, mealLogs, today]);

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        7-Day Meal Activity
      </p>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const fillPct = day.count > 0 ? (day.count / maxCount) : 0;
          const hasFood = day.count > 0;

          return (
            <div
              key={day.dateStr}
              className={cn(
                'group flex flex-col items-center gap-0.5 rounded-xl p-1.5 transition-all duration-200',
                day.isToday
                  ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                  : 'hover:bg-muted/60'
              )}
            >
              {/* Day label */}
              <span
                className={cn(
                  'text-[9px] font-semibold uppercase tracking-wide',
                  day.isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                )}
              >
                {day.label}
              </span>

              {/* Visual bar + count */}
              <div className="relative flex h-10 w-full items-end justify-center rounded-lg bg-muted/40 overflow-hidden">
                {hasFood && (
                  <div
                    className={cn(
                      'absolute bottom-0 left-0 right-0 rounded-lg transition-all duration-500',
                      day.isToday
                        ? 'bg-gradient-to-t from-emerald-500 to-emerald-400'
                        : 'bg-gradient-to-t from-emerald-600/70 to-emerald-400/50'
                    )}
                    style={{ height: `${Math.max(25, fillPct * 100)}%` }}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 text-[10px] font-bold leading-none pb-0.5',
                    hasFood
                      ? 'text-white drop-shadow-sm'
                      : 'text-muted-foreground/50'
                  )}
                >
                  {day.count > 0 ? day.count : '–'}
                </span>
              </div>

              {/* Date number */}
              <span
                className={cn(
                  'text-[9px] tabular-nums',
                  day.isToday
                    ? 'font-bold text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/70'
                )}
              >
                {day.dayNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Utensils className="h-2.5 w-2.5 text-emerald-500" />
          Last 7 days
        </span>
        <span className="font-semibold text-foreground">
          {days.reduce((s, d) => s + d.count, 0)} meals total
        </span>
      </div>
    </div>
  );
}
