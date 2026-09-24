import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMeal, Expense } from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ShoppingBag, Zap, ChartPie, Plus, Pencil, DollarSign, Search, Play, Settings2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar as CalendarIcon } from 'lucide-react';
import { UndoDeleteGhost } from '@/components/undo-delete-ghost';
import { SyncBadge } from '@/components/sync-badge';

const DELETE_GRACE_MS = 10 * 1000;

const expenseSchema = z.object({
  amount: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.coerce.number({ invalid_type_error: 'Amount is required' }).positive('Amount must be greater than zero'),
  ),
  description: z.string().min(2, 'Description is required'),
  type: z.enum(['meal', 'fixed']),
  paidBy: z.string().min(2, 'Shopper name is required'),
});

type DeletedExpenseGhost = {
  expense: Expense;
  allIndex: number;
  typeIndex: number;
  expiresAt: number;
};

function ExpenseRow({ expense, onEdit }: { expense: Expense; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-3.5 transition-shadow hover:shadow-sm sm:p-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className={`shrink-0 rounded-full p-2 ${expense.type === 'meal' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
          {expense.type === 'meal' ? <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" /> : <Zap className="h-4 w-4 sm:h-5 sm:w-5" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium sm:text-base">{expense.description}</p>
            <SyncBadge itemId={expense.id} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{format(parseISO(expense.date), 'MMM d, yyyy')}</span>
            <span>•</span>
            <span>Paid by {expense.paidBy}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {onEdit ? (
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit expense">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <div className="text-right">
          <p className="font-heading text-sm font-bold sm:text-base">৳{expense.amount.toFixed(0)}</p>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            {expense.type === 'meal' ? 'Meal' : 'Fixed'}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function ExpenseEditor({
  expense,
  onClose,
  onDeleted,
}: {
  expense?: Expense | null;
  onClose: () => void;
  onDeleted?: (expense: Expense) => void;
}) {
  const { addExpense, updateExpense, deleteExpense } = useMeal();
  const [date, setDate] = useState<Date>(expense ? parseISO(expense.date) : new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: expense?.amount,
      description: expense?.description ?? '',
      type: expense?.type ?? 'meal',
      paidBy: expense?.paidBy ?? '',
    },
  });

  useEffect(() => {
    form.reset({
      amount: expense?.amount,
      description: expense?.description ?? '',
      type: expense?.type ?? 'meal',
      paidBy: expense?.paidBy ?? '',
    });
    setDate(expense ? parseISO(expense.date) : new Date());
  }, [expense, form]);

  const onSubmit = async (data: z.infer<typeof expenseSchema>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (expense) {
        await updateExpense(expense.id, { ...data, date: format(date, 'yyyy-MM-dd') });
      } else {
        await addExpense(data.amount, data.description, data.type, data.paidBy, undefined, format(date, 'yyyy-MM-dd'));
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expense Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="meal">Meal (Grocery/Food)</SelectItem>
                  <SelectItem value="fixed">Fixed (Bills/Utilities)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl><Input placeholder="e.g., Rice, WiFi Bill" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <label className="text-sm font-medium">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(nextDate) => {
                  if (nextDate) {
                    setDate(nextDate);
                    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
                    document.dispatchEvent(escapeEvent);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input type="text" inputMode="decimal" placeholder="100" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="paidBy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Who Shopped?</FormLabel>
              <FormControl><Input placeholder="Shopper's Name" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {expense ? (
          <div className="flex gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" className="flex-1" disabled={isSubmitting || isDeleting}>
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the expense from the current cycle totals and expense list.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                    {isDeleting ? 'Deleting...' : 'Yes, Delete Expense'}
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
    </Form>
  );
}

type TabFilter = 'all' | 'meal' | 'fixed';

export default function Expenses() {
  const { expenses, restoreExpense, activeCycle } = useMeal();
  const { canManageExpenses } = useAuth();
  const [openExpense, setOpenExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletedExpenses, setDeletedExpenses] = useState<DeletedExpenseGhost[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');

  // Sort descending by date (latest first)
  const allExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date)),
    [expenses],
  );

  const totalExpenses = useMemo(() => allExpenses.reduce((s, e) => s + e.amount, 0), [allExpenses]);
  const totalMeal = useMemo(() => allExpenses.filter(e => e.type === 'meal').reduce((s, e) => s + e.amount, 0), [allExpenses]);
  const totalFixed = useMemo(() => allExpenses.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0), [allExpenses]);

  const handleExpenseDeleted = (expense: Expense) => {
    const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
    const typedSorted = sorted.filter(e => e.type === expense.type);
    setDeletedExpenses((prev) => [
      ...prev.filter((entry) => entry.expense.id !== expense.id),
      {
        expense,
        allIndex: Math.max(0, sorted.findIndex((e) => e.id === expense.id)),
        typeIndex: Math.max(0, typedSorted.findIndex((e) => e.id === expense.id)),
        expiresAt: Date.now() + DELETE_GRACE_MS,
      },
    ]);
  };

  const handleUndoExpense = async (id: string) => {
    setDeletedExpenses((prev) => prev.filter((entry) => entry.expense.id !== id));
    await restoreExpense(id);
  };

  // Apply tab + search filter
  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allExpenses.filter((e) => {
      const matchesTab = tab === 'all' || e.type === tab;
      const matchesSearch = !q || e.description.toLowerCase().includes(q) || e.paidBy.toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [allExpenses, tab, search]);

  // Build rows (filtered + deleted ghosts interleaved)
  const rows = useMemo(() => {
    const scope = tab;
    const ghosts = deletedExpenses
      .filter((entry) => scope === 'all' || entry.expense.type === scope)
      .sort((a, b) => (scope === 'all' ? a.allIndex - b.allIndex : a.typeIndex - b.typeIndex));

    const result: Array<{ type: 'expense'; expense: Expense } | { type: 'deleted'; ghost: DeletedExpenseGhost }> =
      filteredExpenses.map((expense) => ({ type: 'expense', expense }));

    for (const ghost of ghosts) {
      result.splice(Math.min(scope === 'all' ? ghost.allIndex : ghost.typeIndex, result.length), 0, { type: 'deleted', ghost });
    }
    return result;
  }, [filteredExpenses, deletedExpenses, tab]);

  const tabLabels: Record<TabFilter, string> = { all: 'All', meal: 'Meals', fixed: 'Fixed' };

  return (
    <div className="flex h-full flex-col space-y-5">
      {/* ── Header ── */}
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <ShoppingBag className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">Expenses</h1>
              <p className="hidden sm:block mt-1 text-sm leading-6 text-muted-foreground">
                Track groceries, bazaar costs, and shared mess utility bills.
              </p>
            </div>
          </div>
          {canManageExpenses ? (
            <Dialog open={openExpense} onOpenChange={setOpenExpense}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 shrink-0 shadow-sm sm:h-9" disabled={!activeCycle}>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add </span>Expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add New Expense</DialogTitle></DialogHeader>
                <ExpenseEditor onClose={() => setOpenExpense(false)} />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </header>

      {/* ── KPI Summary Cards ── */}
      {activeCycle && allExpenses.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Card 1: Total Expenses */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 sm:h-12 sm:w-12">
              <DollarSign className="h-5 w-5 text-emerald-600 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Expenses</p>
              <p className="mt-0.5 font-heading text-xl font-bold leading-none sm:text-2xl">৳{totalExpenses.toLocaleString('en-US')}</p>
            </div>
          </div>

          {/* Card 2: Breakdown */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 sm:h-12 sm:w-12">
              <ChartPie className="h-5 w-5 text-indigo-600 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <div className="flex flex-col">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Meal</span>
                  <span className="mt-0.5 font-heading text-xl font-bold leading-none sm:text-2xl">৳{totalMeal.toLocaleString('en-US')}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fixed</span>
                  <span className="mt-0.5 font-heading text-xl font-bold leading-none sm:text-2xl">৳{totalFixed.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Controls Row: Search + Tab Filter ── */}
      {activeCycle && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* Search — full width on mobile, 50% width on tablet/desktop */}
          <InputGroup className="w-full sm:w-1/2">
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>

          {/* Tab Buttons — full width on mobile, 50% width on tablet/desktop */}
          <div className="flex w-full rounded-lg border bg-muted p-0.5 sm:w-1/2">
            {(['all', 'meal', 'fixed'] as TabFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-xs font-semibold transition-all sm:text-sm',
                  tab === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Expense Feed ── */}
      {!activeCycle ? (
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[350px] animate-in fade-in-50 duration-300">
          <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary">
            <Play className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground">No Active Cycle</h3>
          <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">
            You must start an active cycle before adding expenses.
          </p>
          <Link href="/app/settings">
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold">
              <Plus className="h-4 w-4" />
              Start New Cycle
            </Button>
          </Link>
        </Card>
      ) : allExpenses.length === 0 ? (
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[300px] animate-in fade-in-50 duration-300">
          <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary">
            <ShoppingBag className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground">No expenses yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">
            Track your groceries, helper wages, house rent, or utility bills for the current cycle.
          </p>
          {canManageExpenses ? (
            <Button
              className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform"
              onClick={() => setOpenExpense(true)}
            >
              <Plus className="h-4 w-4" />
              Add First Expense
            </Button>
          ) : null}
        </Card>
      ) : (
        <div
          className="flex-1 overflow-y-auto rounded-xl pr-0.5"
          style={{ maxHeight: 'calc(100vh - 340px)', minHeight: '200px' }}
        >
          <div className="space-y-2.5 pb-4">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">No expenses match your search.</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setSearch('')}
                >
                  Clear search
                </button>
              </div>
            ) : (
              rows.map((row) => {
                if (row.type === 'deleted') {
                  const { ghost } = row;
                  return (
                    <UndoDeleteGhost
                      key={`deleted-${ghost.expense.id}`}
                      message={`Expense '${ghost.expense.description}' deleted.`}
                      expiresAt={ghost.expiresAt}
                      onUndo={() => void handleUndoExpense(ghost.expense.id)}
                      onExpired={() => setDeletedExpenses((prev) => prev.filter((e) => e.expense.id !== ghost.expense.id))}
                    >
                      <ExpenseRow expense={ghost.expense} />
                    </UndoDeleteGhost>
                  );
                }
                return (
                  <ExpenseRow
                    key={row.expense.id}
                    expense={row.expense}
                    onEdit={canManageExpenses ? () => setEditingExpense(row.expense) : undefined}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          {editingExpense ? (
            <ExpenseEditor
              expense={editingExpense}
              onDeleted={handleExpenseDeleted}
              onClose={() => setEditingExpense(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}



