import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '@/lib/supabase';
import { dequeueAll, enqueue, removeFromQueue } from '@/lib/offline-queue';
import { isTransientRequestError, withRequestTimeout } from '@/lib/request-retry';
import type { Expense } from '@/lib/meal-types';

const SOFT_DELETE_GRACE_MS = 10_000;
type ExpenseUpdate = { amount: number; description: string; type: 'meal' | 'utility'; paidBy: string; date?: string };
type Options = {
  userId: string | null; messId: string | null; expenses: Expense[];
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setPendingSyncIds: Dispatch<SetStateAction<Set<string>>>;
  getCycleId: (cycleId?: string) => string | null;
  allowsNegativeAmount: (cycleId: string) => boolean;
  broadcast: () => void;
};
const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
const requestError = (message: string) => new Error(message) as Error & { code?: string };

export function useExpenses(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const addExpense = useCallback(async (amount: number, description: string, type: 'meal' | 'utility', paidBy: string, cycleId?: string, expenseDate?: string) => {
    const { userId, messId, setExpenses, setPendingSyncIds, getCycleId, allowsNegativeAmount, broadcast } = latest.current;
    if (!userId || !messId) return;
    const targetCycleId = getCycleId(cycleId);
    if (!targetCycleId || (amount < 0 && !allowsNegativeAmount(targetCycleId))) return;
    const date = expenseDate ?? format(new Date(), 'yyyy-MM-dd');
    const recordId = uuidv4();
    const queueExpense = async () => {
      const id = `offline-${uuidv4()}`;
      setExpenses((previous) => [{ id, cycleId: targetCycleId, amount, description, type, date, paidBy }, ...previous]);
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({ id, type: 'ADD_EXPENSE', payload: { recordId, amount, description, type, paidBy, date, userId, messId, cycleId: targetCycleId }, createdAt: Date.now() });
    };
    if (!navigator.onLine) {
      await queueExpense();
      return;
    }
    let data;
    try {
      const result = await withRequestTimeout((signal) => supabase.from('expenses').upsert([{
        id: recordId, amount, description, type, paid_by: paidBy, user_id: userId, mess_id: messId, cycle_id: targetCycleId, ...(expenseDate ? { date } : {}),
      }], { onConflict: 'id' }).abortSignal(signal).select().single());
      if (result.error) {
        if (isTransientRequestError(result.error)) {
          await queueExpense();
          return;
        }
        throw new Error('Unable to add expense. Please try again.');
      }
      data = result.data;
    } catch (error) {
      if (!isTransientRequestError(error)) throw error;
      await queueExpense();
      return;
    }
    const next = { id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by, updatedAt: data.updated_at } as Expense;
    setExpenses((previous) => [next, ...previous]);
    broadcast();
  }, []);

  const updateExpense = useCallback(async (id: string, updates: ExpenseUpdate) => {
    const { userId, messId, expenses, setExpenses, setPendingSyncIds, broadcast } = latest.current;
    if (!userId || !messId) return;
    const existing = expenses.find((expense) => expense.id === id);
    if (!existing) return;
    const hasChange =
      existing.description !== updates.description ||
      existing.amount !== updates.amount ||
      existing.type !== updates.type ||
      existing.paidBy !== updates.paidBy ||
      (updates.date !== undefined && dateOnly(existing.date) !== dateOnly(updates.date));
    if (!hasChange) return;
    if (id.startsWith('offline-')) {
      const queued = (await dequeueAll({ userId, messId })).find((operation) => operation.type === 'ADD_EXPENSE' && operation.id === id);
      if (queued) {
        await enqueue({ ...queued, payload: { ...queued.payload, ...updates, date: updates.date ?? existing.date } });
        setExpenses((previous) => previous.map((expense) => expense.id === id ? { ...expense, ...updates, date: updates.date ?? expense.date } : expense));
        return;
      }
    }
    const expected = {
      amount: existing.amount,
      description: existing.description,
      type: existing.type,
      paidBy: existing.paidBy,
      date: existing.date,
      updatedAt: existing.updatedAt,
    };
    const queueUpdate = async () => {
      const queued = (await dequeueAll({ userId, messId })).find((operation) =>
        operation.type === 'UPDATE_EXPENSE'
        && operation.status !== 'failed'
        && operation.status !== 'conflict'
        && operation.payload.id === id,
      );
      const operationId = queued?.id ?? `offline-${uuidv4()}`;
      const baseline = queued?.payload.expected ?? expected;
      setExpenses((previous) => previous.map((expense) => expense.id === id ? { ...expense, ...updates, date: updates.date ?? expense.date } : expense));
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({
        ...(queued ?? { id: operationId, type: 'UPDATE_EXPENSE' as const, createdAt: Date.now() }),
        attempts: 0,
        retryCount: 0,
        nextAttemptAt: undefined,
        status: 'pending',
        lastError: undefined,
        payload: { id, ...updates, date: updates.date ?? existing.date, cycleId: existing.cycleId, userId, messId, expected: baseline },
      });
    };
    if (!navigator.onLine) {
      await queueUpdate();
      return;
    }
    let expectedUpdatedAt = existing.updatedAt;
    try {
      if (!expectedUpdatedAt) {
        const versionResult = await withRequestTimeout((signal) => supabase.from('expenses')
          .select('updated_at, amount, description, type, paid_by, date')
          .eq('id', id).eq('mess_id', messId).abortSignal(signal).maybeSingle());
        if (versionResult.error) {
          if (isTransientRequestError(versionResult.error)) {
            await queueUpdate();
            return;
          }
          throw new Error('Unable to verify the expense version. Please try again.');
        }
        if (!versionResult.data) throw requestError('This expense no longer exists.');
        const current = versionResult.data;
        if (Number(current.amount) !== existing.amount || current.description !== existing.description || current.type !== existing.type || current.paid_by !== existing.paidBy || dateOnly(current.date) !== dateOnly(existing.date)) {
          const conflict = requestError('This expense changed on another device. Reload it before editing again.');
          conflict.code = 'OFFLINE_CONFLICT';
          throw conflict;
        }
        expectedUpdatedAt = current.updated_at;
        expected.updatedAt = expectedUpdatedAt;
      }
      const result = await withRequestTimeout((signal) => supabase.from('expenses')
        .update({ amount: updates.amount, description: updates.description, type: updates.type, paid_by: updates.paidBy, ...(updates.date ? { date: updates.date } : {}) })
        .eq('id', id).eq('mess_id', messId).eq('updated_at', expectedUpdatedAt)
        .abortSignal(signal).select('id, updated_at').maybeSingle());
      if (result.error) {
        if (isTransientRequestError(result.error)) {
          await queueUpdate();
          return;
        }
        throw new Error('Unable to update expense. Please try again.');
      }
      if (!result.data) {
        const conflict = requestError('This expense changed on another device. Reload it before editing again.');
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      const updatedAt = result.data.updated_at;
      setExpenses((previous) => previous.map((expense) => expense.id === id ? { ...expense, ...updates, updatedAt, date: updates.date ?? expense.date } : expense));
      broadcast();
    } catch (error) {
      if (!isTransientRequestError(error)) throw error;
      await queueUpdate();
    }
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    const { userId, messId, expenses, setExpenses, setPendingSyncIds, broadcast } = latest.current;
    if (!userId || !messId) return;
    const existing = expenses.find((expense) => expense.id === id);
    if (!existing) return;
    if (id.startsWith('offline-')) {
      const related = (await dequeueAll({ userId, messId })).filter((operation) => (operation.type === 'ADD_EXPENSE' && operation.id === id) || ((operation.type === 'UPDATE_EXPENSE' || operation.type === 'DELETE_EXPENSE') && operation.payload.id === id));
      if (related.some((operation) => operation.type === 'ADD_EXPENSE')) {
        await Promise.all(related.map((operation) => removeFromQueue(operation.id)));
        setPendingSyncIds((previous) => { const next = new Set(previous); related.forEach((operation) => next.delete(operation.id)); next.delete(id); return next; });
        setExpenses((previous) => previous.filter((expense) => expense.id !== id));
        return;
      }
    }
    const expected = {
      amount: existing.amount,
      description: existing.description,
      type: existing.type,
      paidBy: existing.paidBy,
      date: existing.date,
      updatedAt: existing.updatedAt,
    };
    const queueDelete = async () => {
      const queuedUpdate = (await dequeueAll({ userId, messId })).find((operation) =>
        operation.type === 'UPDATE_EXPENSE'
        && operation.status !== 'failed'
        && operation.status !== 'conflict'
        && operation.payload.id === id,
      );
      const operationId = queuedUpdate?.id ?? `offline-${uuidv4()}`;
      const baseline = queuedUpdate?.payload.expected ?? expected;
      setExpenses((previous) => previous.filter((expense) => expense.id !== id));
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({
        ...(queuedUpdate ?? { id: operationId, type: 'DELETE_EXPENSE' as const, createdAt: Date.now() }),
        type: 'DELETE_EXPENSE',
        attempts: 0,
        retryCount: 0,
        nextAttemptAt: undefined,
        status: 'pending',
        lastError: undefined,
        payload: { id, cycleId: existing.cycleId, ...baseline, userId, messId, expected: baseline },
      });
    };
    if (!navigator.onLine) {
      await queueDelete();
      return;
    }
    try {
      let expectedUpdatedAt = existing.updatedAt;
      if (!expectedUpdatedAt) {
        const versionResult = await withRequestTimeout((signal) => supabase.from('expenses')
          .select('updated_at, amount, description, type, paid_by, date')
          .eq('id', id).eq('mess_id', messId).abortSignal(signal).maybeSingle());
        if (versionResult.error) {
          if (isTransientRequestError(versionResult.error)) {
            await queueDelete();
            return;
          }
          throw new Error('Unable to verify the expense version. Please try again.');
        }
        if (!versionResult.data) throw new Error('This expense no longer exists.');
        const current = versionResult.data;
        if (Number(current.amount) !== existing.amount || current.description !== existing.description || current.type !== existing.type || current.paid_by !== existing.paidBy || dateOnly(current.date) !== dateOnly(existing.date)) {
          const conflict = requestError('This expense changed on another device. Reload it before deleting it.');
          conflict.code = 'OFFLINE_CONFLICT';
          throw conflict;
        }
        expectedUpdatedAt = current.updated_at;
        expected.updatedAt = expectedUpdatedAt;
      }
      const now = new Date();
      const result = await withRequestTimeout((signal) => supabase.from('expenses')
        .update({ deleted_at: now.toISOString(), delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString() })
        .eq('id', id).eq('mess_id', messId).eq('updated_at', expectedUpdatedAt).is('deleted_at', null)
        .abortSignal(signal).select('id').maybeSingle());
      if (result.error) {
        if (isTransientRequestError(result.error)) {
          await queueDelete();
          return;
        }
        throw new Error('Unable to delete expense. Please try again.');
      }
      if (!result.data) {
        const conflict = requestError('This expense changed on another device. Reload it before deleting it.');
        conflict.code = 'OFFLINE_CONFLICT';
        throw conflict;
      }
      setExpenses((previous) => previous.filter((expense) => expense.id !== id));
      broadcast();
    } catch (error) {
      if (!isTransientRequestError(error)) throw error;
      await queueDelete();
    }
  }, []);

  const restoreExpense = useCallback(async (id: string) => {
    const { userId, messId, setExpenses, broadcast } = latest.current;
    if (!userId || !messId) return;
    const { data, error } = await withRequestTimeout((signal) => supabase.from('expenses').update({ deleted_at: null, delete_expires_at: null }).eq('id', id).eq('mess_id', messId).not('deleted_at', 'is', null).abortSignal(signal).select('id, cycle_id, amount, description, type, date, paid_by, updated_at').maybeSingle());
    if (error) throw new Error('Unable to restore expense. Please try again.');
    if (data?.cycle_id) setExpenses((previous) => previous.some((expense) => expense.id === data.id) ? previous : [{ id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by, updatedAt: data.updated_at }, ...previous]);
    broadcast();
  }, []);

  return { addExpense, updateExpense, deleteExpense, restoreExpense };
}
