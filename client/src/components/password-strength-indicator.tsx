import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export function getPasswordStrength(pass: string): { score: number; label: string; color: string } {
  if (!pass) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 8) score += 1;
  if (/[0-9]/.test(pass) && /[a-zA-Z]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;
  if (score <= 1) return { score: 1, label: 'weak' as const, color: 'bg-red-500' };
  if (score <= 3) return { score: 2, label: 'good' as const, color: 'bg-amber-500' };
  return { score: 3, label: 'strong' as const, color: 'bg-emerald-500' };
}

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const { t } = useI18n();
  if (!password) return null;
  const strength = getPasswordStrength(password);
  const labelKey = strength.label === 'weak' ? 'auth.strengthWeak' : strength.label === 'good' ? 'auth.strengthGood' : strength.label === 'strong' ? 'auth.strengthStrong' : '';
  return <div className="space-y-1.5 pt-1">
    <div className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-secondary">
      {[1, 2, 3].map((segment) => <div key={segment} className={cn('h-full transition-all duration-300 rounded-full', strength.score >= segment ? strength.color : 'bg-transparent', strength.score >= segment ? 'w-1/3' : 'w-0')} />)}
    </div>
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{t('auth.strengthLabel')} <strong className="text-foreground">{labelKey ? t(labelKey) : ''}</strong></span>
      <span className={cn(password.length >= 6 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
        {password.length >= 6 ? t('auth.sixPlusChars') : t('auth.atLeastSix')}
      </span>
    </div>
  </div>;
}
