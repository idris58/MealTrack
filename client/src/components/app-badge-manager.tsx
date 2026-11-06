import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNotice } from '@/lib/notice-context';
import { useMealOffRequests } from '@/lib/meal-context';
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
  const { pendingCount } = useMealOffRequests();
  const pendingMealOffCount = canOperateMeals && profile?.mess_id ? pendingCount : 0;

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
