import type { CycleDeposit } from './meal-types';

export type DepositDisplayKind = 'deposit' | 'refund' | 'carry';

export function getDepositDisplayKind(deposit: CycleDeposit): DepositDisplayKind {
  if (deposit.kind === 'carry_forward') return 'carry';
  if (deposit.kind === 'refund' || deposit.kind === 'correction' || deposit.amount < 0) return 'refund';
  return 'deposit';
}
