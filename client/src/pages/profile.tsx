import { useEffect, useState, type FormEvent } from 'react';
import {
  Pencil,
  X,
  Save,
  RefreshCw,
  ChefHat,
  User,
  Mail,
  Link2,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Lock,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';
import { RoleBadge } from '@/components/role-badge';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { PasswordStrengthIndicator, getPasswordStrength } from '@/components/password-strength-indicator';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name?: string | null, email?: string | null): string {
  const source = name ?? email ?? '';
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// ─── Mess info types ─────────────────────────────────────────────────────────

type MessInfo = {
  id: string;
  name: string;
};

// ─── UserProfileCard ─────────────────────────────────────────────────────────

function UserProfileCard() {
  const { user, profile, profileLoading, refreshProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [pictureUrl, setPictureUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync local state when profile loads
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setPictureUrl(profile.picture_url ?? '');
    }
  }, [profile]);

  const startEdit = () => {
    setFullName(profile?.full_name ?? '');
    setPictureUrl(profile?.picture_url ?? '');
    setMessage(null);
    setError(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setMessage(null);
    setError(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.id || saving) return;

    const trimName = fullName.trim();
    const trimUrl = pictureUrl.trim();

    if (!trimName) {
      setError('Full name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      // 1. Try RPC function first (recommended & secure)
      const { error: rpcError } = await supabase.rpc('update_user_profile', {
        name_input: trimName,
        picture_url_input: trimUrl || null,
      });

      if (rpcError) {
        // 2. Fallback to direct table update if RPC is not yet created
        const { error: tableError } = await supabase
          .from('profiles')
          .update({
            full_name: trimName,
            picture_url: trimUrl || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (tableError) {
          throw new Error(rpcError.message || tableError.message || 'Unable to update profile');
        }
      }

      setMessage('Profile updated successfully.');
      setIsEditing(false);
      // Fetch the updated profile via context so UI updates immediately
      await refreshProfile();
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setError(err?.message || (typeof err === 'string' ? err : 'Unable to update profile right now.'));
    } finally {
      setSaving(false);
    }
  };

  const initials = getInitials(profile?.full_name, user?.email);

  if (profileLoading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Gradient banner */}
      <div className="h-24 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />

      <CardHeader className="-mt-12 pb-3 pt-0 px-6">
        <div className="flex items-end justify-between gap-4">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="h-20 w-20 ring-4 ring-card shadow-md">
              {profile?.picture_url ? (
                <AvatarImage src={profile.picture_url} alt={profile.full_name ?? 'Avatar'} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                {initials || <User className="h-8 w-8" />}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Edit / Cancel button */}
          {!isEditing ? (
            <Button
              id="profile-edit-btn"
              variant="outline"
              size="sm"
              className="gap-2 mb-1"
              onClick={startEdit}
            >
              <Pencil className="h-4 w-4" />
              Edit Profile
            </Button>
          ) : (
            <Button
              id="profile-cancel-btn"
              variant="ghost"
              size="sm"
              className="gap-2 mb-1 text-muted-foreground"
              onClick={cancelEdit}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        {/* Name + role row */}
        <div className="mt-3 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">{profile?.full_name ?? '—'}</CardTitle>
            {profile ? <RoleBadge role={profile.role} /> : null}
          </div>
          <CardDescription className="flex items-center gap-1.5 text-sm">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            {user?.email ?? '—'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pb-6">
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-full-name" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Name
              </Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setError(null); }}
                placeholder="Enter your name"
                disabled={saving}
              />
            </div>

            {/* Picture URL */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-picture-url" className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Picture URL
              </Label>
              <Input
                id="profile-picture-url"
                value={pictureUrl}
                onChange={(e) => { setPictureUrl(e.target.value); setError(null); }}
                placeholder="https://example.com/avatar.jpg"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Paste a direct image URL. The avatar above will update after saving.
              </p>
            </div>

            {/* Live preview when url entered */}
            {pictureUrl.trim() && (
              <div className="flex items-center gap-3 rounded-lg border bg-secondary/30 p-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={pictureUrl.trim()} alt="Preview" />
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
                <p className="text-sm text-muted-foreground">Preview of your new picture</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button id="profile-save-btn" type="submit" className="gap-2" disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save Profile'}
              </Button>
            </div>

            {message && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        ) : (
          /* Read-only view – info rows */
          <div className="space-y-3 pt-1">
            <InfoRow icon={<User className="h-4 w-4" />} label="Full Name" value={profile?.full_name} />
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user?.email} />
            <InfoRow
              icon={<Link2 className="h-4 w-4" />}
              label="Picture URL"
              value={profile?.picture_url}
              placeholder="No picture URL set"
            />
            {message && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mess Info Card ───────────────────────────────────────────────────────────

function MessInfoCard() {
  const { profile, canManageMess } = useAuth();
  const isManager = profile?.role === 'manager';

  const [mess, setMess] = useState<MessInfo | null>(null);
  const [messLoading, setMessLoading] = useState(true);

  const [isEditing, setIsEditing] = useState(false);
  const [messName, setMessName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load mess data
  useEffect(() => {
    if (!profile?.mess_id) { setMessLoading(false); return; }
    let active = true;

    void supabase
      .from('messes')
      .select('id, name')
      .eq('id', profile.mess_id)
      .maybeSingle()
      .then(({ data, error: fetchErr }) => {
        if (!active) return;
        if (fetchErr) console.error('Error loading mess:', fetchErr);
        setMess(data as MessInfo | null);
        setMessLoading(false);
      });

    return () => { active = false; };
  }, [profile?.mess_id]);

  if (!profile?.mess_id) return null;

  const startEdit = () => {
    setMessName(mess?.name ?? '');
    setMessage(null);
    setError(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setMessage(null);
    setError(null);
  };

  const handleSaveMessName = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageMess || saving) return;
    const trimName = messName.trim();
    if (!trimName) { setError('Mess name is required.'); return; }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { error: rpcErr } = await supabase.rpc('update_mess_settings', { mess_name: trimName });
      if (rpcErr) throw rpcErr;
      setMess((prev) => (prev ? { ...prev, name: trimName } : prev));
      setMessage('Mess name updated successfully.');
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update mess name.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <CardTitle>Mess Information</CardTitle>
          </div>

          {/* Edit / Cancel – only for managers */}
          {isManager && !messLoading && mess && (
            !isEditing ? (
              <Button
                id="mess-edit-btn"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={startEdit}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            ) : (
              <Button
                id="mess-cancel-btn"
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={cancelEdit}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )
          )}
        </div>
        <CardDescription>
          {isManager ? 'Manager-level mess details and administration.' : 'Your mess details.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {messLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : mess ? (
          <>
            {isEditing && isManager ? (
              /* Edit form */
              <form onSubmit={handleSaveMessName} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mess-name" className="flex items-center gap-1.5">
                    <ChefHat className="h-3.5 w-3.5" />
                    Mess Name
                  </Label>
                  <Input
                    id="mess-name"
                    value={messName}
                    onChange={(e) => { setMessName(e.target.value); setError(null); }}
                    placeholder="Enter new mess name"
                    disabled={saving}
                  />
                </div>

                <div className="flex gap-2">
                  <Button id="mess-save-btn" type="submit" className="gap-2" disabled={saving}>
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving…' : 'Save Mess Name'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Read-only name row */
              <InfoRow icon={<ChefHat className="h-4 w-4" />} label="Mess Name" value={mess.name} />
            )}

            {message && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No mess information found.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Security Settings Card ───────────────────────────────────────────────────

function SecuritySettingsCard() {
  const { user } = useAuth();
  const [isChanging, setIsChanging] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(newPassword);

  const startChanging = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setMessage(null);
    setError(null);
    setIsChanging(true);
  };

  const cancelChanging = () => {
    setIsChanging(false);
    setNewPassword('');
    setConfirmPassword('');
    setMessage(null);
    setError(null);
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const trimmedPassword = newPassword.trim();
    if (!trimmedPassword) {
      setError('Please enter a new password.');
      return;
    }

    if (trimmedPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setMessage('Your password has been changed successfully.');
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
      setIsChanging(false);
    } catch (err: any) {
      console.error('Password change failed:', err);
      const errMsg = err?.message || (typeof err === 'string' ? err : 'Failed to update password.');
      setError(errMsg);
      toast.error('Could not update password', { description: errMsg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Account Security</CardTitle>
          </div>

          {!isChanging ? (
            <Button
              id="profile-change-password-btn"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={startChanging}
            >
              <KeyRound className="h-4 w-4" />
              Change Password
            </Button>
          ) : (
            <Button
              id="profile-cancel-password-btn"
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={cancelChanging}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
        <CardDescription>
          Manage your password and protect your MealTrack account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isChanging ? (
          <form onSubmit={handleUpdatePassword} className="space-y-4 pt-1">
            {/* New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-new-password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="profile-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter at least 6 characters"
                  disabled={saving}
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {newPassword.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        strength.score >= 1 ? strength.color : 'bg-transparent',
                        strength.score >= 1 ? 'w-1/3' : 'w-0'
                      )}
                    />
                    <div
                      className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        strength.score >= 2 ? strength.color : 'bg-transparent',
                        strength.score >= 2 ? 'w-1/3' : 'w-0'
                      )}
                    />
                    <div
                      className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        strength.score >= 3 ? strength.color : 'bg-transparent',
                        strength.score >= 3 ? 'w-1/3' : 'w-0'
                      )}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Strength: <strong className="text-foreground">{strength.label}</strong>
                    </span>
                    <span className={cn(newPassword.length >= 6 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                      {newPassword.length >= 6 ? '✓ 6+ characters' : 'At least 6 characters'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-confirm-password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="profile-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Re-enter your new password"
                  disabled={saving}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <p
                  className={cn(
                    'text-xs flex items-center gap-1 mt-1 font-medium',
                    newPassword === confirmPassword
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  )}
                >
                  {newPassword === confirmPassword ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Passwords match
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" /> Passwords do not match
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                id="profile-save-password-btn"
                type="submit"
                className="gap-2"
                disabled={saving || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Updating Password…' : 'Update Password'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={cancelChanging}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>

            {message && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {message}
              </p>
            )}
            {error && (
              <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                {error}
              </p>
            )}
          </form>
        ) : (
          /* Read-only / summary state */
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between rounded-lg border bg-secondary/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Password</p>
                  <p className="mt-0.5 text-sm font-medium tracking-widest text-muted-foreground">••••••••••••</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Protected
              </span>
            </div>

            {message && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {message}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── InfoRow helper ───────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
  placeholder = '—',
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
  placeholder?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-secondary/20 px-4 py-3">
      {icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 truncate text-sm font-medium ${!value ? 'text-muted-foreground' : ''}`}>
          {value || placeholder}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  return (
    <div className="space-y-6 pb-20">
      <header>
        <h1 className="font-heading text-2xl font-bold">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage your personal details, security credentials, and mess information.
        </p>
      </header>

      <UserProfileCard />
      <SecuritySettingsCard />
      <MessInfoCard />
    </div>
  );
}
