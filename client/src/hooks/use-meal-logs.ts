import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '@/lib/supabase';
import { enqueue } from '@/lib/offline-queue';
import type { MealLog } from '@/lib/meal-types';

type Options = {
  userId: string | null; messId: string | null;
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>;
  setPendingSyncIds: Dispatch<SetStateAction<Set<string>>>;
  getCycleId: (cycleId?: string) => string | null;
  broadcast: () => void;
};

export function useMealLogs(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const saveMealLogs = useCallback(async (entries: Array<{ memberId: string; count: number }>, date: string, cycleId?: string) => {
    const { userId, messId, setMealLogs, setPendingSyncIds, getCycleId, broadcast } = latest.current;
    if (!userId || !messId || !entries.length) return;
    const targetCycleId = getCycleId(cycleId);
    if (!targetCycleId) return;

    if (!navigator.onLine) {
      const operationId = `offline-${uuidv4()}`;
      setMealLogs((previous) => {
        let next = [...previous];
        for (const entry of entries) {
          const count = Number.isNaN(entry.count) ? 0 : entry.count;
          const index = next.findIndex((log) => log.memberId === entry.memberId && log.date === date && log.cycleId === targetCycleId);
          if (index >= 0) next = count === 0 ? next.filter((_, itemIndex) => itemIndex !== index) : next.map((log, itemIndex) => itemIndex === index ? { ...log, count } : log);
          else if (count > 0) next.push({ id: `offline-meal-${uuidv4()}`, cycleId: targetCycleId, memberId: entry.memberId, date, count });
        }
        return next;
      });
      setPendingSyncIds((previous) => new Set(previous).add(operationId));
      await enqueue({ id: operationId, type: 'ADD_MEAL_LOG', payload: { entries, dateStr: date, cycleId: targetCycleId, userId, messId }, createdAt: Date.now() });
      return;
    }

    const memberIds = Array.from(new Set(entries.map((entry) => entry.memberId)));
    const { data: existing, error: readError } = await supabase.from('meal_logs').select('member_id, count').eq('cycle_id', targetCycleId).eq('date', date).in('member_id', memberIds);
    if (readError) throw new Error('Unable to compare existing meal logs. Please try again.');
    const previous = new Map((existing ?? []).map((log) => [log.member_id, Number(log.count)]));
    const changedEntries = entries.filter((entry) => {
      const prevCount = previous.get(entry.memberId) ?? 0;
      const nextCount = Number.isNaN(entry.count) ? 0 : entry.count;
      return prevCount !== nextCount;
    });
    if (!changedEntries.length) return;
    const rows = changedEntries.map((entry) => ({ member_id: entry.memberId, cycle_id: targetCycleId, date, count: Number.isNaN(entry.count) ? 0 : entry.count, user_id: userId, mess_id: messId }));
    const { data, error } = await supabase.from('meal_logs').upsert(rows, { onConflict: 'member_id,date,cycle_id' }).select();
    if (error) throw new Error('Unable to save meal log. Please try again.');
    setMealLogs((previousLogs) => [
      ...previousLogs.filter((log) => !rows.some((row) => log.memberId === row.member_id && log.date === row.date && log.cycleId === row.cycle_id)),
      ...(data ?? []).map((log) => ({ id: log.id, cycleId: log.cycle_id, memberId: log.member_id, date: log.date, count: Number(log.count) })),
    ]);
    broadcast();
  }, []);

  const logMeal = useCallback((memberId: string, count: number, date: string, cycleId?: string) => saveMealLogs([{ memberId, count }], date, cycleId), [saveMealLogs]);
  return { saveMealLogs, logMeal };
}
