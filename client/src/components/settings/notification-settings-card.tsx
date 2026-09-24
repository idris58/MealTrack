import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  HelpCircle,
  Loader2,
  RefreshCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePushNotifications } from '@/lib/push-notifications';
import { getNotificationPreferences, saveNotificationPreferences } from '@/lib/notification-preferences';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export function NotificationSettingsCard() {
  const { profile } = useAuth();
  const canManageMealReminders = profile?.role === 'manager' || profile?.role === 'coordinator';
  const { supported, permission, hasSubscription, working, error, message, subscribe, refreshSubscriptionState } = usePushNotifications({ mode: 'main' });
  const [reminderTime, setReminderTime] = useState('22:00');
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [noticesEnabled, setNoticesEnabled] = useState(true);
  const [mealRemindersEnabled, setMealRemindersEnabled] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [showUnblockDialog, setShowUnblockDialog] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(false);

  useEffect(() => {
    let active = true;
    void getNotificationPreferences().then((preferences) => {
      if (!active) return;
      setReminderTime(preferences.reminderTime || '22:00');
      setGlobalEnabled(preferences.global !== false);
      setNoticesEnabled(preferences.categories?.notices !== false);
      setMealRemindersEnabled(preferences.categories?.mealReminders !== false);
    }).catch((loadError) => {
      if (active) setPreferencesError(loadError instanceof Error ? loadError.message : 'Unable to load reminder preferences.');
    }).finally(() => {
      if (active) setPreferencesLoading(false);
    });
    return () => { active = false; };
  }, []);

  const savePreferences = async (patch: Parameters<typeof saveNotificationPreferences>[0], successMessage = 'Notification preferences saved.') => {
    setPreferencesSaving(true);
    setPreferencesMessage(null);
    setPreferencesError(null);
    try {
      const saved = await saveNotificationPreferences(patch);
      setReminderTime(saved.reminderTime || reminderTime);
      if (saved.global !== undefined) setGlobalEnabled(saved.global !== false);
      if (saved.categories?.notices !== undefined) setNoticesEnabled(saved.categories.notices !== false);
      if (saved.categories?.mealReminders !== undefined) setMealRemindersEnabled(saved.categories.mealReminders !== false);
      setPreferencesMessage(successMessage);
    } catch (saveError) {
      setPreferencesError(saveError instanceof Error ? saveError.message : 'Unable to save reminder preferences.');
    } finally {
      setPreferencesSaving(false);
    }
  };

  const handleCheckPermission = async () => {
    setCheckingPermission(true);
    try {
      await refreshSubscriptionState();
      if (Notification.permission === 'granted') {
        await subscribe();
        setShowUnblockDialog(false);
      }
    } finally {
      setCheckingPermission(false);
    }
  };

  const nextRun = (() => {
    try {
      const [hour, minute] = reminderTime.split(':').map(Number);
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      const values = new Map(parts.map((part) => [part.type, part.value]));
      const currentTime = `${values.get('hour')}:${values.get('minute')}`;
      return `${currentTime >= reminderTime ? 'Tomorrow' : 'Today'}, ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (Dhaka time)`;
    } catch {
      return 'the next scheduled time';
    }
  })();

  const handlePreferenceToggle = (key: 'global' | 'notices' | 'mealReminders', checked: boolean) => {
    if (key === 'global') setGlobalEnabled(checked);
    if (key === 'notices') setNoticesEnabled(checked);
    if (key === 'mealReminders') setMealRemindersEnabled(checked);
    const patch = key === 'global' ? { global: checked } : { categories: { [key]: checked } };
    void savePreferences(patch, 'Notification preference saved.');
  };

  const isBlocked = permission === 'denied';

  return (
    <>
      <Card className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader className="border-b bg-gradient-to-r from-violet-500/[0.07] to-transparent p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">Reminders</p>
              <CardTitle className="mt-0.5 text-lg font-bold font-heading">Push Notifications</CardTitle>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">Manage your notification categories and reminder schedule.</p>
            </div>
            <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
              <BellRing className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 space-y-4">
          {/* Blocked permission banner */}
          {isBlocked ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">Notifications blocked by browser</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    This browser has blocked notifications. Change permission in your browser settings to get notifications.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-medium gap-1.5 border-amber-500/30 hover:bg-amber-500/10"
                  onClick={() => setShowUnblockDialog(true)}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  How to allow
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs font-medium gap-1.5"
                  disabled={checkingPermission}
                  onClick={() => void handleCheckPermission()}
                >
                  {checkingPermission ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                  Check permission
                </Button>
              </div>
            </div>
          ) : !supported ? (
            <div className="rounded-xl border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
              This browser does not support Web Push notifications.
            </div>
          ) : null}

          <div className={cn('rounded-xl border bg-background/70 p-4 space-y-3 transition-opacity', isBlocked && 'opacity-50 pointer-events-none select-none')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-xs text-muted-foreground">Master switch for all logged-in push notifications.</p>
              </div>
              <Switch
                checked={globalEnabled}
                disabled={isBlocked || preferencesLoading || preferencesSaving}
                onCheckedChange={(checked) => handlePreferenceToggle('global', checked)}
                aria-label="Toggle all notifications"
              />
            </div>
            <div className={cn('space-y-3 border-t pt-3', (!globalEnabled || isBlocked) && 'opacity-60')}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Notice notifications</p>
                  <p className="text-xs text-muted-foreground">Receive alerts when a new mess notice is posted.</p>
                </div>
                <Switch
                  checked={noticesEnabled}
                  disabled={isBlocked || !globalEnabled || preferencesLoading || preferencesSaving}
                  onCheckedChange={(checked) => handlePreferenceToggle('notices', checked)}
                  aria-label="Toggle notice notifications"
                />
              </div>
              {canManageMealReminders && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Meal-log reminders</p>
                      <p className="text-xs text-muted-foreground">Get an alert when today&apos;s active-cycle meal log has not been saved.</p>
                    </div>
                    <Switch
                      checked={mealRemindersEnabled}
                      disabled={isBlocked || !globalEnabled || preferencesLoading || preferencesSaving}
                      onCheckedChange={(checked) => handlePreferenceToggle('mealReminders', checked)}
                      aria-label="Toggle meal log reminders"
                    />
                  </div>
                  <label className="block space-y-1 text-xs font-medium">
                    Reminder time <span className="font-normal text-muted-foreground">(Dhaka time)</span>
                    <input
                      type="time"
                      value={reminderTime}
                      disabled={isBlocked || !globalEnabled || !mealRemindersEnabled || preferencesLoading || preferencesSaving}
                      onChange={(event) => setReminderTime(event.target.value)}
                      className="mt-1 flex h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Next reminder: {!isBlocked && globalEnabled && mealRemindersEnabled ? nextRun : isBlocked ? 'Notifications blocked by browser.' : 'Enable meal reminders to schedule.'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void savePreferences({ reminderTime }, 'Reminder time saved.')}
                    disabled={isBlocked || preferencesLoading || preferencesSaving}
                  >
                    {preferencesSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save time
                  </Button>
                </>
              )}
            </div>

            {preferencesMessage && <p className="text-xs text-emerald-600">{preferencesMessage}</p>}
            {preferencesError && <p className="text-xs text-red-600">{preferencesError}</p>}
          </div>

          {message && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── How to Unblock Dialog ── */}
      <Dialog open={showUnblockDialog} onOpenChange={setShowUnblockDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <BellRing className="h-4 w-4 text-primary" />
              How to Allow Notifications
            </DialogTitle>
            <DialogDescription className="text-xs">
              Browser security prevents websites from asking for permission once blocked. Follow these steps to allow:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1 text-xs">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                Desktop (Chrome / Edge / Brave / Firefox)
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Click the <strong>Tune / Lock icon</strong> next to the URL in your address bar.</li>
                <li>Find <strong>Notifications</strong> and change it to <strong>Allow</strong>.</li>
                <li>Click <strong>Check permission</strong> below.</li>
              </ol>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                Mobile (Android Chrome / Safari iOS)
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Tap the <strong>Page Info / Lock icon</strong> in your browser address bar.</li>
                <li>Tap <strong>Permissions</strong> &rarr; <strong>Notifications</strong> &rarr; <strong>Allow</strong>.</li>
                <li>Return here and tap <strong>Check permission</strong>.</li>
              </ol>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              disabled={checkingPermission}
              onClick={() => void handleCheckPermission()}
            >
              {checkingPermission ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
              Check permission
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
