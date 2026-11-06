import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { NotificationPreferences } from '@/lib/notification-preferences';

type NotificationPreferencesContextValue = {
  preferences: NotificationPreferences | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<NotificationPreferences>) => Promise<NotificationPreferences>;
};

const NotificationPreferencesContext = createContext<NotificationPreferencesContextValue | null>(null);

function toPreferences(profile: { notification_preferences: Record<string, unknown> | null; reminder_time: string } | null): NotificationPreferences | null {
  if (!profile) return null;
  return {
    ...(profile.notification_preferences ?? {}),
    reminderTime: String(profile.reminder_time || '22:00').slice(0, 5),
  } as NotificationPreferences;
}

export function NotificationPreferencesProvider({ children }: { children: ReactNode }) {
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const userId = user?.id;
  const [savedPreferences, setSavedPreferences] = useState<NotificationPreferences | null>(null);
  const profilePreferences = toPreferences(profile);
  const preferences = savedPreferences ?? profilePreferences;

  useEffect(() => {
    setSavedPreferences(null);
  }, [userId]);

  const refresh = useCallback(async () => {
    await refreshProfile();
    setSavedPreferences(null);
  }, [refreshProfile]);

  const save = useCallback(async (patch: Partial<NotificationPreferences>) => {
    if (!userId || !profile) throw new Error('Sign in to update notification preferences.');

    const current = preferences ?? toPreferences(profile) ?? { reminderTime: '22:00' };
    const nextCategories = patch.categories
      ? { ...(current.categories ?? {}), ...patch.categories }
      : current.categories;
    const next = {
      ...current,
      ...patch,
      ...(nextCategories ? { categories: nextCategories } : {}),
    };
    const { error } = await supabase
      .from('profiles')
      .update({
        notification_preferences: {
          ...(profile.notification_preferences ?? {}),
          ...(current.global !== undefined ? { global: current.global } : {}),
          ...(current.categories ? { categories: current.categories } : {}),
          ...(patch.global !== undefined ? { global: patch.global } : {}),
          ...(nextCategories ? { categories: nextCategories } : {}),
        },
        ...(patch.reminderTime ? { reminder_time: `${patch.reminderTime}:00` } : {}),
      })
      .eq('id', userId);
    if (error) throw error;

    setSavedPreferences(next);
    return next;
  }, [preferences, profile, userId]);

  const value = useMemo(() => ({
    preferences,
    loading: Boolean(userId && profileLoading && !preferences),
    refresh,
    save,
  }), [preferences, profileLoading, refresh, save, userId]);

  return <NotificationPreferencesContext.Provider value={value}>{children}</NotificationPreferencesContext.Provider>;
}

export function useNotificationPreferences() {
  const context = useContext(NotificationPreferencesContext);
  if (!context) throw new Error('useNotificationPreferences must be used within NotificationPreferencesProvider');
  return context;
}
