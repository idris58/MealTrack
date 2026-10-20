import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNotice } from '@/lib/notice-context';
import { supabase } from '@/lib/supabase';
import { updateAppBadge, clearAppBadge } from '@/lib/app-badge';

/**
 * AppBadgeManager
 *
 * Keeps the PWA app icon badge in sync with actionable items:
 * 1. Pending meal-off requests awaiting staff action (for managers / meal operators)
 * 2. Active unread (non-dismissed) mess notice
 *
 * Automatically subscribes to Supabase Realtime changes for instant badge updates.
 */
export function AppBadgeManager() {
  const { profile, canOperateMeals } = useAuth();
  const { notice, dismissed } = useNotice();
  const [pendingMealOffCount, setPendingMealOffCount] = useState(0);

  const fetchPendingMealOffCount = useCallback(async () => {
    if (!profile?.mess_id || !canOperateMeals) {
      setPendingMealOffCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('meal_off_requests')
        .select('id', { count: 'exact', head: true })
        .eq('mess_id', profile.mess_id)
        .eq('status', 'pending');

      if (!error && typeof count === 'number') {
        setPendingMealOffCount(count);
      }
    } catch (err) {
      console.error('Failed to query pending meal-off requests for app badge:', err);
    }
  }, [profile?.mess_id, canOperateMeals]);

  // Initial load and Realtime listener for pending meal-off requests
  useEffect(() => {
    if (!profile?.mess_id || !canOperateMeals) {
      setPendingMealOffCount(0);
      return;
    }

    void fetchPendingMealOffCount();

    const channel = supabase
      .channel(`badge-meal-off-requests-${profile.mess_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meal_off_requests',
          filter: `mess_id=eq.${profile.mess_id}`,
        },
        () => {
          void fetchPendingMealOffCount();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.mess_id, canOperateMeals, fetchPendingMealOffCount]);

  // Calculate and apply badge whenever notice status or pending requests change
  useEffect(() => {
    const unreadNoticeCount = notice && !dismissed ? 1 : 0;
    const totalBadgeCount = pendingMealOffCount + unreadNoticeCount;

    updateAppBadge(totalBadgeCount);

    return () => {
      clearAppBadge();
    };
  }, [pendingMealOffCount, notice, dismissed]);

  return null;
}
