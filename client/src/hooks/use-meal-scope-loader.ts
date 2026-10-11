import { useEffect, type MutableRefObject } from 'react';

type Options = {
  userId: string | null;
  messId: string | null;
  loadedScopeRef: MutableRefObject<string | null>;
  hasLoadedDataRef: MutableRefObject<boolean>;
  setLoading: (loading: boolean) => void;
  clearError: () => void;
  load: () => void;
};

/** Resets and hydrates normalized meal data whenever the account scope changes. */
export function useMealScopeLoader({ userId, messId, loadedScopeRef, hasLoadedDataRef, setLoading, clearError, load }: Options) {
  useEffect(() => {
    if (!userId || !messId) return;
    const scope = `${userId}:${messId}`;
    if (loadedScopeRef.current !== scope) {
      loadedScopeRef.current = scope;
      hasLoadedDataRef.current = false;
      setLoading(true);
      clearError();
    }
    load();
  }, [clearError, hasLoadedDataRef, load, loadedScopeRef, messId, setLoading, userId]);
}
