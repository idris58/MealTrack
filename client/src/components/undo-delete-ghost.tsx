import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_GRACE_MS = 10_000;

export function UndoDeleteGhost({
  children,
  message,
  expiresAt,
  onUndo,
  onExpired,
  className,
  overlayClassName,
}: {
  children: ReactNode;
  message: string;
  expiresAt: number;
  onUndo: () => void;
  onExpired: () => void;
  className?: string;
  overlayClassName?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (now < expiresAt) return;
    onExpired();
  }, [expiresAt, now, onExpired]);

  const remainingMs = Math.max(0, expiresAt - now);
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const progress = useMemo(() => {
    return Math.max(0, Math.min(100, (remainingMs / DEFAULT_GRACE_MS) * 100));
  }, [remainingMs]);

  return (
    <div className={cn('relative overflow-hidden rounded-lg', className)}>
      <div className="pointer-events-none select-none opacity-55 grayscale-[10%]">
        {children}
      </div>
      <div
        className={cn(
          'absolute inset-0 z-10 flex items-center justify-center border border-dashed border-amber-500/70 bg-amber-50/55 px-4 py-3 text-center shadow-[inset_0_-2px_0_rgba(180,83,9,0.22)] dark:border-amber-400/70 dark:bg-amber-950/55 dark:shadow-[inset_0_-2px_0_rgba(251,191,36,0.18)]',
          overlayClassName,
        )}
      >
        <div className="flex w-full max-w-lg flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm font-semibold text-foreground sm:text-base">
              {message} ({remainingSeconds}s)
            </p>
            <div className="mx-auto h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-white/70 shadow-inner">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={onUndo}>
            Undo
          </Button>
        </div>
      </div>
    </div>
  );
}
