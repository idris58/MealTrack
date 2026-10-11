import { useCallback, useEffect, useRef, useState } from 'react';

import {
  dequeueAll,
  removeFromQueue,
  updateQueuedOp,
  type OfflineOp,
} from '@/lib/offline-queue';

type UseOfflineSyncOptions = {
  replay: (operation: OfflineOp) => Promise<void>;
  afterSync: () => void;
  pendingItemId: (operation: OfflineOp) => string;
};

/**
 * Coordinates the persistent offline queue. Domain-specific replay lives with
 * the owning action hook; this hook only handles queue lifecycle and retries.
 */
export function useOfflineSync({
  replay,
  afterSync,
  pendingItemId,
}: UseOfflineSyncOptions) {
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  const [failedSyncOps, setFailedSyncOps] = useState<OfflineOp[]>([]);
  const syncingRef = useRef(false);

  useEffect(() => {
    void dequeueAll()
      .then((operations) => {
        setPendingSyncIds(new Set(
          operations
            .filter((operation) => operation.status !== 'failed' && operation.status !== 'conflict')
            .map(pendingItemId),
        ));
        setFailedSyncOps(operations.filter(
          (operation) => operation.status === 'failed' || operation.status === 'conflict',
        ));
      })
      .catch(() => {
        // IndexedDB can be unavailable in private browsing; the app remains usable online.
      });
  }, [pendingItemId]);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const operations = (await dequeueAll()).filter(
        (operation) => operation.status !== 'failed' && operation.status !== 'conflict',
      );

      if (operations.length === 0) return;

      for (const operation of operations) {
        try {
          await replay(operation);
          await removeFromQueue(operation.id);
          setPendingSyncIds((previous) => {
            const next = new Set(previous);
            next.delete(pendingItemId(operation));
            return next;
          });
        } catch (caught) {
          const error = caught as Error & { code?: string };
          const attempts = (operation.attempts ?? 0) + 1;
          const failedOperation: OfflineOp = {
            ...operation,
            attempts,
            status: error.code === 'OFFLINE_CONFLICT'
              ? 'conflict'
              : attempts >= 5
                ? 'failed'
                : 'pending',
            lastError: error.message || 'Unable to sync this change.',
          };
          console.error(`[offline-sync] Failed to replay operation ${operation.id}:`, error);
          await updateQueuedOp(failedOperation);

          if (failedOperation.status !== 'pending') {
            setFailedSyncOps((previous) => [
              ...previous.filter((item) => item.id !== operation.id),
              failedOperation,
            ]);
            setPendingSyncIds((previous) => {
              const next = new Set(previous);
              next.delete(pendingItemId(operation));
              return next;
            });
          }
        }
      }

      afterSync();
    } finally {
      syncingRef.current = false;
    }
  }, [afterSync, pendingItemId, replay]);

  const retryFailedSync = useCallback(async () => {
    const operations = await dequeueAll();
    for (const operation of operations.filter((item) => item.status === 'failed')) {
      await updateQueuedOp({
        ...operation,
        attempts: 0,
        status: 'pending',
        lastError: undefined,
      });
      setPendingSyncIds((previous) => new Set(previous).add(pendingItemId(operation)));
    }
    setFailedSyncOps((previous) => previous.filter((operation) => operation.status === 'conflict'));
    await triggerSync();
  }, [pendingItemId, triggerSync]);

  const discardFailedSync = useCallback(async (id: string) => {
    const operation = (await dequeueAll()).find((item) => item.id === id);
    if (!operation) return;

    await removeFromQueue(id);
    setPendingSyncIds((previous) => {
      const next = new Set(previous);
      next.delete(pendingItemId(operation));
      return next;
    });
    setFailedSyncOps((previous) => previous.filter((item) => item.id !== id));
    afterSync();
  }, [afterSync, pendingItemId]);

  return {
    pendingSyncIds,
    setPendingSyncIds,
    failedSyncOps,
    triggerSync,
    retryFailedSync,
    discardFailedSync,
  };
}
