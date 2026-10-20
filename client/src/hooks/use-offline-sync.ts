import { useCallback, useEffect, useRef, useState } from 'react';

import {
  dequeueAll,
  removeFromQueue,
  updateQueuedOp,
  type OfflineQueueScope,
  type OfflineOp,
} from '@/lib/offline-queue';
import { isTransientRequestError, retryDelayMs } from '@/lib/request-retry';

type UseOfflineSyncOptions = {
  scope: OfflineQueueScope | null;
  replay: (operation: OfflineOp) => Promise<void>;
  afterSync: () => void;
  pendingItemId: (operation: OfflineOp) => string;
};

/**
 * Coordinates the persistent offline queue. Domain-specific replay lives with
 * the owning action hook; this hook only handles queue lifecycle and retries.
 */
export function useOfflineSync({
  scope,
  replay,
  afterSync,
  pendingItemId,
}: UseOfflineSyncOptions) {
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  const [failedSyncOps, setFailedSyncOps] = useState<OfflineOp[]>([]);
  const syncingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void dequeueAll(scope ?? undefined)
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
  }, [pendingItemId, scope]);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      if (!scope || !navigator.onLine) return;
      const operations = (await dequeueAll(scope)).filter(
        (operation) => operation.status !== 'failed' && operation.status !== 'conflict',
      );

      if (operations.length === 0) return;

      let nextRetryAt: number | null = null;
      let didProcessOperation = false;

      for (const operation of operations) {
        if (operation.nextAttemptAt && operation.nextAttemptAt > Date.now()) {
          nextRetryAt = nextRetryAt === null
            ? operation.nextAttemptAt
            : Math.min(nextRetryAt, operation.nextAttemptAt);
          continue;
        }
        didProcessOperation = true;
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
          const transient = isTransientRequestError(error);
          const attempts = (operation.attempts ?? 0) + (transient ? 0 : 1);
          const retryCount = (operation.retryCount ?? 0) + (transient ? 1 : 0);
          const nextAttemptAt = transient ? Date.now() + retryDelayMs(retryCount) : undefined;
          const failedOperation: OfflineOp = {
            ...operation,
            attempts,
            retryCount,
            nextAttemptAt,
            status: error.code === 'OFFLINE_CONFLICT'
              ? 'conflict'
              : !transient && attempts >= 5
                ? 'failed'
                : 'pending',
            lastError: error.message || 'Unable to sync this change.',
          };
          console.error(`[offline-sync] Failed to replay operation ${operation.id}:`, error);
          await updateQueuedOp(failedOperation);

          if (failedOperation.nextAttemptAt) {
            nextRetryAt = nextRetryAt === null
              ? failedOperation.nextAttemptAt
              : Math.min(nextRetryAt, failedOperation.nextAttemptAt);
          }

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
          if (transient) break;
        }
      }

      if (didProcessOperation) afterSync();

      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = nextRetryAt === null
        ? null
        : window.setTimeout(() => {
            retryTimerRef.current = null;
            void triggerSync();
          }, Math.max(0, nextRetryAt - Date.now()));
    } finally {
      syncingRef.current = false;
    }
  }, [afterSync, pendingItemId, replay, scope]);

  useEffect(() => () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
  }, [scope]);

  // Replay operations left behind by a previous PWA session on startup.
  useEffect(() => {
    if (!scope || !navigator.onLine) return;
    void triggerSync();
  }, [scope, triggerSync]);

  const retryFailedSync = useCallback(async () => {
    if (!scope) return;
    const operations = await dequeueAll(scope);
    for (const operation of operations.filter((item) => item.status === 'failed')) {
      await updateQueuedOp({
        ...operation,
        attempts: 0,
        retryCount: 0,
        nextAttemptAt: undefined,
        status: 'pending',
        lastError: undefined,
      });
      setPendingSyncIds((previous) => new Set(previous).add(pendingItemId(operation)));
    }
    setFailedSyncOps((previous) => previous.filter((operation) => operation.status === 'conflict'));
    await triggerSync();
  }, [pendingItemId, scope, triggerSync]);

  const discardFailedSync = useCallback(async (id: string) => {
    if (!scope) return;
    const operation = (await dequeueAll(scope)).find((item) => item.id === id);
    if (!operation) return;

    await removeFromQueue(id);
    setPendingSyncIds((previous) => {
      const next = new Set(previous);
      next.delete(pendingItemId(operation));
      return next;
    });
    setFailedSyncOps((previous) => previous.filter((item) => item.id !== id));
    afterSync();
  }, [afterSync, pendingItemId, scope]);

  return {
    pendingSyncIds,
    setPendingSyncIds,
    failedSyncOps,
    triggerSync,
    retryFailedSync,
    discardFailedSync,
  };
}
