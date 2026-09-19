import { cn } from '@/lib/utils';

export function getPasswordStrength(pass: string): { score: number; label: string; color: string } {
  if (!pass) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 8) score += 1;
  if (/[0-9]/.test(pass) && /[a-zA-Z]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;
  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
  if (score <= 3) return { score: 2, label: 'Good', color: 'bg-amber-500' };
  return { score: 3, label: 'Strong', color: 'bg-emerald-500' };
}

export function PasswordStrengthIndicator({ password }: { password: string }) {
  if (!password) return null;
  const strength = getPasswordStrength(password);
  return <div className="space-y-1.5 pt-1">
    <div className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-secondary">
      {[1, 2, 3].map((segment) => <div key={segment} className={cn('h-full transition-all duration-300 rounded-full', strength.score >= segment ? strength.color : 'bg-transparent', strength.score >= segment ? 'w-1/3' : 'w-0')} />)}
    </div>
    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
      <span>Strength: <strong className="text-foreground">{strength.label}</strong></span>
      <span className={cn(password.length >= 6 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
        {password.length >= 6 ? '✓ 6+ characters' : 'At least 6 characters'}
      </span>
    </div>
  </div>;
}
