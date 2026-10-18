import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { supabase } from '@/lib/supabase';
import { triggerSettlementPendingPush } from '@/lib/push-triggers';
import type { ChangelogEntry, Cycle, CycleDeposit, CycleDetails, Expense, MealLog, Member, SnapshotMember } from '@/lib/meal-types';

const DELETE_GRACE_MS = 10_000;

type Options = {
  userId: string | null;
  messId: string | null;
  cycles: Cycle[];
  activeCycle: Cycle | null;
  pendingCycle: Cycle | null;
  getCycleMembers: (cycleId: string) => Member[];
  getCycleDetails?: (cycleId: string) => CycleDetails | null;
  setCycles: Dispatch<SetStateAction<Cycle[]>>;
  setLoadedCycleIds: Dispatch<SetStateAction<Set<string>>>;
  setDeposits: Dispatch<SetStateAction<CycleDeposit[]>>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>;
  setChangelogEntries: Dispatch<SetStateAction<ChangelogEntry[]>>;
  addDeposit: (memberId: string, amount: number, cycleId?: string, note?: string) => Promise<void>;
  reload: () => void;
  broadcast: () => void;
};

function defaultCycleName(date: string | Date) {
  const value = date instanceof Date ? date : new Date(date);
  const month = value.getMonth();
  const season = month >= 2 && month <= 4 ? 'Spring' : month >= 5 && month <= 7 ? 'Summer' : month >= 8 && month <= 10 ? 'Fall' : 'Winter';
  return `Meal ${season}-${String(value.getFullYear()).slice(-2)}`;
}

export function useCycles({ userId, messId, cycles, activeCycle, pendingCycle, getCycleMembers, getCycleDetails, setCycles, setLoadedCycleIds, setDeposits, setExpenses, setMealLogs, setChangelogEntries, addDeposit, reload, broadcast }: Options) {
  const renameActiveCycle = useCallback(async (name: string) => {
    if (!userId || !messId || !activeCycle) return;
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Cycle name is required.');
    if (trimmed === activeCycle.name) return;
    if (cycles.some((cycle) => cycle.id !== activeCycle.id && cycle.name.trim().toLowerCase() === trimmed.toLowerCase())) throw new Error('A cycle with this name already exists.');
    const { error } = await supabase.from('cycles').update({ name: trimmed }).eq('id', activeCycle.id).eq('mess_id', messId).eq('status', 'active');
    if (error) throw new Error(error.code === '23505' ? 'A cycle with this name already exists.' : 'Unable to rename the current cycle right now.');
    setCycles((previous) => previous.map((cycle) => cycle.id === activeCycle.id ? { ...cycle, name: trimmed } : cycle));
    broadcast();
  }, [activeCycle, broadcast, cycles, messId, setCycles, userId]);

  const closeActiveCycle = useCallback(async () => {
    if (!userId || !messId || !activeCycle) return;
    if (pendingCycle) throw new Error('Finish the pending cycle settlement before closing another cycle.');
    const snapshot: SnapshotMember[] = getCycleMembers(activeCycle.id).map(({ id, name, avatar }) => ({ id, name, avatar }));
    const closedAt = new Date().toISOString();
    const { error } = await supabase.from('cycles').update({ status: 'pending', closed_at: closedAt, members_snapshot: snapshot }).eq('id', activeCycle.id).eq('mess_id', messId);
    if (error) throw new Error('Unable to close the cycle. Please try again.');
    setCycles((previous) => previous.map((cycle) => cycle.id === activeCycle.id ? { ...cycle, status: 'pending', closedAt, membersSnapshot: snapshot } : cycle));

    if (getCycleDetails) {
      const details = getCycleDetails(activeCycle.id);
      const hasDueMembers = (details?.members ?? []).some((member) => member.balance < 0);

      if (hasDueMembers) {
        void triggerSettlementPendingPush({
          cycleId: activeCycle.id,
        });
      }
    }

    broadcast();
  }, [activeCycle, broadcast, getCycleDetails, getCycleMembers, messId, pendingCycle, setCycles, userId]);

  const startNewCycle = useCallback(async (name: string, startedAt?: string, carryForwards?: Array<{ memberId: string; amount: number }>) => {
    if (!userId || !messId) return;
    if (activeCycle) throw new Error('Close the current active cycle before starting a new one.');
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Cycle name is required.');
    if (cycles.some((cycle) => cycle.name.trim().toLowerCase() === trimmed.toLowerCase())) throw new Error('A cycle with this name already exists.');
    const { data, error } = await supabase.from('cycles').insert([{ name: trimmed, status: 'active', user_id: userId, mess_id: messId, started_at: startedAt ?? new Date().toISOString() }]).select().single();
    if (error) throw new Error(error.code === '23505' ? 'A cycle with this name already exists.' : 'Unable to start a new cycle. Please try again.');
    setCycles((previous) => [{ id: data.id, name: data.name ?? trimmed, status: data.status, startedAt: data.started_at, closedAt: data.closed_at, finalizedAt: data.finalized_at, membersSnapshot: data.members_snapshot }, ...previous]);
    setLoadedCycleIds((previous) => new Set(previous).add(data.id));
    if (pendingCycle && carryForwards?.length) {
      for (const { memberId, amount } of carryForwards) {
        if (amount <= 0) continue;
        const value = Math.round(amount * 100) / 100;
        await addDeposit(memberId, -value, pendingCycle.id, 'Carry-forward correction — balance moved to next cycle');
        await addDeposit(memberId, value, data.id, `Carry-forward from ${pendingCycle.name}`);
      }
    }
    broadcast();
  }, [activeCycle, addDeposit, broadcast, cycles, messId, pendingCycle, setCycles, setLoadedCycleIds, userId]);

  const suggestCycleName = useCallback((date?: Date) => {
    const base = defaultCycleName(date ?? new Date());
    const names = new Set(cycles.map((cycle) => cycle.name.trim().toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let suffix = 1;
    while (names.has(`${base}_${suffix}`.toLowerCase())) suffix += 1;
    return `${base}_${suffix}`;
  }, [cycles]);

  const markCycleClosed = useCallback(async (cycleId: string) => {
    if (!userId || !messId) return;
    const finalizedAt = new Date().toISOString();
    const { error } = await supabase.from('cycles').update({ status: 'closed', finalized_at: finalizedAt }).eq('id', cycleId).eq('mess_id', messId);
    if (error) throw new Error('Unable to finalize the cycle. Please try again.');
    const { error: changelogError } = await supabase.from('changelog_entries').delete().eq('cycle_id', cycleId).eq('mess_id', messId);
    if (changelogError) console.error('Error deleting cycle changelog entries:', changelogError);
    setCycles((previous) => previous.map((cycle) => cycle.id === cycleId ? { ...cycle, status: 'closed', finalizedAt } : cycle));
    setChangelogEntries((previous) => previous.filter((entry) => entry.cycleId !== cycleId));
    broadcast();
  }, [broadcast, messId, setChangelogEntries, setCycles, userId]);

  const deleteCycle = useCallback(async (cycleId: string) => {
    if (!userId || !messId || !cycles.some((cycle) => cycle.id === cycleId && cycle.status === 'closed')) return;
    const now = new Date();
    const { error } = await supabase.from('cycles').update({ deleted_at: now.toISOString(), delete_expires_at: new Date(now.getTime() + DELETE_GRACE_MS).toISOString() }).eq('id', cycleId).eq('mess_id', messId).eq('status', 'closed').is('deleted_at', null);
    if (error) throw new Error('Unable to delete the cycle. Please try again.');
    setCycles((previous) => previous.filter((cycle) => cycle.id !== cycleId));
    setLoadedCycleIds((previous) => { const next = new Set(previous); next.delete(cycleId); return next; });
    setDeposits((previous) => previous.filter((item) => item.cycleId !== cycleId));
    setExpenses((previous) => previous.filter((item) => item.cycleId !== cycleId));
    setMealLogs((previous) => previous.filter((item) => item.cycleId !== cycleId));
  }, [cycles, messId, setCycles, setDeposits, setExpenses, setLoadedCycleIds, setMealLogs, userId]);

  const restoreCycle = useCallback(async (cycleId: string) => {
    if (!userId || !messId) return;
    const { data, error } = await supabase.from('cycles').update({ deleted_at: null, delete_expires_at: null }).eq('id', cycleId).eq('mess_id', messId).eq('status', 'closed').not('deleted_at', 'is', null).select('id, name, status, started_at, closed_at, finalized_at, members_snapshot').maybeSingle();
    if (error) throw new Error('Unable to restore the cycle. Please try again.');
    if (data) setCycles((previous) => previous.some((cycle) => cycle.id === data.id) ? previous : [{ id: data.id, name: data.name ?? defaultCycleName(data.started_at), status: data.status, startedAt: data.started_at, closedAt: data.closed_at, finalizedAt: data.finalized_at, membersSnapshot: data.members_snapshot }, ...previous]);
    reload();
  }, [messId, reload, setCycles, userId]);

  return { renameActiveCycle, closeActiveCycle, startNewCycle, suggestCycleName, markCycleClosed, deleteCycle, restoreCycle };
}
