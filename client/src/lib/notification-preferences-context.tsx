import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth-context';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notification-preferences';

type NotificationPreferencesContextValue = {
  preferences: NotificationPreferences | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<NotificationPreferences>) => Promise<NotificationPreferences>;
};

const NotificationPreferencesContext = createContext<NotificationPreferencesContextValue | null>(null);

export function NotificationPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(Boolean(user));

  const refresh = useCallback(async () => {
    if (!userId) {
      setPreferences(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPreferences(await getNotificationPreferences());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setPreferences(null);
    if (!userId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void getNotificationPreferences().then((next) => {
      if (active) setPreferences(next);
    }).catch(() => {
      if (active) setPreferences(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  const save = useCallback(async (patch: Partial<NotificationPreferences>) => {
    const saved = await saveNotificationPreferences(patch);
    setPreferences(saved);
    return saved;
  }, []);

  const value = useMemo(() => ({ preferences, loading, refresh, save }), [preferences, loading, refresh, save]);
  return <NotificationPreferencesContext.Provider value={value}>{children}</NotificationPreferencesContext.Provider>;
}

export function useNotificationPreferences() {
  const context = useContext(NotificationPreferencesContext);
  if (!context) throw new Error('useNotificationPreferences must be used within NotificationPreferencesProvider');
  return context;
}
