import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '@/lib/supabase';
import { dequeueAll, enqueue } from '@/lib/offline-queue';
import { isTransientRequestError, withRequestTimeout } from '@/lib/request-retry';
import type { MealLog, MealLogVersion } from '@/lib/meal-types';

type Options = {
  userId: string | null; messId: string | null;
  mealLogs: MealLog[];
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>;
  setPendingSyncIds: Dispatch<SetStateAction<Set<string>>>;
  getCycleId: (cycleId?: string) => string | null;
  broadcast: () => void;
};

export function useMealLogs(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const saveMealLogs = useCallback(async (
    entries: Array<{ memberId: string; count: number }>,
    date: string,
    cycleId?: string,
    replayExpected?: MealLogVersion[],
  ) => {
    const { userId, messId, mealLogs, setMealLogs, setPendingSyncIds, getCycleId, broadcast } = latest.current;
    if (!userId || !messId || !entries.length) return;
    const targetCycleId = getCycleId(cycleId);
    if (!targetCycleId) return;

    const expected = replayExpected ?? entries.map((entry) => {
      const existing = mealLogs.find((log) => log.memberId === entry.memberId && log.date === date && log.cycleId === targetCycleId);
      return { memberId: entry.memberId, count: existing?.count ?? 0, updatedAt: existing?.updatedAt, exists: Boolean(existing) };
    });
    const queueMealChanges = async () => {
      const queued = (await dequeueAll({ userId, messId })).find((operation) =>
        operation.type === 'ADD_MEAL_LOG'
        && operation.status !== 'failed'
        && operation.status !== 'conflict'
        && operation.payload.cycleId === targetCycleId
        && operation.payload.dateStr === date,
      );
      const queuedEntries = (queued?.payload.entries ?? []) as Array<{ memberId: string; count: number }>;
      const queuedExpected = (queued?.payload.expected ?? []) as MealLogVersion[];
      const entryByMember = new Map(queuedEntries.map((entry) => [entry.memberId, entry]));
      const expectedByMember = new Map(queuedExpected.map((entry) => [entry.memberId, entry]));
      for (const entry of entries) entryByMember.set(entry.memberId, entry);
      for (const baseline of expected) {
        if (!expectedByMember.has(baseline.memberId)) expectedByMember.set(baseline.memberId, baseline);
      }
      const operationId = queued?.id ?? `offline-${uuidv4()}`;
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
      await enqueue({
        ...(queued ?? { id: operationId, type: 'ADD_MEAL_LOG' as const, createdAt: Date.now() }),
        attempts: 0,
        retryCount: 0,
        nextAttemptAt: undefined,
        status: 'pending',
        lastError: undefined,
        payload: {
          entries: Array.from(entryByMember.values()),
          expected: Array.from(expectedByMember.values()),
          dateStr: date,
          cycleId: targetCycleId,
          userId,
          messId,
        },
      });
    };
    if (!navigator.onLine) {
      await queueMealChanges();
      return;
    }

    const memberIds = Array.from(new Set(entries.map((entry) => entry.memberId)));
    let existing;
    try {
      const result = await withRequestTimeout((signal) => supabase.from('meal_logs')
        .select('id, member_id, count, updated_at')
        .eq('cycle_id', targetCycleId).eq('date', date).in('member_id', memberIds)
        .abortSignal(signal));
      if (result.error) {
        if (isTransientRequestError(result.error)) {
          await queueMealChanges();
          return;
        }
        throw new Error('Unable to compare existing meal logs. Please try again.');
      }
      existing = result.data ?? [];
    } catch (error) {
      if (!isTransientRequestError(error)) throw error;
      await queueMealChanges();
      return;
    }

    const existingByMember = new Map(existing.map((log) => [log.member_id, log]));
    const expectedByMember = new Map(expected.map((entry) => [entry.memberId, entry]));
    const changedEntries = entries.filter((entry) => {
      const current = existingByMember.get(entry.memberId);
      const nextCount = Number.isNaN(entry.count) ? 0 : entry.count;
      if (current && Number(current.count) === nextCount) return false;
      const baseline = expectedByMember.get(entry.memberId);
      if (!baseline) return true;
      const matchesBaseline = baseline.exists
        ? Boolean(current)
          && Number(current?.count) === baseline.count
          && (!baseline.updatedAt || current?.updated_at === baseline.updatedAt)
        : !current;
      if (!matchesBaseline) {
        const conflict = new Error('This meal log changed on another device. Reload it before saving again.') as Error & { code?: string };
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      return true;
    });
    if (!changedEntries.length) {
      setMealLogs((previousLogs) => [
        ...previousLogs.filter((log) => !(log.cycleId === targetCycleId && log.date === date && memberIds.includes(log.memberId))),
        ...existing.map((log) => ({ id: log.id, cycleId: targetCycleId, memberId: log.member_id, date, count: Number(log.count), updatedAt: log.updated_at })),
      ]);
      return;
    }

    try {
      const expectedForRpc = changedEntries.map((entry) => {
        const baseline = expectedByMember.get(entry.memberId);
        const current = existingByMember.get(entry.memberId);
        return {
          memberId: entry.memberId,
          exists: baseline?.exists ?? Boolean(current),
          count: baseline?.count ?? Number(current?.count ?? 0),
          updatedAt: baseline?.updatedAt ?? current?.updated_at ?? null,
        };
      });
      const { data, error } = await withRequestTimeout((signal) => supabase.rpc('save_meal_logs', {
        cycle_id_input: targetCycleId,
        date_input: date,
        entries_input: changedEntries.map((entry) => ({
          memberId: entry.memberId,
          count: Number.isNaN(entry.count) ? 0 : entry.count,
        })),
        expected_input: expectedForRpc,
      }).abortSignal(signal));
      if (error) throw error;
      const savedRows = (data ?? []) as Array<{
        id: string;
        cycle_id: string;
        member_id: string;
        date: string;
        count: number;
        updated_at: string;
      }>;
      setMealLogs((previousLogs) => [
        ...previousLogs.filter((log) => !changedEntries.some((entry) => log.memberId === entry.memberId && log.date === date && log.cycleId === targetCycleId)),
        ...savedRows.map((log) => ({ id: log.id, cycleId: log.cycle_id, memberId: log.member_id, date: log.date, count: Number(log.count), updatedAt: log.updated_at })),
      ]);
    } catch (error) {
      if (!isTransientRequestError(error)) {
        const value = error as { code?: string; status?: number; message?: string };
        if (value.code === '23505' || value.code === 'PGRST116' || value.message?.startsWith('MEAL_LOG_CONFLICT:')) {
          const conflict = new Error('This meal log changed on another device. Reload it before saving again.') as Error & { code?: string };
          conflict.code = 'OFFLINE_CONFLICT';
          throw conflict;
        }
        throw new Error(value.message || 'Unable to save meal log. Please try again.', { cause: error });
      }
      await queueMealChanges();
      return;
    }
    broadcast();
  }, []);

  const logMeal = useCallback((memberId: string, count: number, date: string, cycleId?: string) => saveMealLogs([{ memberId, count }], date, cycleId), [saveMealLogs]);
  return { saveMealLogs, logMeal };
}
