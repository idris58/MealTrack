/**
 * notice-banner.tsx
 * A premium animated top-of-app notice banner shown to all mess participants.
 *
 * – Marquee ticker for long text on small screens.
 * – Full inline content on wider screens.
 * – Dismiss × button (dismissal persisted in localStorage).
 * – Bell-restore pill so members can re-read dismissed notice.
 * – Manager / Coordinator: Edit & Remove quick-action buttons.
 * – Smooth slide-down enter / slide-up exit transitions.
 */
import { useState } from 'react';
import { Bell, Megaphone, Pencil, Trash2, X, Eye } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNotice } from '@/lib/notice-context';
import { useAuth } from '@/lib/auth-context';
import { NoticeDialog } from '@/components/notice-dialog';

import { useMarqueeDuration } from '@/hooks/use-marquee-duration';

// ── Mini marquee for mobile ───────────────────────────────────────────────────

function InlineTicker({ text }: { text: string }) {
  const { targetRef, duration } = useMarqueeDuration(text);

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-900/40" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-amber-50 to-transparent dark:from-amber-900/40" />
      <div
        className="notice-ticker-track text-[13px] font-medium text-amber-900 dark:text-amber-200"
        style={duration ? { animationDuration: `${duration}s` } : undefined}
      >
        <div ref={targetRef} className="notice-ticker-group">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={`p-${i}`} className="notice-ticker-item">{text}</span>
          ))}
        </div>
        <div className="notice-ticker-group" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={`c-${i}`} className="notice-ticker-item">{text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

export function NoticeBanner() {
  const { notice, dismissed, dismissNotice, restoreNotice, deleteNotice } = useNotice();
  const { profile } = useAuth();
  const [showReadDialog, setShowReadDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage =
    profile?.role === 'manager' || profile?.role === 'coordinator';

  // Nothing to show
  if (!notice) return null;

  // If dismissed, show a tiny restore pill instead of full banner
  if (dismissed) {
    return (
      <>
        <div
          className="flex items-center justify-center gap-2 border-b border-amber-200/60 bg-amber-50/60 px-4 py-1.5 dark:border-amber-800/40 dark:bg-amber-950/20"
          role="status"
        >
          <Bell className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300 truncate max-w-[240px] sm:max-w-none">
            {notice.content}
          </span>
          <button
            type="button"
            onClick={() => setShowReadDialog(true)}
            className="ml-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-800/40 dark:text-amber-300 dark:hover:bg-amber-800/60 transition-colors"
          >
            View
          </button>
          <button
            type="button"
            onClick={restoreNotice}
            aria-label="Restore banner"
            className="rounded-full p-0.5 text-amber-500 hover:text-amber-700 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>

        {showReadDialog && (
          <NoticeDialog
            mode="read"
            open={showReadDialog}
            onOpenChange={setShowReadDialog}
          />
        )}
      </>
    );
  }

  const handleDelete = async () => {
    if (!notice || deleting) return;
    setDeleting(true);
    await deleteNotice(notice.id);
    setDeleting(false);
  };

  const expiryText = formatDistanceToNow(parseISO(notice.expiresAt), {
    addSuffix: true,
  });

  return (
    <>
      {/* Banner */}
      <div
        className={cn(
          'notice-app-banner group relative flex min-h-[44px] w-full items-stretch gap-0',
          'border-b border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50/90 to-amber-100/60',
          'dark:border-amber-800/60 dark:from-amber-950/60 dark:via-amber-900/40 dark:to-amber-950/30',
        )}
        role="status"
        aria-label={`Notice: ${notice.content.slice(0, 50)}`}
      >
        {/* Left badge */}
        <div className="flex shrink-0 items-center gap-2 border-r border-amber-200 bg-gradient-to-b from-amber-400 to-amber-500 px-3 py-2.5 shadow-[1px_0_6px_rgba(217,119,6,0.2)] dark:border-amber-800/60 dark:from-amber-700 dark:to-amber-800 sm:px-4">
          <Megaphone className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" />
          <span className="hidden text-xs font-bold uppercase tracking-widest text-white sm:block">
            Notice
          </span>
        </div>

        {/* Content area */}
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 sm:px-4">
          {/* Mobile: scrolling ticker */}
          <div className="flex min-w-0 flex-1 items-center sm:hidden">
            <button
              type="button"
              onClick={() => setShowReadDialog(true)}
              className="min-w-0 flex-1 text-left"
            >
              <InlineTicker text={notice.content} />
            </button>
          </div>

          {/* Desktop: inline text */}
          <button
            type="button"
            onClick={() => setShowReadDialog(true)}
            className="hidden min-w-0 flex-1 text-left sm:block"
          >
            <span className="line-clamp-1 text-sm font-medium text-amber-950 dark:text-amber-100">
              {notice.content}
            </span>
          </button>

          {/* Expiry chip */}
          <span className="hidden shrink-0 rounded-full border border-amber-200 bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-800/40 dark:text-amber-300 lg:inline-flex">
            Expires {expiryText}
          </span>

          {/* Read more */}
          <button
            type="button"
            onClick={() => setShowReadDialog(true)}
            className="hidden shrink-0 rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 hover:border-amber-400 transition-colors dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-800/40 sm:inline-flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Read
          </button>

          {/* Manager actions */}
          {canManage && (
            <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={() => setShowEditDialog(true)}
                className="rounded-full border border-amber-300 bg-white/70 p-1.5 text-amber-700 hover:bg-amber-50 hover:text-amber-900 transition-colors dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-800/40"
                title="Edit notice"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-full border border-red-200 bg-white/70 p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
                title="Remove notice"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={dismissNotice}
          aria-label="Dismiss notice"
          className="flex shrink-0 items-center border-l border-amber-200 px-3 text-amber-400 hover:bg-amber-100 hover:text-amber-700 transition-colors dark:border-amber-800/60 dark:hover:bg-amber-900/30 dark:hover:text-amber-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Dialogs */}
      {showReadDialog && (
        <NoticeDialog
          mode="read"
          open={showReadDialog}
          onOpenChange={setShowReadDialog}
        />
      )}
      {showEditDialog && canManage && (
        <NoticeDialog
          mode="edit"
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
        />
      )}
    </>
  );
}
