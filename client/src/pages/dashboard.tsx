import { useMeal } from '@/lib/meal-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  ShoppingBag,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { OnboardingTour } from '@/components/onboarding-tour';
import { DashboardFab } from '@/components/dashboard-fab';
import { format } from 'date-fns';
import { Link } from 'wouter';
import { MealCountEditor } from '@/components/meal-count-editor';
import { DashboardAnalytics } from '@/components/dashboard-analytics';

const expenseSchema = z.object({
  amount: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number({ invalid_type_error: 'Amount is required' }).positive('Amount must be greater than zero')
  ),
  description: z.string().min(2, 'Description is required'),
  type: z.enum(['meal', 'fixed']),
  paidBy: z.string().min(2, 'Shopper name is required'),
});

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

function formatCurrency(amount: number) {
  return `৳${amount.toFixed(2)}`;
}

function QuickAddExpense({ onClose }: { onClose: () => void }) {
  const { addExpense } = useMeal();
  const [date, setDate] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { amount: undefined, description: '', type: 'meal', paidBy: '' },
  });

  const onSubmit = async (data: z.infer<typeof expenseSchema>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await addExpense(data.amount, data.description, data.type, data.paidBy, undefined, format(date, 'yyyy-MM-dd'));
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expense Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="meal">Meal (Grocery / Food)</SelectItem>
                  <SelectItem value="fixed">Fixed (Bills / Utilities)</SelectItem>
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
              <FormControl>
                <Input placeholder="e.g., Grocery Shopping, WiFi Bill" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <label className="text-sm font-medium">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('w-full justify-start py-2 text-left text-sm font-normal', !date && 'text-muted-foreground')}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) setDate(d);
                }}
                initialFocus
                className="p-3"
              />
            </PopoverContent>
          </Popover>
        </div>
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (৳)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} />
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
              <FormControl>
                <Input placeholder="Shopper's Name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full font-semibold" disabled={isSubmitting}>
          {isSubmitting ? 'Recording Expense...' : 'Add Expense'}
        </Button>
      </form>
    </Form>
  );
}

export default function Dashboard() {
  const { stats, members, mealLogs } = useMeal();
  const [openExpense, setOpenExpense] = useState(false);
  const [openMeal, setOpenMeal] = useState(false);

  const totalSpent = stats.totalMealExpenses + stats.totalFixedExpenses;
  const spentPct = stats.totalDeposits > 0 ? Math.min(100, Math.round((totalSpent / stats.totalDeposits) * 100)) : 0;
  const mealPct = totalSpent > 0 ? Math.round((stats.totalMealExpenses / totalSpent) * 100) : 0;
  const fixedPct = totalSpent > 0 ? 100 - mealPct : 0;

  return (
    <div className="space-y-5 pb-24">
      <OnboardingTour />

      {/* Primary Financial & Meal Command Center */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Hero Card: Cash Liquidity & Fund Utilization */}
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white shadow-lg lg:col-span-2">
          {/* Subtle decorative background blur glow */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-400/10 blur-2xl" />

          <CardHeader className="pb-1 pt-4 px-4 sm:px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100/90">
                <Wallet className="h-3.5 w-3.5 text-emerald-200" />
                Remaining Cash in Hand
              </CardTitle>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide backdrop-blur-md',
                  stats.remainingCash >= 0
                    ? 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/30'
                    : 'bg-rose-500/30 text-rose-100 border border-rose-400/40'
                )}
              >
                {stats.remainingCash >= 0 ? 'Reserve Healthy' : 'Cash Deficit'}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-2.5 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
                {formatCurrency(stats.remainingCash)}
              </span>
              <p className="text-xs text-emerald-100/80 font-medium">
                of <strong className="text-white font-bold">{formatCurrency(stats.totalDeposits)}</strong> collected
              </p>
            </div>

            {/* Fund deployment progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-emerald-100/80 font-medium">
                <span>Deployed: {formatCurrency(totalSpent)}</span>
                <span>{spentPct}% utilized</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/25 backdrop-blur-xs">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-200 to-teal-100 transition-all duration-700"
                  style={{ width: `${spentPct}%` }}
                />
              </div>
            </div>

            {/* Breakdown Sub-boxes */}
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-md shadow-xs transition-colors hover:bg-white/15">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">Meal Cost</p>
                  <span className="rounded-md bg-emerald-400/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-100">
                    {mealPct}%
                  </span>
                </div>
                <p className="mt-0.5 font-heading text-lg font-bold tracking-tight text-white">
                  {formatCurrency(stats.totalMealExpenses)}
                </p>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-md shadow-xs transition-colors hover:bg-white/15">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">Fixed Cost</p>
                  <span className="rounded-md bg-purple-400/20 px-1.5 py-0.2 text-[9px] font-bold text-purple-100">
                    {fixedPct}%
                  </span>
                </div>
                <p className="mt-0.5 font-heading text-lg font-bold tracking-tight text-white">
                  {formatCurrency(stats.totalFixedExpenses)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Meal Economy & Consumption */}
        <Card className="glass-card border border-border/70 shadow-sm flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4 sm:px-5">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Current Meal Rate
            </CardTitle>
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Utensils className="h-3.5 w-3.5" />
            </div>
          </CardHeader>

          <CardContent className="space-y-3 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading text-3xl font-extrabold text-foreground sm:text-4xl">
                {formatCurrency(stats.currentMealRate)}
              </span>
              <span className="text-xs text-muted-foreground font-medium">/ meal</span>
            </div>

            <div className="space-y-2 border-t pt-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Utensils className="h-3.5 w-3.5 text-emerald-500" /> Total Meals:
                </span>
                <span className="font-bold text-foreground">{formatMealCount(stats.totalMealsConsumed)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ShoppingBag className="h-3.5 w-3.5 text-violet-500" /> Fixed Cost/Member:
                </span>
                <span className="font-bold text-foreground">{formatCurrency(stats.fixedCostPerMember)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-blue-500" /> Active Members:
                </span>
                <Link
                  href="/app/members"
                  className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  {members.length} members <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Analytics & Interactive Charts Workspace */}
      <DashboardAnalytics />

      {/* Floating Action Speed Dial Button for Quick Mobile & Desktop Actions */}
      <DashboardFab
        onOpenExpense={() => setOpenExpense(true)}
        onOpenMeal={() => setOpenMeal(true)}
      />

      {/* Add Expense Dialog */}
      <Dialog open={openExpense} onOpenChange={setOpenExpense}>
        <DialogContent className="max-w-md w-[95%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-emerald-500" />
              Add New Expense
            </DialogTitle>
            <DialogDescription>Record a grocery, meal, or utility expense for this active cycle.</DialogDescription>
          </DialogHeader>
          <QuickAddExpense onClose={() => setOpenExpense(false)} />
        </DialogContent>
      </Dialog>

      {/* Log Meals Dialog */}
      <Dialog open={openMeal} onOpenChange={setOpenMeal}>
        <DialogContent className="max-w-md w-[95%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-emerald-500" />
              Log Meals by Date
            </DialogTitle>
            <DialogDescription>Update meal counts for each member for the selected date.</DialogDescription>
          </DialogHeader>
          <MealCountEditor members={members} mealLogs={mealLogs} onClose={() => setOpenMeal(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
