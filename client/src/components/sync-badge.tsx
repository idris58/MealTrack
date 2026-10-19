/**
 * sync-badge.tsx
 *
 * A small visual indicator shown on cards that have pending offline operations.
 * Renders a pulsing amber dot + cloud-upload icon when the item's ID is in
 * the set of pending sync IDs exposed by MealContext.
 */

import { CloudUpload } from 'lucide-react';
import { useMealData } from '@/lib/meal-context';
import { cn } from '@/lib/utils';

interface SyncBadgeProps {
  itemId?: string;
  show?: boolean;
  className?: string;
}

export function SyncBadge({ itemId, show, className }: SyncBadgeProps) {
  const { pendingSyncIds } = useMealData();

  const isPending =
    show === true ||
    (itemId && (pendingSyncIds.has(itemId) || itemId.startsWith('offline-')));

  if (!isPending) {
    return null;
  }

  return (
    <span
      title="Pending sync — will upload when back online"
      aria-label="Pending sync"
      className={cn(
        'relative flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-400',
        className,
      )}
    >
      {/* pulsing dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      <CloudUpload className="h-3 w-3 shrink-0" />
      <span className="hidden sm:inline">Pending</span>
    </span>
  );
}
