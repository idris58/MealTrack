/**
 * offline-toast.tsx
 *
 * Replaces the old static OfflineBanner.
 *
 * Behaviour:
 *  • Goes offline  → Shows a persistent (non-dismissible) Sonner toast with a
 *                    WifiOff icon. Toast stays until connection is restored.
 *  • Comes online  → Dismisses the offline toast, shows a green "Back online!
 *                    Syncing…" success toast (auto-closes after 4 s), then
 *                    calls triggerSync() from MealContext and registers a
 *                    Background Sync tag with the SW for resilience.
 *
 * Note: This component renders nothing in the DOM — all output goes through
 * Sonner's global <Toaster> (added in App.tsx).
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { WifiOff, CloudUpload, AlertTriangle } from 'lucide-react';
import { useNetworkStatus } from '@/lib/pwa';
import { useMeal } from '@/lib/meal-context';

const OFFLINE_TOAST_ID = 'mealtrack-offline-status';

/** Register a Background Sync tag so the OS can wake the SW even if the tab is backgrounded. */
async function requestBackgroundSync() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    // Background Sync API — not available on all browsers (Firefox, Safari)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncManager = (reg as any).sync as { register: (tag: string) => Promise<void> } | undefined;
    if (syncManager) {
      await syncManager.register('mealtrack-sync');
    }
  } catch {
    // Non-fatal — the app-level triggerSync() still runs
  }
}

export function OfflineToastManager() {
  const { isOnline } = useNetworkStatus();
  const { triggerSync, failedSyncOps, retryFailedSync, discardFailedSync } = useMeal();
  const prevOnlineRef = useRef(isOnline);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // On mount, show the offline toast immediately if already offline
    hasMountedRef.current = true;
    if (!isOnline) {
      toast.warning(
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <WifiOff className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">You're offline</p>
            <p className="text-xs text-muted-foreground">Changes will sync when back online</p>
          </div>
        </div>,
        {
          id: OFFLINE_TOAST_ID,
          duration: Infinity,
          dismissible: false,
        },
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasMountedRef.current) return;

    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (!isOnline && wasOnline) {
      // Transition: online → offline
      toast.warning(
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <WifiOff className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">You're offline</p>
            <p className="text-xs text-muted-foreground">Changes will sync when back online</p>
          </div>
        </div>,
        {
          id: OFFLINE_TOAST_ID,
          duration: Infinity,
          dismissible: false,
        },
      );
    }

    if (isOnline && !wasOnline) {
      // Transition: offline → online
      toast.dismiss(OFFLINE_TOAST_ID);

      toast.success(
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CloudUpload className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Back online!</p>
            <p className="text-xs text-muted-foreground">Syncing latest changes…</p>
          </div>
        </div>,
        {
          duration: 4000,
        },
      );

      // Trigger sync in the app layer
      void triggerSync();

      // Also request a Background Sync tag for resilience (even if the tab loses focus)
      void requestBackgroundSync();
    }
  }, [isOnline, triggerSync]);

  // The service worker can wake an open client after Background Sync.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'TRIGGER_SYNC' && navigator.onLine) void triggerSync();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [triggerSync]);

  useEffect(() => {
    const toastId = 'mealtrack-offline-failed-ops';
    if (failedSyncOps.length === 0) {
      toast.dismiss(toastId);
      return;
    }
    const failed = failedSyncOps[0];
    toast.error(
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{failedSyncOps.length} change{failedSyncOps.length === 1 ? '' : 's'} need attention</p>
          <p className="text-xs text-muted-foreground">{failed.lastError ?? 'A saved offline change could not sync.'}</p>
          <div className="mt-2 flex gap-2">
            {failed.status !== 'conflict' && <button className="text-xs font-semibold underline" onClick={() => void retryFailedSync()}>Retry</button>}
            <button className="text-xs text-muted-foreground underline" onClick={() => {
              if (window.confirm(failed.status === 'conflict' ? 'Discard the stale offline change and reload the current expense? Your offline version will be lost.' : 'Discard this change? This cannot be undone.')) void discardFailedSync(failed.id);
            }}>{failed.status === 'conflict' ? 'Discard & refresh' : 'Discard'}</button>
          </div>
        </div>
      </div>,
      { id: toastId, duration: Infinity, dismissible: false },
    );
  }, [failedSyncOps, retryFailedSync, discardFailedSync]);

  return null;
}
