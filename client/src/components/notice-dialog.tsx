/**
 * notice-dialog.tsx
 * Multi-mode dialog for the Notice system:
 *  • mode="read"   — Full notice reader for all roles.
 *  • mode="post"   — Create a new notice (manager / coordinator).
 *  • mode="edit"   — Edit the active notice in-place.
 *
 * Accessible, keyboard-navigable, mobile-friendly (responsive widths).
 * Duration presets + specific datetime picker.
 */
import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  Loader2,
  Megaphone,
  Pencil,
  SendHorizonal,
  Trash2,
} from 'lucide-react';
import { format, formatDistanceToNow, isPast, parseISO, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNotice } from '@/lib/notice-context';
import { useAuth } from '@/lib/auth-context';

// ── Types ─────────────────────────────────────────────────────────────────────

type DialogMode = 'read' | 'post' | 'edit';

interface NoticeDialogProps {
  mode: DialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Duration presets ──────────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
] as const;

// ── Read panel ────────────────────────────────────────────────────────────────

function ReadPanel({ onEdit, onClose }: { onEdit: () => void; onClose: () => void }) {
  const { notice, loading, deleteNotice } = useNotice();
  const { profile } = useAuth();
  const canManage = profile?.role === 'manager' || profile?.role === 'coordinator';
  const [deleting, setDeleting] = useState(false);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Megaphone className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No active notice right now.</p>
      </div>
    );
  }

  const expiry = parseISO(notice.expiresAt);

  const handleDelete = async () => {
    setDeleting(true);
    await deleteNotice(notice.id);
    setDeleting(false);
    onClose();
  };

  return (
    <div className="space-y-5">
      {/* Notice body */}
      <div className="rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-amber-100/40 p-4 shadow-sm dark:border-amber-800/50 dark:from-amber-950/40 dark:to-amber-900/20">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 ring-1 ring-amber-400/40">
            <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-base font-bold text-amber-950 dark:text-amber-100 leading-tight">
              Notice
            </h3>
            {notice.createdAt && (
              <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                Posted {formatDistanceToNow(parseISO(notice.createdAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-amber-900/90 whitespace-pre-wrap dark:text-amber-200/80">
          {notice.content}
        </p>
      </div>

      {/* Expiry */}
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-sm">
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          {isPast(expiry)
            ? 'This notice has expired.'
            : <>Expires <strong>{formatDistanceToNow(expiry, { addSuffix: true })}</strong> &mdash; {format(expiry, 'dd MMM yyyy, h:mm a')}</>}
        </span>
      </div>

      {/* Manager actions */}
      {canManage && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Notice
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Post / Edit form ──────────────────────────────────────────────────────────

function PostEditPanel({
  mode,
  onClose,
}: {
  mode: 'post' | 'edit';
  onClose: () => void;
}) {
  const { notice, postNotice, updateNotice } = useNotice();
  const isEdit = mode === 'edit';

  const [content, setContent] = useState(isEdit && notice ? notice.content : '');
  const [expiryMode, setExpiryMode] = useState<'hours' | 'datetime'>('hours');
  const [selectedPreset, setSelectedPreset] = useState<number>(24);
  const [customHours, setCustomHours] = useState('24');
  const [expiryDatetime, setExpiryDatetime] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minDatetime = format(addHours(new Date(), 0.5), "yyyy-MM-dd'T'HH:mm");

  const computeExpiresAt = (): Date | null => {
    if (expiryMode === 'hours') {
      const hours = selectedPreset === -1 ? parseFloat(customHours) : selectedPreset;
      if (isNaN(hours) || hours <= 0) return null;
      return addHours(new Date(), hours);
    }
    if (!expiryDatetime) return null;
    const dt = parseISO(expiryDatetime);
    if (isPast(dt)) return null;
    return dt;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimContent = content.trim();
    if (!trimContent) { setError('Message is required.'); return; }
    const expiresAt = computeExpiresAt();
    if (!expiresAt) { setError('Please select a valid expiry time.'); return; }

    setWorking(true);
    setError(null);
    try {
      let result;
      if (isEdit && notice) {
        result = await updateNotice(notice.id, trimContent, expiresAt);
      } else {
        result = await postNotice(trimContent, expiresAt);
      }
      if (result) {
        onClose();
      } else {
        setError('Failed to save notice. Please try again.');
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Content */}
      <div className="space-y-1.5">
        <label htmlFor="nd-content" className="text-sm font-semibold">
          Notice Message
        </label>
        <Textarea
          id="nd-content"
          placeholder="Write your notice message here for all mess members…"
          rows={4}
          value={content}
          onChange={(e) => { setContent(e.target.value); setError(null); }}
          disabled={working}
          className="resize-none"
          maxLength={800}
        />
        <p className="text-right text-[11px] text-muted-foreground">{content.length}/800</p>
      </div>

      {/* Expiry section */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Expiry</p>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-secondary/30 p-1">
          {(['hours', 'datetime'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setExpiryMode(m)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                expiryMode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'hours' ? '⏱ Duration' : '📅 Specific Date'}
            </button>
          ))}
        </div>

        {expiryMode === 'hours' ? (
          <div className="space-y-2">
            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => { setSelectedPreset(p.hours); setError(null); }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    selectedPreset === p.hours
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedPreset(-1)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  selectedPreset === -1
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                Custom
              </button>
            </div>
            {/* Custom hours input */}
            {selectedPreset === -1 && (
              <div className="flex items-center gap-2">
                <Input
                  id="nd-duration"
                  type="number"
                  min="0.5"
                  step="0.5"
                  placeholder="24"
                  value={customHours}
                  onChange={(e) => { setCustomHours(e.target.value); setError(null); }}
                  disabled={working}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">hours from now</span>
              </div>
            )}
          </div>
        ) : (
          <Input
            id="nd-expiry"
            type="datetime-local"
            min={minDatetime}
            value={expiryDatetime}
            onChange={(e) => { setExpiryDatetime(e.target.value); setError(null); }}
            disabled={working}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={working}>
          Cancel
        </Button>
        <Button type="submit" className="gap-2" disabled={working}>
          {working
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <SendHorizonal className="h-4 w-4" />}
          {working
            ? isEdit ? 'Saving…' : 'Posting…'
            : isEdit ? 'Save Changes' : 'Post Notice'}
        </Button>
      </div>
    </form>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function NoticeDialog({ mode, open, onOpenChange }: NoticeDialogProps) {
  const [internalMode, setInternalMode] = useState<DialogMode>(mode);

  const titles: Record<DialogMode, string> = {
    read: '📢 Active Notice',
    post: '📝 Post a Notice',
    edit: '✏️ Edit Notice',
  };

  const descs: Record<DialogMode, string> = {
    read: 'This notice is currently visible to all mess members.',
    post: 'Create a new notice for all mess members, coordinators, and managers.',
    edit: 'Update the active notice. Changes will be reflected immediately for all members.',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{titles[internalMode]}</DialogTitle>
          <DialogDescription>{descs[internalMode]}</DialogDescription>
        </DialogHeader>

        {internalMode === 'read' && (
          <ReadPanel
            onEdit={() => setInternalMode('edit')}
            onClose={() => onOpenChange(false)}
          />
        )}
        {(internalMode === 'post' || internalMode === 'edit') && (
          <PostEditPanel
            mode={internalMode}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
