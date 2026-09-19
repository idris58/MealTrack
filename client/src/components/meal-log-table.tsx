import type { ReactNode } from 'react';
import { format, isSameDay } from 'date-fns';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export type MealLogTableMember = { id: string; name: string; avatar?: string | null };
export type MealLogTableEntry = { id?: string; memberId: string; date: string; count: number };

type MealLogTableProps = {
  members: MealLogTableMember[];
  mealLogs: MealLogTableEntry[];
  days: Date[];
  maxHeight?: string;
  onDayClick?: (day: Date) => void;
  renderLog?: (log: MealLogTableEntry) => ReactNode;
  tintedRows?: boolean;
  totalMeals?: number;
};

export function MealLogTable({ members, mealLogs, days, maxHeight = 'h-[calc(100vh-240px)]', onDayClick, renderLog, tintedRows = false, totalMeals }: MealLogTableProps) {
  const totals = new Map(members.map((member) => [member.id, 0]));
  mealLogs.forEach((log) => totals.set(log.memberId, (totals.get(log.memberId) ?? 0) + log.count));
  const formatCount = (value: number) => `${Math.round(value * 1000) / 1000}`;
  const overallTotal = totalMeals ?? mealLogs.reduce((sum, log) => sum + log.count, 0);

  return (
    <div className="flex-1 min-h-0 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className={cn(maxHeight, 'overflow-auto overscroll-x-contain [scrollbar-gutter:stable_both-edges]')}>
        <table className="min-w-max w-full border-collapse text-sm">
          <thead className="sticky top-0 z-30 bg-card">
            <tr className="border-b shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <th className="sticky left-0 top-0 z-40 min-w-[84px] whitespace-nowrap border-r bg-card p-3 text-left text-xs font-bold sm:min-w-[96px] md:min-w-[112px] md:p-4 md:text-sm">Date</th>
              {members.map((member) => (
                <th key={member.id} className="min-w-[72px] border-r bg-card p-1.5 text-center sm:min-w-[84px] md:min-w-[100px] md:p-2">
                  <div className="flex flex-col items-center gap-1 py-0.5 md:py-1">
                    <Avatar className="h-5 w-5 text-[9px] md:h-6 md:w-6 md:text-[10px]"><AvatarFallback>{member.avatar || member.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                    <span className="w-14 truncate text-[9px] font-bold uppercase sm:w-16 md:w-20 md:text-[10px]">{member.name.split(' ')[0]}</span>
                  </div>
                </th>
              ))}
              <th className="min-w-[64px] bg-card p-3 text-right text-xs font-bold sm:min-w-[72px] md:min-w-[80px] md:p-4 md:text-sm">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {days.map((day, index) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayLogs = mealLogs.filter((log) => log.date === dateStr);
              const dayTotal = dayLogs.reduce((sum, log) => sum + log.count, 0);
              const rowTint = tintedRows && index % 2 === 1;
              return (
                <tr key={dateStr} className={cn('transition-colors hover:bg-muted/50', rowTint && 'bg-slate-50/70 md:bg-transparent', onDayClick && 'cursor-pointer')} onClick={() => onDayClick?.(day)}>
                  <td className={cn('sticky left-0 z-10 whitespace-nowrap border-r p-3 font-medium md:p-4', rowTint ? 'bg-slate-50 md:bg-card' : 'bg-card')}>
                    <div className="flex flex-col"><span className={cn(isSameDay(day, new Date()) && 'font-bold text-primary')}>{format(day, 'dd MMM')}</span><span className="text-[9px] text-muted-foreground md:text-[10px]">{format(day, 'EEEE')}</span></div>
                  </td>
                  {members.map((member) => {
                    const log = dayLogs.find((entry) => entry.memberId === member.id);
                    return <td key={member.id} className="border-r p-2.5 text-center font-mono text-xs sm:p-3 sm:text-sm md:p-4">{log ? (renderLog ? renderLog(log) : formatCount(log.count)) : '-'}</td>;
                  })}
                  <td className="bg-card p-3 text-right font-bold text-emerald-600 md:p-4">{dayTotal > 0 ? formatCount(dayTotal) : '-'}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 bg-secondary/20">
              <td className="sticky left-0 z-20 min-w-[84px] whitespace-nowrap border-r bg-card p-3 font-bold sm:min-w-[96px] md:min-w-[112px] md:p-4">Total</td>
              {members.map((member) => <td key={member.id} className="border-r p-2.5 text-center font-bold text-emerald-700 sm:p-3 sm:text-sm md:p-4">{formatCount(totals.get(member.id) ?? 0)}</td>)}
              <td className="bg-secondary/20 p-3 text-right font-bold text-emerald-700 md:p-4">{formatCount(overallTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
