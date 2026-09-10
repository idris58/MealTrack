import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  Archive,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Megaphone,
  Pencil,
  Play,
  RefreshCcw,
  Settings2,
  Share2,
  ShoppingBag,
  Trash2,
  Users,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { addHours, format, formatDistanceToNow, isPast, parseISO } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth-context';
import { useMeal } from '@/lib/meal-context';
import { usePushNotifications } from '@/lib/push-notifications';
import { getNotificationPreferences, saveNotificationPreferences } from '@/lib/notification-preferences';
import { useNotice } from '@/lib/notice-context';
import { NoticeDialog } from '@/components/notice-dialog';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type ShareLinkConfig = {
  token: string;
  is_enabled: boolean;
};

type ActiveNotice = {
  id: string;
  title: string;
  content: string;
  expires_at: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const SHARE_TOKEN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SHARE_TOKEN_LENGTH = 6;

function createShareToken() {
  const randomValues = new Uint8Array(SHARE_TOKEN_LENGTH);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => SHARE_TOKEN_ALPHABET[value % SHARE_TOKEN_ALPHABET.length]).join('');
}

function formatCurrency(amount: number) {
  return `৳${amount.toFixed(0)}`;
}

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

// ── Section Navigation ───────────────────────────────────────────────────────

function SettingsNavigation({ canManageCycles }: { canManageCycles: boolean }) {
  const items = [
    ...(canManageCycles ? [{ href: '#cycle-operations', icon: RefreshCcw, label: 'Cycle' }] : []),
    { href: '#public-access', icon: Share2, label: 'Sharing' },
    { href: '#notice-board', icon: Megaphone, label: 'Notices' },
    { href: '#notifications', icon: BellRing, label: 'Alerts' },
  ];

  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-2">
        {items.map(({ href, icon: Icon, label }) => (
          <a key={href} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon className="h-4 w-4 text-primary" />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ── Cycle Management Card ─────────────────────────────────────────────────────

function CycleManagementCard() {
  const {
    activeCycle, pendingCycle, stats, members,
    closeActiveCycle, renameActiveCycle, startNewCycle, suggestCycleName,
    getCycleDetails, loadCycleDetails,
  } = useMeal();
  const { canManageCycles } = useAuth();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeStep, setCloseStep] = useState<1 | 2>(1);
  const [isClosing, setIsClosing] = useState(false);

  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [cycleName, setCycleName] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // carry-forward: keyed by memberId, true = selected (default), false = deselected
  const [carryForwards, setCarryForwards] = useState<Record<string, boolean>>({});

  const startRename = () => {
    setRenameValue(activeCycle?.name ?? '');
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const cancelRename = () => { setIsRenaming(false); setRenameValue(''); };

  const saveRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === activeCycle?.name) { cancelRename(); return; }
    setIsSavingName(true);
    try { await renameActiveCycle(renameValue.trim()); setIsRenaming(false); }
    finally { setIsSavingName(false); }
  };

  const handleCloseConfirm = async () => {
    setIsClosing(true);
    try { await closeActiveCycle(); setCloseDialogOpen(false); setCloseStep(1); }
    finally { setIsClosing(false); }
  };

  const handleOpenStart = () => {
    setCycleName(suggestCycleName(new Date()));
    setStartDate(new Date()); setStartError(null);
    // Pre-load pending cycle details so member balances are available for carry-forward
    if (pendingCycle) {
      void loadCycleDetails(pendingCycle.id);
    }
    // Default all eligible members to checked
    const pendingDetails = pendingCycle ? getCycleDetails(pendingCycle.id) : null;
    const defaults: Record<string, boolean> = {};
    if (pendingDetails) {
      for (const m of pendingDetails.members) {
        if (m.balance > 0) defaults[m.id] = true;
      }
    }
    setCarryForwards(defaults);
    setStartDialogOpen(true);
  };

  const handleStart = async () => {
    if (!cycleName.trim()) { setStartError('Cycle name is required.'); return; }
    setIsStarting(true); setStartError(null);
    try {
      // Build the carry-forward list from selected members with a positive balance
      const pendingDetails = pendingCycle ? getCycleDetails(pendingCycle.id) : null;
      const selectedCarryForwards = pendingDetails
        ? pendingDetails.members
            .filter((m) => m.balance > 0 && carryForwards[m.id] !== false)
            .map((m) => ({ memberId: m.id, amount: Math.round(m.balance * 100) / 100 }))
        : [];
      await startNewCycle(cycleName.trim(), startDate.toISOString(), selectedCarryForwards.length > 0 ? selectedCarryForwards : undefined);
      setStartDialogOpen(false);
    }
    catch (err) { setStartError(err instanceof Error ? err.message : 'Failed to start cycle.'); }
    finally { setIsStarting(false); }
  };

  const startedAt = activeCycle ? new Date(activeCycle.startedAt) : null;
  const durationLabel = startedAt ? formatDistanceToNow(startedAt, { addSuffix: false }) : null;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b bg-gradient-to-r from-emerald-500/[0.07] to-transparent p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Operations</p>
            <CardTitle className="mt-0.5 text-lg font-bold font-heading">Cycle Operations</CardTitle>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">Keep the current meal cycle organised and ready for settlement.</p>
          </div>
          <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <RefreshCcw className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6 space-y-4">
        {activeCycle ? (
          <div className="overflow-hidden rounded-xl border bg-emerald-500/5">
            {/* Status bar */}
            <div className="flex items-center justify-between gap-3 border-b bg-emerald-500/5 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Active Cycle</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {durationLabel} · Started {startedAt ? format(startedAt, 'MMM d') : '—'}
              </div>
            </div>
            {/* Name + rename */}
            <div className="flex items-center gap-3 px-4 py-3">
              {isRenaming ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input ref={renameInputRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); if (e.key === 'Escape') cancelRename(); }} className="h-8 text-sm font-semibold" disabled={isSavingName} />
                  <Button size="sm" className="h-8 shrink-0" onClick={() => void saveRename()} disabled={isSavingName}>
                    {isSavingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={cancelRename} disabled={isSavingName}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <p className="truncate text-base font-bold">{activeCycle.name}</p>
                  {canManageCycles && (
                    <button type="button" onClick={startRename} className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Rename cycle">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Metrics strip */}
            <div className="grid grid-cols-4 gap-px border-t bg-border">
              {[
                { icon: Users, value: members.length, label: 'Members' },
                { icon: Utensils, value: formatMealCount(stats.totalMealsConsumed), label: 'Meals' },
                { icon: ShoppingBag, value: formatCurrency(stats.totalMealExpenses + stats.totalFixedExpenses), label: 'Expenses' },
                { icon: Wallet, value: formatCurrency(stats.remainingCash), label: 'Cash' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="flex flex-col items-center gap-0.5 bg-card px-2 py-2.5 text-center">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
                  <span className="text-sm font-bold leading-none">{value}</span>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            {/* Pending warning */}
            {pendingCycle && (
              <div className="flex items-center gap-2 border-t bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Pending settlement —{' '}
                <a href="/app/history" className="font-semibold underline underline-offset-2">go to History to finalize</a>
              </div>
            )}
            {/* Actions */}
            {canManageCycles && (
              <div className="border-t px-4 py-3">
                <Button
                  variant="outline" size="sm"
                  className="gap-2 border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  disabled={!!pendingCycle}
                  title={pendingCycle ? 'Finish the pending settlement before closing this cycle' : undefined}
                  onClick={() => { setCloseStep(1); setCloseDialogOpen(true); }}
                >
                  <Archive className="h-4 w-4" />Close Cycle
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Play className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No Active Cycle</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingCycle ? 'A cycle is in pending settlement. Start a new one when ready.' : 'Start a new cycle to begin tracking meals, expenses, and deposits.'}
            </p>
            {pendingCycle && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Settle pending cycle balances in{' '}
                  <a href="/app/history" className="font-semibold underline underline-offset-2">History</a>{' '}
                  first for clean accounts.
                </span>
              </div>
            )}
            {canManageCycles && (
              <Button className="mt-4 gap-2" onClick={handleOpenStart}>
                <Play className="h-4 w-4" />Start New Cycle
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* Close Cycle Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={(open) => { setCloseDialogOpen(open); if (!open) setCloseStep(1); }}>
        <DialogContent className="max-w-md w-[95%]">
          {closeStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Archive className="h-5 w-5 text-amber-500" />Close Current Cycle</DialogTitle>
                <DialogDescription>Review the cycle summary before closing.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
                  <p className="text-sm font-semibold">{activeCycle?.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Members', value: members.length },
                      { label: 'Total Meals', value: formatMealCount(stats.totalMealsConsumed) },
                      { label: 'Total Expenses', value: formatCurrency(stats.totalMealExpenses + stats.totalFixedExpenses) },
                      { label: 'Remaining Cash', value: formatCurrency(stats.remainingCash) },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg bg-card p-2.5 border">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-bold">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <p className="font-semibold">What happens when you close?</p>
                  <ul className="mt-1.5 list-disc list-inside space-y-1 text-xs text-amber-700 dark:text-amber-400">
                    <li>This cycle moves to <strong>Pending Settlement</strong> in History</li>
                    <li>No new cycle starts automatically</li>
                    <li>You can still add corrections in History</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
                <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400" onClick={() => setCloseStep(2)}>Continue</Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-5 w-5" />Confirm Close Cycle</DialogTitle>
                <DialogDescription>This action cannot be undone. The cycle will enter pending settlement.</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-2">Are you sure you want to close <strong>"{activeCycle?.name}"</strong>? No new cycle will start automatically.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setCloseStep(1)} disabled={isClosing}>Back</Button>
                <Button variant="destructive" className="gap-2" onClick={() => void handleCloseConfirm()} disabled={isClosing}>
                  {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                  {isClosing ? 'Closing…' : 'Yes, Close Cycle'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Start New Cycle Dialog */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent className="max-w-md w-[95%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Play className="h-5 w-5 text-emerald-500" />Start New Cycle</DialogTitle>
            <DialogDescription>Name your new cycle and choose a start date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cycle Name</label>
              <Input id="settings-new-cycle-name" value={cycleName} onChange={(e) => { setCycleName(e.target.value); setStartError(null); }} placeholder="e.g. Meal_Sep-26" onKeyDown={(e) => { if (e.key === 'Enter') void handleStart(); }} autoFocus />
              <p className="text-xs text-muted-foreground">A descriptive name helps identify this cycle in history later.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />{format(startDate, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto rounded-xl p-0 shadow-xl" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus className="p-3" />
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Carry-Forward Section (only when pending cycle has eligible members) ── */}
            {(() => {
              const pendingDetails = pendingCycle ? getCycleDetails(pendingCycle.id) : null;
              const eligibleMembers = pendingDetails?.members.filter((m) => m.balance > 0) ?? [];
              if (eligibleMembers.length === 0) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    <label className="text-sm font-medium">Carry-Forward Balances</label>
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Optional</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    These members have a surplus in <strong>{pendingCycle?.name}</strong>. Their balance will be zeroed in the pending cycle and added as an opening deposit in this new cycle.
                  </p>
                  <div className="rounded-xl border bg-emerald-500/5 divide-y overflow-hidden">
                    {eligibleMembers.map((m) => {
                      const checked = carryForwards[m.id] !== false;
                      return (
                        <label
                          key={m.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors select-none',
                            checked ? 'bg-emerald-500/5' : 'opacity-60',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(val) =>
                              setCarryForwards((prev) => ({ ...prev, [m.id]: Boolean(val) }))
                            }
                            className="shrink-0"
                          />
                          <Avatar className="h-7 w-7 shrink-0 text-xs">
                            <AvatarFallback className="bg-primary/10 text-primary">{m.avatar}</AvatarFallback>
                          </Avatar>
                          <span className="flex-1 text-sm font-medium truncate">{m.name}</span>
                          <span className="shrink-0 text-sm font-bold text-emerald-600">
                            +{formatCurrency(m.balance)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Unchecked members keep their surplus in the pending cycle and must be settled manually.
                  </p>
                </div>
              );
            })()}

            {startError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">{startError}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setStartDialogOpen(false)} disabled={isStarting}>Cancel</Button>
            <Button className="gap-2" onClick={() => void handleStart()} disabled={isStarting}>
              {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isStarting ? 'Starting…' : 'Start Cycle'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Share Settings Card ───────────────────────────────────────────────────────

function ShareSettingsCard() {
  const { user, profile } = useAuth();
  const [config, setConfig] = useState<ShareLinkConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const loadConfig = async () => {
      try {
        setLoading(true); setError(null);
        let query = supabase.from('share_links').select('token, is_enabled');
        if (profile?.mess_id) query = query.eq('mess_id', profile.mess_id);
        else query = query.eq('user_id', user.id);
        const { data, error: fetchError } = await query.maybeSingle();
        if (fetchError) throw fetchError;
        if (active) setConfig(data ? { token: data.token, is_enabled: data.is_enabled } : null);
      } catch (caughtError) {
        if (!active) return;
        console.error('Error loading share link config:', caughtError);
        setError('Unable to load share settings. Run the share_links SQL setup first if needed.');
      } finally { if (active) setLoading(false); }
    };
    void loadConfig();
    return () => { active = false; };
  }, [user?.id]);

  const shareUrl = config?.token ? `${window.location.origin}/shared/${config.token}` : '';
  const mealCode = config?.token ?? '';

  const upsertConfig = async (nextConfig: ShareLinkConfig) => {
    if (!user?.id || working) return null;
    setWorking(true); setError(null); setMessage(null);
    try {
      const payload: Record<string, any> = { user_id: user.id, profile_id: user.id, token: nextConfig.token, is_enabled: nextConfig.is_enabled, updated_at: new Date().toISOString() };
      if (profile?.mess_id) payload.mess_id = profile.mess_id;
      const { data, error: upsertError } = await supabase.from('share_links').upsert(payload, { onConflict: 'user_id' }).select('token, is_enabled').single();
      if (upsertError) throw upsertError;
      setConfig({ token: data.token, is_enabled: data.is_enabled }); return data;
    } catch (caughtError: any) {
      console.error('Error saving share config:', caughtError);
      setError(caughtError?.message || 'Unable to update the share link right now.'); return null;
    } finally { setWorking(false); }
  };

  const handleEnableSharing = async () => { const saved = await upsertConfig({ token: config?.token ?? createShareToken(), is_enabled: true }); if (saved) setMessage('Sharing is enabled. You can now copy the public view link.'); };
  const handleDisableSharing = async () => { if (!config) return; const saved = await upsertConfig({ token: config.token, is_enabled: false }); if (saved) setMessage('Sharing is disabled. The old link will no longer work.'); };
  const handleRegenerate = async () => { const saved = await upsertConfig({ token: createShareToken(), is_enabled: true }); if (saved) setMessage('A new share link was generated. The previous link is now invalid.'); };
  const handleCopy = async () => {
    if (!shareUrl || !config?.is_enabled) return;
    try { await navigator.clipboard.writeText(shareUrl); setMessage('Shared link copied to clipboard.'); setError(null); }
    catch { setError('Unable to copy the link. Copy it manually from the field below.'); }
  };
  const handleCopyMealCode = async () => {
    if (!mealCode || !config?.is_enabled) return;
    try { await navigator.clipboard.writeText(mealCode); setMessage('Meal Code copied to clipboard.'); setError(null); }
    catch { setError('Unable to copy the Meal Code right now. Copy it manually from the field below.'); }
  };

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b bg-gradient-to-r from-sky-500/[0.07] to-transparent p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">Access</p>
            <CardTitle className="mt-0.5 text-lg font-bold font-heading">Public Sharing</CardTitle>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">Control your read-only shared view link and meal code.</p>
          </div>
          <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
            <Share2 className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between rounded-xl border bg-secondary/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Sharing status</p>
            {loading ? <Skeleton className="mt-1 h-3.5 w-16" /> : (
              <p className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', config?.is_enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                {config?.is_enabled ? '● Enabled' : '○ Disabled'}
              </p>
            )}
          </div>
          <Button variant={config?.is_enabled ? 'outline' : 'default'} size="sm" onClick={config?.is_enabled ? handleDisableSharing : handleEnableSharing} disabled={loading || working}>
            {config?.is_enabled ? 'Disable' : 'Enable Share'}
          </Button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public Link</label>
          <div className="flex gap-2">
            <Input value={shareUrl} readOnly placeholder="Enable sharing to generate a public link" className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={handleCopy} disabled={!config?.is_enabled || !shareUrl} title="Copy link"><Copy className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meal Code</label>
          <div className="flex gap-2">
            <Input value={mealCode} readOnly placeholder="Enable sharing to generate a Meal Code" className="font-mono text-sm font-bold tracking-widest" />
            <Button type="button" variant="outline" size="sm" onClick={handleCopyMealCode} disabled={!config?.is_enabled || !mealCode}>Copy Code</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {config?.is_enabled && shareUrl ? (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open Shared View</a>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled><ExternalLink className="h-3.5 w-3.5" />Open Shared View</Button>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleRegenerate} disabled={loading || working}><RefreshCcw className="h-3.5 w-3.5" />Regenerate Link</Button>
        </div>
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">{message}</p>}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ── Notification Settings Card ────────────────────────────────────────────────

function NotificationSettingsCard() {
  const { supported, status, hasSubscription, working, error, message, subscribe, unsubscribe } = usePushNotifications({ mode: 'main' });
  const [reminderTime, setReminderTime] = useState('22:00');
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getNotificationPreferences().then((preferences) => {
      if (!active) return;
      setReminderTime(preferences.reminderTime || '22:00');
    }).catch((loadError) => { if (active) setPreferencesError(loadError instanceof Error ? loadError.message : 'Unable to load reminder preferences.'); })
      .finally(() => { if (active) setPreferencesLoading(false); });
    return () => { active = false; };
  }, []);
  const savePreferences = async () => {
    setPreferencesSaving(true); setPreferencesMessage(null); setPreferencesError(null);
    try { const saved = await saveNotificationPreferences({ reminderTime }); setReminderTime(saved.reminderTime); setPreferencesMessage('Reminder time saved.'); }
    catch (saveError) { setPreferencesError(saveError instanceof Error ? saveError.message : 'Unable to save reminder preferences.'); }
    finally { setPreferencesSaving(false); }
  };
  const nextRun = (() => { try { const [hour, minute] = reminderTime.split(':').map(Number); const now = new Date(); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); const values = new Map(parts.map((part) => [part.type, part.value])); const currentTime = `${values.get('hour')}:${values.get('minute')}`; const today = `${values.get('year')}-${values.get('month')}-${values.get('day')}`; return `${currentTime >= reminderTime ? 'Tomorrow' : 'Today'}, ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (Dhaka time)${today ? '' : ''}`; } catch { return 'the next scheduled time'; } })();
  const handleToggle = (checked: boolean) => { if (checked) { void subscribe(); return; } void unsubscribe(); };

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="border-b bg-gradient-to-r from-violet-500/[0.07] to-transparent p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">Reminders</p>
            <CardTitle className="mt-0.5 text-lg font-bold font-heading">Push Notifications</CardTitle>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">Set up browser alerts for daily meal logs.</p>
          </div>
          <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
            <BellRing className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="rounded-xl border bg-background/70 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium">Meal log reminders</p><p className="text-xs text-muted-foreground">Get an alert when today&apos;s active-cycle meal log has not been saved.</p></div><Switch checked={hasSubscription} disabled={!supported || working || status === 'denied'} onCheckedChange={handleToggle} aria-label="Toggle meal log reminders" /></div>
          <label className="block space-y-1 text-xs font-medium">Reminder time <span className="font-normal text-muted-foreground">(Dhaka time)</span><input type="time" value={reminderTime} disabled={!hasSubscription || preferencesLoading || preferencesSaving} onChange={(event) => setReminderTime(event.target.value)} className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" /></label>
          <p className="text-xs text-muted-foreground">Next reminder: {hasSubscription ? nextRun : 'Enable reminders to choose a time.'}</p>
          <Button type="button" size="sm" onClick={() => void savePreferences()} disabled={!hasSubscription || preferencesLoading || preferencesSaving}>{preferencesSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save time</Button>
          {!supported ? <p className="text-xs text-muted-foreground">This browser does not support Web Push notifications.</p> : status === 'denied' ? <p className="text-xs text-red-600 dark:text-red-400">Notifications are blocked. Allow them from your browser settings to enable reminders.</p> : null}
          {preferencesMessage && <p className="text-xs text-emerald-600">{preferencesMessage}</p>}
          {preferencesError && <p className="text-xs text-red-600">{preferencesError}</p>}
        </div>
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">{message}</p>}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ── Notice Settings Card ──────────────────────────────────────────────────────

function NoticeSettingsCard() {
  const { notice, loading, deleteNotice } = useNotice();
  const [showPost, setShowPost] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!notice || deleting) return;
    setDeleting(true);
    const ok = await deleteNotice(notice.id);
    setDeleting(false);
    if (ok) setMessage('Notice removed successfully.');
  };

  return (
    <>
      <Card className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader className="border-b bg-gradient-to-r from-amber-500/[0.07] to-transparent p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">Communication</p>
              <CardTitle className="mt-0.5 text-lg font-bold font-heading">Notice Board</CardTitle>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Publish a time-limited announcement for all mess members, coordinators and managers.
              </p>
            </div>
            <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <Megaphone className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="space-y-2 rounded-xl border bg-secondary/20 p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {/* Active notice preview */}
          {!loading && notice && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Active Notice</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-400"
                    onClick={() => setShowEdit(true)}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Remove
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground whitespace-pre-wrap break-words line-clamp-3">{notice.content}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Expires {formatDistanceToNow(parseISO(notice.expiresAt), { addSuffix: true })}
                  {' '}({format(parseISO(notice.expiresAt), 'dd MMM yyyy, hh:mm a')})
                </p>
              </div>
            </div>
          )}

          {/* Post new notice CTA */}
          {!loading && (
            <Button
              type="button"
              className="gap-2 w-full sm:w-auto"
              onClick={() => setShowPost(true)}
            >
              <Megaphone className="h-4 w-4" />
              {notice ? 'Post New Notice (replaces active)' : 'Post a Notice'}
            </Button>
          )}

          {message && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      {showPost && <NoticeDialog mode="post" open={showPost} onOpenChange={setShowPost} />}
      {showEdit && <NoticeDialog mode="edit" open={showEdit} onOpenChange={setShowEdit} />}
    </>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { profile, canManageCycles } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (profile?.role === 'member') setLocation('/app');
  }, [profile?.role, setLocation]);

  if (profile?.role === 'member') return null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16 sm:space-y-10 sm:pb-20">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Settings2 className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">Settings</h1>
              <p className="hidden sm:block mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Manage your cycle, shared view, notices, and reminders from one place.</p>
            </div>
          </div>
        </div>
      </header>

      <SettingsNavigation canManageCycles={canManageCycles} />

      {canManageCycles && (
        <section id="cycle-operations" className="scroll-mt-6">
          <CycleManagementCard />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
        <section id="public-access" className="scroll-mt-6">
          <ShareSettingsCard />
        </section>

        <section id="notifications" className="scroll-mt-6">
          <NotificationSettingsCard />
        </section>
      </div>

      <section id="notice-board" className="scroll-mt-6">
        <NoticeSettingsCard />
      </section>
    </div>
  );
}
