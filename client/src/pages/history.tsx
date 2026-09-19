import React, { useEffect, useMemo, useState } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { eachDayOfInterval, format, max, min, parseISO, startOfDay } from 'date-fns';
import { Archive, Check, ChevronDown, History, Lock, Pencil, Plus, ScrollText, ShoppingBag, Trash2, Utensils, Wallet, Zap, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';

import { useMeal, type Cycle, type CycleDetails, type Expense } from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { MealLogTable } from '@/components/meal-log-table';
import { UndoDeleteGhost } from '@/components/undo-delete-ghost';
import { MealCountEditor } from '@/components/meal-count-editor';

function formatCurrency(amount: number) {
  return `৳${amount.toFixed(2)}`;
}

function formatBalance(amount: number) {
  return `${amount >= 0 ? '+' : '-'}${Math.round(Math.abs(amount))}`;
}

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

const DELETE_GRACE_MS = 10 * 1000;

type DeletedExpenseGhost = {
  expense: Expense;
  allIndex: number;
  typeIndex: number;
  expiresAt: number;
};

type DeletedCycleGhost = {
  details: CycleDetails;
  index: number;
  expiresAt: number;
};
function SettlementForm({
  cycleId,
  memberId,
  memberName,
  currentBalance,
  onClose,
}: {
  cycleId: string;
  memberId: string;
  memberName: string;
  currentBalance: number;
  onClose: () => void;
}) {
  const { addDeposit } = useMeal();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fillExactAmount = () => {
    setAmount(String(-currentBalance));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed === 0) return;
    setIsSubmitting(true);

    try {
      await addDeposit(memberId, parsed, cycleId, note || undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-4">
      <div className="rounded-lg bg-secondary/30 p-3.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-medium">Current Balance</span>
          <span className={cn('text-lg font-bold', currentBalance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
            {formatBalance(currentBalance)}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          {currentBalance < 0
            ? `${memberName} owes the manager ${formatCurrency(Math.abs(currentBalance))}.`
            : currentBalance > 0
            ? `The manager owes ${memberName} ${formatCurrency(Math.abs(currentBalance))}.`
            : `${memberName} is fully settled.`}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Installment Amount</label>
          {currentBalance !== 0 && (
            <button
              type="button"
              onClick={fillExactAmount}
              className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
            >
              Fill Full Amount
            </button>
          )}
        </div>
        <Input type="number" step="0.01" placeholder="e.g. 300 or -300" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus disabled={isSubmitting} />
        <p className="text-[11px] text-muted-foreground">
          Enter a positive number if the member pays you. Enter a negative number if you refund the member.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Note (Optional)</label>
        <Input placeholder="e.g. 1st installment" value={note} onChange={(event) => setNote(event.target.value)} disabled={isSubmitting} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting || !amount}>
        {isSubmitting ? 'Saving...' : 'Save Installment'}
      </Button>
    </form>
  );
}

function PendingExpenseEditor({
  cycleId,
  expense,
  onClose,
  onDeleted,
}: {
  cycleId: string;
  expense?: Expense | null;
  onClose: () => void;
  onDeleted?: (expense: Expense) => void;
}) {
  const { addExpense, updateExpense, deleteExpense } = useMeal();
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [type, setType] = useState<'meal' | 'fixed'>(expense?.type ?? 'meal');
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? '');
  const [date, setDate] = useState<Date>(expense ? new Date(expense.date) : new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setDescription(expense?.description ?? '');
    setAmount(expense ? String(expense.amount) : '');
    setType(expense?.type ?? 'meal');
    setPaidBy(expense?.paidBy ?? '');
    setDate(expense ? new Date(expense.date) : new Date());
  }, [expense]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const parsedAmount = parseFloat(amount);
    if (!description.trim() || !paidBy.trim() || isNaN(parsedAmount) || parsedAmount === 0) return;
    setIsSubmitting(true);

    try {
      if (expense) {
        await updateExpense(expense.id, {
          description: description.trim(),
          amount: parsedAmount,
          type,
          paidBy: paidBy.trim(),
          date: format(date, 'yyyy-MM-dd'),
        });
      } else {
        await addExpense(parsedAmount, description.trim(), type, paidBy.trim(), cycleId, format(date, 'yyyy-MM-dd'));
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!expense || isDeleting) return;
    setIsDeleting(true);

    try {
      await deleteExpense(expense.id);
      onDeleted?.(expense);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Expense Type</label>
        <Select value={type} onValueChange={(value: 'meal' | 'fixed') => setType(value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="meal">Meal (Grocery/Food)</SelectItem>
            <SelectItem value="fixed">Fixed (Bills/Utilities)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Rice, WiFi bill" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}>
              <span className="mr-2 inline-block h-4 w-4" />
              {date ? format(date, 'PPP') : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center">
            <Calendar mode="single" selected={date} onSelect={(nextDate) => nextDate && setDate(nextDate)} initialFocus />
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Amount</label>
        <Input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="100"
        />
        <p className="text-xs text-muted-foreground">
          Negative amounts are allowed here for pending-cycle corrections.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Who Shopped?</label>
        <Input value={paidBy} onChange={(event) => setPaidBy(event.target.value)} placeholder="Shopper name" />
      </div>

      {expense ? (
        <div className="flex gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" className="flex-1" disabled={isSubmitting || isDeleting}>Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the expense from this pending cycle.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="submit" className="flex-1" disabled={isSubmitting || isDeleting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      ) : (
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Adding...' : 'Add Expense'}
        </Button>
      )}
    </form>
  );
}

function PendingCycleCard({ details }: { details: CycleDetails }) {
  const { markCycleClosed, restoreExpense } = useMeal();
  const { profile } = useAuth();
  const canSettle = profile?.role === 'manager' || profile?.role === 'coordinator';
  const canCorrect = canSettle;
  const canLock = profile?.role === 'manager';
  const [depositMember, setDepositMember] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [mealDate, setMealDate] = useState<Date | undefined>(undefined);
  const [isMarkingClosed, setIsMarkingClosed] = useState(false);
  const [deletedExpenses, setDeletedExpenses] = useState<DeletedExpenseGhost[]>([]);
  const remainingBalance =
    details.stats.totalDeposits -
    details.stats.totalMealExpenses -
    details.stats.totalFixedExpenses;
  const roundedRemainingBalance = Math.round(remainingBalance);
  const managerShouldGet = details.members.reduce((sum, member) => {
    if (member.balance >= 0) return sum;
    return sum + Math.abs(Math.round(member.balance));
  }, 0);
  const managerShouldGive = details.members.reduce((sum, member) => {
    if (member.balance <= 0) return sum;
    return sum + Math.round(member.balance);
  }, 0);
  const managerGetPlusRemaining = managerShouldGet + roundedRemainingBalance;
  const settlementMismatch = managerShouldGive - managerGetPlusRemaining;
  const isSettlementMatched = settlementMismatch === 0;
  const signedRemainingBalanceText =
    roundedRemainingBalance >= 0
      ? formatCurrency(roundedRemainingBalance)
      : `(-${formatCurrency(Math.abs(roundedRemainingBalance))})`;
  const settlementFormulaText =
    `${formatCurrency(managerShouldGet)} + ${signedRemainingBalanceText}`;
  const memberMealTotals = useMemo(() => {
    const totals = new Map<string, number>();

    for (const member of details.members) {
      totals.set(member.id, 0);
    }

    for (const log of details.mealLogs) {
      totals.set(log.memberId, (totals.get(log.memberId) ?? 0) + log.count);
    }

    return totals;
  }, [details.mealLogs, details.members]);

  const days = useMemo(() => {
    if (details.mealLogs.length === 0) {
      return [startOfDay(new Date(details.cycle.closedAt || details.cycle.startedAt))];
    }
    const logDates = details.mealLogs.map((log) => startOfDay(parseISO(log.date)));
    return eachDayOfInterval({ start: min(logDates), end: max(logDates) }).reverse();
  }, [details]);

  const handleMarkClosed = async () => {
    if (!canLock || isMarkingClosed || !isSettlementMatched) return;
    setIsMarkingClosed(true);

    try {
      await markCycleClosed(details.cycle.id);
    } finally {
      setIsMarkingClosed(false);
    }
  };

  const handleExpenseDeleted = (expense: Expense) => {
    const allExpenses = [...details.expenses];
    const typedExpenses = details.expenses.filter((entry) => entry.type === expense.type);

    setDeletedExpenses((prev) => [
      ...prev.filter((entry) => entry.expense.id !== expense.id),
      {
        expense,
        allIndex: Math.max(0, allExpenses.findIndex((entry) => entry.id === expense.id)),
        typeIndex: Math.max(0, typedExpenses.findIndex((entry) => entry.id === expense.id)),
        expiresAt: Date.now() + DELETE_GRACE_MS,
      },
    ]);
  };

  const handleUndoExpense = async (id: string) => {
    setDeletedExpenses((prev) => prev.filter((entry) => entry.expense.id !== id));
    await restoreExpense(id);
  };

  const renderPendingExpenseRow = (expense: Expense, onEdit?: () => void) => (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-center gap-4">
        <div
          className={cn(
            'rounded-full p-2',
            expense.type === 'meal'
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-slate-100 text-slate-600',
          )}
        >
          {expense.type === 'meal' ? (
            <ShoppingBag className="h-5 w-5" />
          ) : (
            <Zap className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{expense.description}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(expense.date), 'MMM d, yyyy')} • Paid by {expense.paidBy}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="font-bold">{formatCurrency(expense.amount)}</p>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {expense.type}
          </Badge>
        </div>
        {onEdit ? (
          <Button variant="outline" size="icon" onClick={onEdit} aria-label="Edit expense">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
  return (
    <AccordionItem value={details.cycle.id} className="rounded-2xl border bg-card shadow-sm">
      <AccordionTrigger className="hover:no-underline py-4 px-5">
        <div className="flex flex-1 items-center justify-between gap-4">
          <div className="text-left">
            <p className="font-bold text-lg">{details.cycle.name}</p>
            <p className="text-sm text-muted-foreground">
              Closed: {format(new Date(details.cycle.closedAt || details.cycle.startedAt), 'PPP')} • {details.members.length} Members • {formatMealCount(details.stats.totalMealsConsumed)} Meals
            </p>
          </div>
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 border-none shrink-0 rounded-full px-3 py-1">Pending Settlement</Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-8 px-5 pb-6">
        
        {/* Visual Cycle Stepper */}
        <div className="flex items-center justify-center gap-3 py-2 text-xs font-semibold uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>Active</span>
          </div>
          <div className="h-0.5 w-8 rounded-full bg-border" />
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Pending Settlement</span>
          </div>
          <div className="h-0.5 w-8 rounded-full bg-border" />
          <div className="flex items-center gap-1.5 text-muted-foreground opacity-50">
            <Lock className="h-4 w-4" />
            <span>Closed</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatCard title="Total Deposits" value={formatCurrency(details.stats.totalDeposits)} icon={Wallet} iconClass="text-emerald-600" iconBgClass="bg-emerald-500/10" />
          <StatCard title="Meal Expense" value={formatCurrency(details.stats.totalMealExpenses)} icon={ShoppingBag} iconClass="text-indigo-600" iconBgClass="bg-indigo-500/10" />
          <StatCard title="Fixed Expense" value={formatCurrency(details.stats.totalFixedExpenses)} icon={Zap} iconClass="text-amber-600" iconBgClass="bg-amber-500/10" />
          <StatCard
            title="Remaining Balance"
            value={`${remainingBalance >= 0 ? '' : '-'}${formatCurrency(Math.abs(remainingBalance))}`}
            icon={CheckCircle2}
            iconClass={remainingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
            iconBgClass={remainingBalance >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}
          />
          <StatCard title="Meal Rate" value={formatCurrency(details.stats.currentMealRate)} icon={Utensils} iconClass="text-teal-600" iconBgClass="bg-teal-500/10" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-y py-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={!canCorrect} onClick={() => { if (!canCorrect) return; setEditingExpense(null); setExpenseDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              Add Expense Correction
            </Button>
            <Button variant="outline" className="gap-2" disabled={!canCorrect} onClick={() => { if (!canCorrect) return; setMealDate(undefined); setMealDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              Add Meal Correction
            </Button>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isSettlementMatched ? "default" : "secondary"}
                className={cn("gap-2 shadow-sm transition-all", isSettlementMatched ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5" : "text-muted-foreground")}
                disabled={!canLock || isMarkingClosed || !isSettlementMatched}
                title={!isSettlementMatched ? 'Cannot lock cycle until settlement math matches' : undefined}
              >
                {!isSettlementMatched ? <AlertCircle className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {isMarkingClosed ? 'Locking...' : 'Lock & Archive Cycle'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Lock this pending cycle?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently archive the cycle. It will become read-only and no further settlements or corrections can be made.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMarkClosed} disabled={isMarkingClosed}>
                  {isMarkingClosed ? 'Locking...' : 'Yes, Lock & Archive'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-lg font-bold">Settlement Hub</h3>
              <p className="text-sm text-muted-foreground">Adjust deposits until everyone is fully settled (balance = 0).</p>
            </div>
          </div>
          
          <Card className={cn("border-2 transition-colors", isSettlementMatched ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5")}>
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold">Settlement Math Check</p>
                  <p className="text-xs text-muted-foreground">
                    Verifies that the money you collect plus what's left covers what you must pay out.
                  </p>
                </div>
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider',
                    isSettlementMatched
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
                  )}
                >
                  {isSettlementMatched ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {isSettlementMatched ? 'Calculation Matched' : 'Calculation Mismatch'}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-card p-4 shadow-sm border">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Manager Receives (Inflow)
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatCurrency(managerGetPlusRemaining)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Collected from negative balances + leftover cycle cash
                  </p>
                </div>
                <div className="rounded-xl bg-card p-4 shadow-sm border">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Manager Gives (Outflow)
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatCurrency(managerShouldGive)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Refunded to positive balances
                  </p>
                </div>
              </div>
              {!isSettlementMatched ? (
                <p className="text-sm font-medium text-red-600 dark:text-red-400 text-center">
                  Mismatch of {formatCurrency(Math.abs(settlementMismatch))} — Please add corrections to fix this before locking.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="pt-2">
            <Accordion type="multiple" className="space-y-2">
              {details.members.map((member) => {
                const memberDeposits = details.deposits
                  .filter((d) => d.memberId === member.id)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                return (
                  <AccordionItem key={member.id} value={member.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-primary/10 bg-primary/5 text-primary"><AvatarFallback>{member.avatar}</AvatarFallback></Avatar>
                        <div>
                          <span className="block font-bold">{member.name}</span>
                          <span className="text-xs text-muted-foreground">Cost: {formatCurrency(member.totalCost)} · Meals: {formatMealCount(member.mealsEaten)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-6">
                        <div className="hidden md:block text-right">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paid</p>
                          <p className="font-medium text-sm">{formatCurrency(member.deposit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance</p>
                          <p className={cn('font-bold text-base', member.balance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            {formatBalance(member.balance)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="gap-2 rounded-full" disabled={!canSettle} onClick={() => { if (!canSettle) return; setDepositMember({ id: member.id, name: member.name, balance: member.balance }); }}>
                            <Wallet className="h-4 w-4" />
                            Settle
                          </Button>
                          {memberDeposits.length > 0 && (
                            <AccordionTrigger className="hover:bg-muted rounded-full p-2" title="View Installments" />
                          )}
                        </div>
                      </div>
                    </div>
                    {memberDeposits.length > 0 && (
                      <AccordionContent className="border-t bg-secondary/20 px-5 py-4">
                        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Installment History</h4>
                        <div className="space-y-2">
                          {memberDeposits.map(d => (
                            <div key={d.id} className="flex justify-between rounded-md bg-card border px-3 py-2 text-sm shadow-sm">
                              <span className="text-muted-foreground">
                                {format(new Date(d.createdAt), 'MMM d, h:mm a')} 
                                {d.note ? <span className="ml-2 font-medium text-foreground">· {d.note}</span> : ''}
                              </span>
                              <span className={cn("font-bold", d.amount >= 0 ? "text-emerald-600" : "text-red-600")}>
                                {d.amount > 0 ? '+' : ''}{formatCurrency(d.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    )}
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Expenses</h3>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="meal">Meals</TabsTrigger>
              <TabsTrigger value="fixed">Fixed</TabsTrigger>
            </TabsList>
            {(['all', 'meal', 'fixed'] as const).map((tab) => {
              const expenses =
                tab === 'all'
                  ? [...details.expenses]
                  : details.expenses.filter((expense) => expense.type === tab);
              const ghosts = deletedExpenses
                .filter((entry) => tab === 'all' || entry.expense.type === tab)
                .sort((a, b) => (tab === 'all' ? a.allIndex - b.allIndex : a.typeIndex - b.typeIndex));
              const rows: Array<
                | { type: 'expense'; expense: Expense }
                | { type: 'deleted'; ghost: DeletedExpenseGhost }
              > = expenses.map((expense) => ({ type: 'expense', expense }));

              for (const ghost of ghosts) {
                rows.splice(Math.min(tab === 'all' ? ghost.allIndex : ghost.typeIndex, rows.length), 0, { type: 'deleted', ghost });
              }

              const useScrollableExpenseList = rows.length > 8;

              return (
                <TabsContent key={tab} value={tab} className="m-0">
                  <div className="space-y-3">
                    {rows.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                          No expenses found.
                        </CardContent>
                      </Card>
                    ) : (
                      <div
                        className={cn(
                          'space-y-3',
                          useScrollableExpenseList &&
                            'max-h-[420px] overflow-y-auto rounded-lg border border-dashed bg-muted/10 p-2 sm:max-h-[460px] md:max-h-[540px]',
                        )}
                      >
                        {rows.map((row) => {
                          if (row.type === 'deleted') {
                            const { ghost } = row;
                            return (
                              <UndoDeleteGhost
                                key={`deleted-${ghost.expense.id}`}
                                message={`Expense '${ghost.expense.description}' deleted.`}
                                expiresAt={ghost.expiresAt}
                                onUndo={() => void handleUndoExpense(ghost.expense.id)}
                                onExpired={() => setDeletedExpenses((prev) => prev.filter((entry) => entry.expense.id !== ghost.expense.id))}
                              >
                                {renderPendingExpenseRow(ghost.expense)}
                              </UndoDeleteGhost>
                            );
                          }

                          return (
                            <div key={row.expense.id}>
                              {renderPendingExpenseRow(row.expense, canCorrect ? () => { setEditingExpense(row.expense); setExpenseDialogOpen(true); } : undefined)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Meal Logs</h3>
          <MealLogTable
            members={details.members}
            mealLogs={details.mealLogs}
            days={days}
            maxHeight="max-h-[420px]"
            onDayClick={canCorrect ? (day) => { setMealDate(day); setMealDialogOpen(true); } : undefined}
            totalMeals={details.stats.totalMealsConsumed}
          />
        </section>

        <Dialog open={!!depositMember} onOpenChange={(open) => !open && setDepositMember(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Settlement</DialogTitle></DialogHeader>
            {depositMember ? (
              <SettlementForm cycleId={details.cycle.id} memberId={depositMember.id} memberName={depositMember.name} currentBalance={depositMember.balance} onClose={() => setDepositMember(null)} />
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense Correction'}</DialogTitle></DialogHeader>
            <PendingExpenseEditor
              cycleId={details.cycle.id}
              expense={editingExpense}
              onDeleted={handleExpenseDeleted}
              onClose={() => {
                setExpenseDialogOpen(false);
                setEditingExpense(null);
              }}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={mealDialogOpen} onOpenChange={setMealDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{mealDate ? `Edit Meals for ${format(mealDate, 'PPP')}` : 'Add Meal Correction'}</DialogTitle></DialogHeader>
            <MealCountEditor
              cycleId={details.cycle.id}
              members={details.members}
              mealLogs={details.mealLogs}
              initialDate={mealDate}
              submitLabel="Save Meal Log"
              onClose={() => {
                setMealDialogOpen(false);
                setMealDate(undefined);
              }}
            />
          </DialogContent>
        </Dialog>
      </AccordionContent>
    </AccordionItem>
  );
}

function ClosedCycleCard({
  cycle,
  isExpanded,
  onDeleted,
}: {
  cycle: Cycle;
  isExpanded: boolean;
  onDeleted?: (details: CycleDetails) => void;
}) {
  const { getCycleDetails, loadCycleDetails, isCycleDetailsLoading, getCycleDetailsError, deleteCycle } = useMeal();
  const { canManageCycles } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const details = getCycleDetails(cycle.id);
  const isLoading = isCycleDetailsLoading(cycle.id);
  const loadError = getCycleDetailsError(cycle.id);
  const memberCount = details?.members.length ?? cycle.membersSnapshot?.length ?? 0;
  const mealCount = details ? formatMealCount(details.stats.totalMealsConsumed) : null;

  useEffect(() => {
    if (isExpanded && !details && !isLoading && !loadError) {
      void loadCycleDetails(cycle.id);
    }
  }, [cycle.id, details, isExpanded, isLoading, loadCycleDetails, loadError]);

  const handleDeleteCycle = async () => {
    if (isDeleting || !details || !onDeleted) return;
    setIsDeleting(true);

    try {
      await deleteCycle(cycle.id);
      onDeleted(details);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AccordionItem value={cycle.id} className="rounded-xl border bg-card px-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-4 py-4">
        <AccordionPrimitive.Header className="min-w-0 flex-1">
          <AccordionPrimitive.Trigger className="flex w-full items-center text-left text-sm font-medium transition-all hover:no-underline">
            <div className="min-w-0 text-left">
              <p className="font-bold">{cycle.name}</p>
              <p className="text-sm text-muted-foreground">
                Closed: {format(new Date(cycle.finalizedAt || cycle.closedAt || cycle.startedAt), 'PPP')} • {memberCount} Members{mealCount ? ` • ${mealCount} Meals` : ''}
              </p>
            </div>
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <div className="flex shrink-0 items-center gap-2">
          {isExpanded && canManageCycles ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 sm:hidden"
                    disabled={isDeleting || !details}
                    aria-label="Delete cycle"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this closed cycle?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the closed cycle from history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteCycle} disabled={isDeleting || !details}>
                      {isDeleting ? 'Deleting...' : 'Yes, Delete Cycle'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 sm:inline-flex"
                    disabled={isDeleting || !details}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Cycle
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this closed cycle?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the closed cycle from history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteCycle} disabled={isDeleting || !details}>
                      {isDeleting ? 'Deleting...' : 'Yes, Delete Cycle'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/80 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            <Lock className="h-3 w-3" />
            Closed
          </span>
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
              className="group flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary"
              aria-label={isExpanded ? 'Collapse closed cycle' : 'Expand closed cycle'}
            >
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
        </div>
      </div>
      <AccordionContent className="space-y-4 pb-6">
        {isLoading ? (
          <div className="space-y-3 rounded-lg border border-dashed p-4">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-20 animate-pulse rounded bg-muted/70" />
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            <p className="mb-3">Unable to load this cycle.</p>
            <Button variant="outline" size="sm" onClick={() => void loadCycleDetails(cycle.id, { force: true })}>
              Retry
            </Button>
          </div>
        ) : details ? (
          <>
            {/* ── KPI Metric Tiles ── */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatCard
                title="Total Deposits"
                value={formatCurrency(details.stats.totalDeposits)}
                icon={Wallet}
                iconClass="text-emerald-600"
                iconBgClass="bg-emerald-500/10"
              />
              <StatCard
                title="Meal Expense"
                value={formatCurrency(details.stats.totalMealExpenses)}
                icon={ShoppingBag}
                iconClass="text-indigo-600"
                iconBgClass="bg-indigo-500/10"
              />
              <StatCard
                title="Fixed Expense"
                value={formatCurrency(details.stats.totalFixedExpenses)}
                icon={Zap}
                iconClass="text-amber-600"
                iconBgClass="bg-amber-500/10"
              />
              <StatCard
                title="Meal Rate"
                value={formatCurrency(details.stats.currentMealRate)}
                icon={Utensils}
                iconClass="text-teal-600"
                iconBgClass="bg-teal-500/10"
              />
            </div>

            {/* ── Member Settlement Table ── */}
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="font-bold">Member</TableHead>
                    <TableHead className="text-center font-bold">Meals</TableHead>
                    <TableHead className="text-center font-bold">Deposit</TableHead>
                    <TableHead className="text-right font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.members.map((member) => {
                    const isSettled = Math.abs(member.balance) <= 1;
                    const isDue = member.balance < -1;
                    const isRefund = member.balance > 1;
                    return (
                      <TableRow key={member.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {member.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{member.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">{formatMealCount(member.mealsEaten)}</TableCell>
                        <TableCell className="text-center text-sm">{formatCurrency(member.deposit)}</TableCell>
                        <TableCell className="text-right">
                          {isSettled ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                              <Check className="h-3 w-3" />
                              Settled
                            </span>
                          ) : isDue ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                              Due: {formatCurrency(Math.abs(member.balance))}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-600">
                              Refund: {formatCurrency(Math.abs(member.balance))}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {/* Summary Footer */}
                <tfoot>
                  <tr className="border-t-2 bg-muted/40">
                    <td className="p-3 text-xs font-bold uppercase tracking-wide text-muted-foreground" colSpan={2}>
                      {details.members.length} Members
                    </td>
                    <td className="p-3 text-center text-sm font-bold">
                      {formatCurrency(details.stats.totalDeposits)}
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {formatMealCount(details.stats.totalMealsConsumed)} meals total
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          </>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconClass,
  iconBgClass,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  iconClass: string;
  iconBgClass: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconBgClass)}>
        <Icon className={cn('h-5 w-5', iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-0.5 font-heading text-lg font-bold leading-none">{value}</p>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { cycles, getCycleDetails, restoreCycle } = useMeal();
  const { profile } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (profile?.role === 'member') {
      setLocation('/app');
    }
  }, [profile?.role, setLocation]);

  const [openClosedCycleId, setOpenClosedCycleId] = useState('');
  const [deletedClosedCycles, setDeletedClosedCycles] = useState<DeletedCycleGhost[]>([]);

  if (profile?.role === 'member') {
    return null;
  }

  const pendingCycles = cycles
    .filter((cycle) => cycle.status === 'pending')
    .map((cycle) => getCycleDetails(cycle.id))
    .filter((cycle): cycle is CycleDetails => Boolean(cycle));

  const closedCycles = cycles
    .filter((cycle) => cycle.status === 'closed');

  const handleClosedCycleDeleted = (details: CycleDetails) => {
    setDeletedClosedCycles((prev) => [
      ...prev.filter((entry) => entry.details.cycle.id !== details.cycle.id),
      {
        details,
        index: Math.max(0, closedCycles.findIndex((entry) => entry.id === details.cycle.id)),
        expiresAt: Date.now() + DELETE_GRACE_MS,
      },
    ]);
    setOpenClosedCycleId('');
  };

  const handleUndoClosedCycle = async (cycleId: string) => {
    setDeletedClosedCycles((prev) => prev.filter((entry) => entry.details.cycle.id !== cycleId));
    await restoreCycle(cycleId);
  };

  const closedCycleRows: Array<
    | { type: 'cycle'; cycle: Cycle }
    | { type: 'deleted'; ghost: DeletedCycleGhost }
  > = closedCycles.map((cycle) => ({ type: 'cycle', cycle }));

  for (const ghost of [...deletedClosedCycles].sort((a, b) => a.index - b.index)) {
    closedCycleRows.splice(Math.min(ghost.index, closedCycleRows.length), 0, { type: 'deleted', ghost });
  }

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <History className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">History</h1>
              <p className="hidden sm:block mt-1 text-sm leading-6 text-muted-foreground">
                Pending cycles stay editable for settlement and corrections. Closed cycles are read-only.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="gap-1.5 border-border/80 bg-background/80 shadow-sm transition-all hover:bg-background hover:shadow shrink-0 sm:h-9">
            <Link href="/app/changelog">
              <ScrollText className="h-4 w-4 text-primary" />
              <span>Changelog</span>
            </Link>
          </Button>
        </div>
      </header>

      {pendingCycles.length === 0 && closedCycleRows.length === 0 ? (
        <Card className="border-dashed p-8 sm:p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <History className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold font-heading">No Past Cycles</h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
            Close your active cycle in Settings to see settlement history and member summaries here.
          </p>
        </Card>
      ) : null}

      {pendingCycles.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold">Pending Settlement</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-4">
            {pendingCycles.map((cycle) => <PendingCycleCard key={cycle.cycle.id} details={cycle} />)}
          </Accordion>
        </section>
      ) : null}

      {closedCycleRows.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-bold">Closed Cycles</h2>
          </div>
          <Accordion
            type="single"
            collapsible
            className="space-y-4"
            value={openClosedCycleId}
            onValueChange={setOpenClosedCycleId}
          >
            {closedCycleRows.map((row) => {
              if (row.type === 'deleted') {
                const { ghost } = row;
                return (
                  <UndoDeleteGhost
                    key={`deleted-${ghost.details.cycle.id}`}
                    message={`Cycle '${ghost.details.cycle.name}' deleted.`}
                    expiresAt={ghost.expiresAt}
                    onUndo={() => void handleUndoClosedCycle(ghost.details.cycle.id)}
                    onExpired={() => setDeletedClosedCycles((prev) => prev.filter((entry) => entry.details.cycle.id !== ghost.details.cycle.id))}
                  >
                    <div className="rounded-lg border bg-card px-4">
                      <div className="flex items-center justify-between gap-4 py-4">
                        <div className="min-w-0 text-left">
                          <p className="font-bold">{ghost.details.cycle.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Closed: {format(new Date(ghost.details.cycle.finalizedAt || ghost.details.cycle.closedAt || ghost.details.cycle.startedAt), 'PPP')} • {ghost.details.members.length} Members • {formatMealCount(ghost.details.stats.totalMealsConsumed)} Meals
                          </p>
                        </div>
                        <Badge variant="secondary">Closed</Badge>
                      </div>
                    </div>
                  </UndoDeleteGhost>
                );
              }

              return (
                <ClosedCycleCard
                  key={row.cycle.id}
                  cycle={row.cycle}
                  isExpanded={openClosedCycleId === row.cycle.id}
                  onDeleted={handleClosedCycleDeleted}
                />
              );
            })}
          </Accordion>
        </section>
      ) : null}
    </div>
  );
}
