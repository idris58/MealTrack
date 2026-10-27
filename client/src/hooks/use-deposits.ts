import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '@/lib/supabase';
import { enqueue } from '@/lib/offline-queue';
import { isTransientRequestError, withRequestTimeout } from '@/lib/request-retry';
import { triggerDepositPush } from '@/lib/push-triggers';
import type { CycleDeposit, DepositKind } from '@/lib/meal-types';

type Options = {
  userId: string | null;
  messId: string | null;
  deposits: CycleDeposit[];
  setDeposits: Dispatch<SetStateAction<CycleDeposit[]>>;
  setPendingSyncIds: Dispatch<SetStateAction<Set<string>>>;
  getCycleId: (cycleId?: string) => string | null;
  broadcast: () => void;
};
export function useDeposits(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const addDeposit = useCallback(async (memberId: string, amount: number, cycleId?: string, note?: string, kind: DepositKind = amount < 0 ? 'refund' : 'deposit') => {
    const { userId, messId, setDeposits, setPendingSyncIds, getCycleId, broadcast } = latest.current;
    if (!userId || !messId) throw new Error('Sign in and join a mess before recording a deposit.');
    if (amount === 0) throw new Error('Deposit amount cannot be zero.');
    const targetCycleId = getCycleId(cycleId);
    if (!targetCycleId) throw new Error('There is no active or selected cycle for this deposit.');

    const recordId = uuidv4();
    const queueDeposit = async () => {
      const id = `offline-${uuidv4()}`;
      setDeposits((previous) => [...previous, {
        id, cycleId: targetCycleId, memberId, amount, kind, note: note ?? undefined, createdAt: new Date().toISOString(),
      }]);
      setPendingSyncIds((previous) => new Set(previous).add(id));
      await enqueue({
        id,
        type: 'ADD_DEPOSIT',
        payload: { recordId, memberId, amount, kind, cycleId: targetCycleId, note: note ?? null, userId, messId },
        createdAt: Date.now(),
      });
    };
    if (!navigator.onLine) {
      await queueDeposit();
      return;
    }

    let data;
    try {
      const result = await withRequestTimeout((signal) => supabase.from('cycle_deposits').upsert([{
        id: recordId, member_id: memberId, cycle_id: targetCycleId, amount, kind, note: note ?? null, user_id: userId, mess_id: messId,
      }], { onConflict: 'id' }).abortSignal(signal).select().single());
      if (result.error) {
        if (isTransientRequestError(result.error)) {
          await queueDeposit();
          return;
        }
        throw new Error('Unable to add deposit. Please try again.');
      }
      data = result.data;
    } catch (error) {
      if (!isTransientRequestError(error)) throw error;
      await queueDeposit();
      return;
    }

    setDeposits((previous) => [...previous, {
      id: data.id, cycleId: data.cycle_id, memberId: data.member_id, amount: Number(data.amount), kind: data.kind,
      note: data.note ?? undefined, createdAt: data.created_at,
    }]);
    void triggerDepositPush({ depositId: data.id });
    broadcast();
  }, []);

  return { addDeposit };
}
