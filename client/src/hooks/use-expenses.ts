import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '@/lib/supabase';
import { dequeueAll, enqueue, removeFromQueue } from '@/lib/offline-queue';
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
const isNetworkError = (error: { message?: string; status?: number }) =>
  error.status === 0 || /fetch|network|connection|offline|load failed/i.test(error.message ?? '');

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
    if (!navigator.onLine) {
      const id = `offline-${uuidv4()}`;
      setExpenses((previous) => [{ id, cycleId: targetCycleId, amount, description, type, date, paidBy }, ...previous]);
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({ id, type: 'ADD_EXPENSE', payload: { recordId, amount, description, type, paidBy, date, userId, messId, cycleId: targetCycleId }, createdAt: Date.now() });
      return;
    }
    const { data, error } = await supabase.from('expenses').upsert([{
      id: recordId, amount, description, type, paid_by: paidBy, user_id: userId, mess_id: messId, cycle_id: targetCycleId, ...(expenseDate ? { date } : {}),
    }], { onConflict: 'id' }).select().single();
    if (error) {
      if (isNetworkError(error)) {
        const id = `offline-${uuidv4()}`;
        setExpenses((previous) => [{ id, cycleId: targetCycleId, amount, description, type, date, paidBy }, ...previous]);
        setPendingSyncIds((previous) => new Set(previous).add(id));
        await enqueue({ id, type: 'ADD_EXPENSE', payload: { recordId, amount, description, type, paidBy, date, userId, messId, cycleId: targetCycleId }, createdAt: Date.now() });
        return;
      }
      throw new Error('Unable to add expense. Please try again.');
    }
    const next = { id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by } as Expense;
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
    if (!navigator.onLine) {
      const operationId = `offline-${uuidv4()}`;
      setExpenses((previous) => previous.map((expense) => expense.id === id ? { ...expense, ...updates, date: updates.date ?? expense.date } : expense));
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({ id: operationId, type: 'UPDATE_EXPENSE', payload: { id, ...updates, date: updates.date ?? existing.date, cycleId: existing.cycleId, userId, messId, expected: { amount: existing.amount, description: existing.description, type: existing.type, paidBy: existing.paidBy, date: existing.date } }, createdAt: Date.now() });
      return;
    }
    const { error } = await supabase.from('expenses').update({ amount: updates.amount, description: updates.description, type: updates.type, paid_by: updates.paidBy, ...(updates.date ? { date: updates.date } : {}) }).eq('id', id).eq('mess_id', messId);
    if (error) {
      if (isNetworkError(error)) {
        const operationId = `offline-${uuidv4()}`;
        setExpenses((previous) => previous.map((expense) => expense.id === id ? { ...expense, ...updates, date: updates.date ?? expense.date } : expense));
        setPendingSyncIds((previous) => new Set(previous).add(id));
        await enqueue({ id: operationId, type: 'UPDATE_EXPENSE', payload: { id, ...updates, date: updates.date ?? existing.date, cycleId: existing.cycleId, userId, messId, expected: { amount: existing.amount, description: existing.description, type: existing.type, paidBy: existing.paidBy, date: existing.date } }, createdAt: Date.now() });
        return;
      }
      throw new Error('Unable to update expense. Please try again.');
    }
    setExpenses((previous) => previous.map((expense) => expense.id === id ? { ...expense, ...updates, date: updates.date ?? expense.date } : expense));
    broadcast();
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
    if (!navigator.onLine) {
      const operationId = `offline-${uuidv4()}`;
      setExpenses((previous) => previous.filter((expense) => expense.id !== id));
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({ id: operationId, type: 'DELETE_EXPENSE', payload: { id, cycleId: existing.cycleId, description: existing.description, amount: existing.amount, type: existing.type, paidBy: existing.paidBy, date: existing.date, userId, messId, expected: { amount: existing.amount, description: existing.description, type: existing.type, paidBy: existing.paidBy, date: existing.date } }, createdAt: Date.now() });
      return;
    }
    const now = new Date();
    const { error } = await supabase.from('expenses').update({ deleted_at: now.toISOString(), delete_expires_at: new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString() }).eq('id', id).eq('mess_id', messId).is('deleted_at', null);
    if (error) {
      if (isNetworkError(error)) {
        const operationId = `offline-${uuidv4()}`;
        setExpenses((previous) => previous.filter((expense) => expense.id !== id));
        setPendingSyncIds((previous) => new Set(previous).add(id));
        await enqueue({ id: operationId, type: 'DELETE_EXPENSE', payload: { id, cycleId: existing.cycleId, description: existing.description, amount: existing.amount, type: existing.type, paidBy: existing.paidBy, date: existing.date, userId, messId, expected: { amount: existing.amount, description: existing.description, type: existing.type, paidBy: existing.paidBy, date: existing.date } }, createdAt: Date.now() });
        return;
      }
      throw new Error('Unable to delete expense. Please try again.');
    }
    setExpenses((previous) => previous.filter((expense) => expense.id !== id));
    broadcast();
  }, []);

  const restoreExpense = useCallback(async (id: string) => {
    const { userId, messId, setExpenses, broadcast } = latest.current;
    if (!userId || !messId) return;
    const { data, error } = await supabase.from('expenses').update({ deleted_at: null, delete_expires_at: null }).eq('id', id).eq('mess_id', messId).not('deleted_at', 'is', null).select('id, cycle_id, amount, description, type, date, paid_by').maybeSingle();
    if (error) throw new Error('Unable to restore expense. Please try again.');
    if (data?.cycle_id) setExpenses((previous) => previous.some((expense) => expense.id === data.id) ? previous : [{ id: data.id, cycleId: data.cycle_id, amount: Number(data.amount), description: data.description, type: data.type, date: data.date, paidBy: data.paid_by }, ...previous]);
    broadcast();
  }, []);

  return { addExpense, updateExpense, deleteExpense, restoreExpense };
}
