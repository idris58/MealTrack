import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '@/lib/supabase';
import { enqueue } from '@/lib/offline-queue';
import { triggerDepositPush } from '@/lib/push-triggers';
import type { ChangelogChange, CycleDeposit } from '@/lib/meal-types';

type Options = {
  userId: string | null;
  messId: string | null;
  deposits: CycleDeposit[];
  setDeposits: Dispatch<SetStateAction<CycleDeposit[]>>;
  setPendingSyncIds: Dispatch<SetStateAction<Set<string>>>;
  getCycleId: (cycleId?: string) => string | null;
  getMemberName: (memberId: string, cycleId: string) => string;
  recordChange: (input: { cycleId: string; entityType: 'deposit'; entityId: string; action: 'update'; title: string; changes: ChangelogChange[] }) => Promise<void>;
  broadcast: () => void;
};
const isNetworkError = (error: { message?: string; status?: number }) =>
  error.status === 0 || /fetch|network|connection|offline|load failed/i.test(error.message ?? '');

export function useDeposits(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const addDeposit = useCallback(async (memberId: string, amount: number, cycleId?: string, note?: string) => {
    const { userId, messId, deposits, setDeposits, setPendingSyncIds, getCycleId, getMemberName, recordChange, broadcast } = latest.current;
    if (!userId || !messId || amount === 0) return;
    const targetCycleId = getCycleId(cycleId);
    if (!targetCycleId) return;
    const memberName = getMemberName(memberId, targetCycleId);
    const previousBalance = deposits
      .filter((deposit) => deposit.cycleId === targetCycleId && deposit.memberId === memberId)
      .reduce((total, deposit) => total + deposit.amount, 0);

    const recordId = uuidv4();
    if (!navigator.onLine) {
      const id = `offline-${uuidv4()}`;
      setDeposits((previous) => [...previous, {
        id, cycleId: targetCycleId, memberId, amount, note: note ?? undefined, createdAt: new Date().toISOString(),
      }]);
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({
        id,
        type: 'ADD_DEPOSIT',
        payload: { recordId, memberId, amount, cycleId: targetCycleId, note: note ?? null, userId, messId },
        createdAt: Date.now(),
      });
      return;
    }

    const { data, error } = await supabase.from('cycle_deposits').upsert([{
      id: recordId, member_id: memberId, cycle_id: targetCycleId, amount, note: note ?? null, user_id: userId, mess_id: messId,
    }], { onConflict: 'id' }).select().single();
    if (error) {
      if (isNetworkError(error)) {
        const id = `offline-${uuidv4()}`;
        setDeposits((previous) => [...previous, { id, cycleId: targetCycleId, memberId, amount, note: note ?? undefined, createdAt: new Date().toISOString() }]);
        setPendingSyncIds((previous) => new Set(previous).add(id));
        await enqueue({ id, type: 'ADD_DEPOSIT', payload: { recordId, memberId, amount, cycleId: targetCycleId, note: note ?? null, userId, messId }, createdAt: Date.now() });
        return;
      }
      throw new Error('Unable to add deposit. Please try again.');
    }

    setDeposits((previous) => [...previous, {
      id: data.id, cycleId: data.cycle_id, memberId: data.member_id, amount: Number(data.amount),
      note: data.note ?? undefined, createdAt: data.created_at,
    }]);
    void triggerDepositPush({ depositId: data.id });
    await recordChange({
      cycleId: targetCycleId, entityType: 'deposit', entityId: data.id, action: 'update',
      title: `Updated deposit for ${memberName}`,
      changes: [
        { field: 'member', label: 'Member', value: memberName },
        { field: 'deposit_balance', label: 'Deposit Balance', from: previousBalance, to: previousBalance + amount },
        { field: 'transaction_amount', label: 'Transaction', value: Number(data.amount) },
        ...(data.note ? [{ field: 'note', label: 'Note', value: data.note }] : []),
      ],
    });
    broadcast();
  }, []);

  return { addDeposit };
}
