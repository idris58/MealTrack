import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, ShoppingBag, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useMealActions, useMealMembers, type Expense } from '@/lib/meal-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { runMutation } from '@/lib/run-mutation';
import { normalizeBengaliDigits } from '@/lib/localized-number';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const expenseFields = z.object({
  amount: z.preprocess(
    (value) => typeof value === 'string'
      ? normalizeBengaliDigits(value.trim()) || undefined
      : value,
    z.coerce.number({ invalid_type_error: 'Amount is required' }),
  ),
  description: z.string().min(2, 'Description is required'),
  type: z.enum(['meal', 'utility']),
  shoppedBy: z.string(),
  shoppedByMemberId: z.string().nullable(),
}).superRefine((values, ctx) => {
  if (!values.shoppedByMemberId && values.shoppedBy.trim().length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shoppedBy'], message: 'Enter the other shopper’s name' });
  }
});

type ExpenseFields = z.infer<typeof expenseFields>;

type ExpenseFormProps = {
  mode: 'create' | 'edit';
  expense?: Expense | null;
  cycleId?: string;
  allowNegativeAmount?: boolean;
  onClose: () => void;
  onDeleted?: (expense: Expense) => void;
};

export function ExpenseForm({ mode, expense, cycleId, allowNegativeAmount = false, onClose, onDeleted }: ExpenseFormProps) {
  const { addExpense, updateExpense, deleteExpense } = useMealActions();
  const { members } = useMealMembers();
  const [date, setDate] = useState<Date>(expense ? parseISO(expense.date) : new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const form = useForm<ExpenseFields>({
    resolver: zodResolver(expenseFields.superRefine((values, ctx) => {
      if (!allowNegativeAmount && values.amount <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Amount must be greater than zero' });
      }
      if (allowNegativeAmount && values.amount === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Amount cannot be zero' });
      }
    })),
    defaultValues: {
      amount: expense?.amount,
      description: expense?.description ?? '',
      type: expense?.type ?? 'meal',
      shoppedBy: expense?.shoppedBy ?? '',
      shoppedByMemberId: expense?.shoppedByMemberId ?? null,
    },
  });

  useEffect(() => {
    form.reset({
      amount: expense?.amount,
      description: expense?.description ?? '',
      type: expense?.type ?? 'meal',
      shoppedBy: expense?.shoppedBy ?? '',
      shoppedByMemberId: expense?.shoppedByMemberId ?? null,
    });
    setDate(expense ? parseISO(expense.date) : new Date());
  }, [expense, form]);

  const onSubmit = async (data: ExpenseFields) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await runMutation(async () => {
        const formattedDate = format(date, 'yyyy-MM-dd');
        if (mode === 'edit' && expense) {
          await updateExpense(expense.id, { ...data, date: formattedDate });
        } else {
          await addExpense(data.amount, data.description.trim(), data.type, data.shoppedBy.trim(), data.shoppedByMemberId, cycleId, formattedDate);
        }
        onClose();
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!expense || isDeleting) return;
    setIsDeleting(true);
    try {
      await runMutation(async () => {
        await deleteExpense(expense.id);
        onDeleted?.(expense);
        onClose();
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="type" render={({ field }) => (
          <FormItem>
            <FormLabel>Expense Type</FormLabel>
            <FormControl>
              <div role="radiogroup" aria-label="Expense type" className="grid grid-cols-2 rounded-xl border bg-muted/40 p-1">
                {([['meal', ShoppingBag, 'Meal', 'Food'], ['utility', Zap, 'Utility', 'Bills']] as const).map(([value, Icon, label, hint]) => (
                  <button key={value} type="button" role="radio" aria-checked={field.value === value} onClick={() => field.onChange(value)} className={cn('rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors', field.value === value ? value === 'meal' ? 'bg-success text-success-foreground shadow-sm' : 'bg-slate-700 text-white shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground')}>
                    <Icon className="mr-1.5 inline-block h-4 w-4" />{label}<span className="ml-1 hidden text-xs font-normal opacity-80 sm:inline">({hint})</span>
                  </button>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Description</FormLabel><FormControl><Input placeholder="e.g., Rice, WiFi Bill" {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <div className="space-y-2">
          <label className="text-sm font-medium">Date</label>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarDays className="mr-2 h-4 w-4" />{format(date, 'PPP')}</Button></PopoverTrigger>
            <PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center"><Calendar mode="single" selected={date} onSelect={(nextDate) => nextDate && setDate(nextDate)} initialFocus /></PopoverContent>
          </Popover>
        </div>

        <FormField control={form.control} name="amount" render={({ field }) => (
          <FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="text" inputMode="decimal" placeholder={allowNegativeAmount ? 'e.g. 300 or -300' : '100'} {...field} value={field.value ?? ''} /></FormControl>{allowNegativeAmount ? <p className="text-xs text-muted-foreground">Negative amounts are allowed for pending-cycle corrections.</p> : null}<FormMessage /></FormItem>
        )} />

        <FormField control={form.control} name="shoppedByMemberId" render={({ field }) => (
          <FormItem><FormLabel>Who shopped?</FormLabel><Select value={field.value ?? 'other'} onValueChange={(value) => {
            if (value === 'other') { field.onChange(null); form.setValue('shoppedBy', '', { shouldValidate: true }); }
            else { field.onChange(value); form.setValue('shoppedBy', members.find((member) => member.id === value)?.name ?? '', { shouldValidate: true }); }
          }}><FormControl><SelectTrigger><SelectValue placeholder="Select a member or Other" /></SelectTrigger></FormControl><SelectContent>
            {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
            <SelectItem value="other">Other</SelectItem>
          </SelectContent></Select>
          {(!field.value || field.value === 'other') && <Input className="mt-2" placeholder="Other shopper name" value={form.watch('shoppedBy')} onChange={(event) => form.setValue('shoppedBy', event.target.value, { shouldValidate: true })} />}
          <FormMessage /></FormItem>
        )} />

        {mode === 'edit' && expense ? (
          <div className="flex gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button type="button" variant="destructive" className="flex-1" disabled={isSubmitting || isDeleting}>Delete</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this expense?</AlertDialogTitle><AlertDialogDescription>This will remove the expense from the current cycle totals and expense list.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Yes, Delete Expense'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
            <Button type="submit" className="flex-1" disabled={isSubmitting || isDeleting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        ) : <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Expense'}</Button>}
      </form>
    </Form>
  );
}
