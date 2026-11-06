import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const LARGE_DEPOSIT_THRESHOLD = 3000;

export function DepositAmountConfirmation({
  amount,
  mode,
  memberName,
  isSubmitting,
  onEdit,
  onConfirm,
}: {
  amount: number;
  mode: 'add' | 'deduct';
  memberName?: string;
  isSubmitting: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm">
      <div className="flex items-start gap-2.5 text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="text-sm font-semibold">Confirm unusually large amount</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            You are about to {mode === 'deduct' ? 'deduct' : 'record a deposit of'}{' '}
            <strong className="text-foreground">৳{Math.abs(amount).toLocaleString()}</strong>
            {memberName ? ` for ${memberName}` : ''}. Are you sure this amount is correct?
          </p>
        </div>
      </div>
      <div className="flex gap-2 pt-0.5">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onEdit} disabled={isSubmitting}>
          Edit Amount
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 bg-amber-600 font-medium text-white hover:bg-amber-700"
          disabled={isSubmitting}
          onClick={onConfirm}
        >
          {isSubmitting ? 'Saving...' : 'Yes, Confirm'}
        </Button>
      </div>
    </div>
  );
}
