import { useMeal } from '@/lib/meal-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Plus,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
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
import { useAuth } from '@/lib/auth-context';
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
  const { stats, members, mealLogs, getMemberStats } = useMeal();
  const [openExpense, setOpenExpense] = useState(false);
  const [openMeal, setOpenMeal] = useState(false);
  const { canManageExpenses, canOperateMeals } = useAuth();

  const totalSpent = stats.totalMealExpenses + stats.totalFixedExpenses;
  const spentPct = stats.totalDeposits > 0 ? Math.min(100, Math.round((totalSpent / stats.totalDeposits) * 100)) : 0;
  const mealPct = totalSpent > 0 ? Math.round((stats.totalMealExpenses / totalSpent) * 100) : 0;
  const fixedPct = totalSpent > 0 ? 100 - mealPct : 0;

  // Member balance snapshot
  const memberBalances = members.map((m) => getMemberStats(m.id).balance);
  const membersWithDue = memberBalances.filter((b) => b < 0).length;
  const totalDueAmount = memberBalances.filter((b) => b < 0).reduce((sum, b) => sum + Math.abs(b), 0);
  const membersWithSurplus = memberBalances.filter((b) => b > 0).length;

  return (
    <div className="space-y-6 pb-24">
      <OnboardingTour />

      {/* Top Quick Actions Bar (Desktop / Tablet) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Mess Overview
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Live financial liquidity, meal metrics, and cost breakdown
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageExpenses && (
            <Button
              size="sm"
              onClick={() => setOpenExpense(true)}
              className="h-9 gap-1.5 font-medium shadow-xs"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          )}
          {canOperateMeals && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenMeal(true)}
              className="h-9 gap-1.5 font-medium shadow-xs"
            >
              <Utensils className="h-4 w-4" /> Log Meals
            </Button>
          )}
        </div>
      </div>

      {/* Primary Financial & Meal Command Center */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Hero Card: Cash Liquidity & Fund Utilization */}
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white shadow-xl lg:col-span-2">
          {/* Subtle decorative background blur glow */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-teal-400/10 blur-2xl" />

          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-100/90">
                <Wallet className="h-4 w-4 text-emerald-200" />
                Remaining Cash in Hand
              </CardTitle>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide backdrop-blur-md',
                  stats.remainingCash >= 0
                    ? 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/30'
                    : 'bg-rose-500/30 text-rose-100 border border-rose-400/40'
                )}
              >
                {stats.remainingCash >= 0 ? 'Reserve Healthy' : 'Cash Deficit'}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-4xl font-extrabold tracking-tight md:text-5xl">
                  {formatCurrency(stats.remainingCash)}
                </span>
              </div>
              <p className="text-xs text-emerald-100/80 font-medium">
                of <strong className="text-white font-bold">{formatCurrency(stats.totalDeposits)}</strong> collected deposits
              </p>
            </div>

            {/* Fund deployment progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-emerald-100/80 font-medium">
                <span>Funds Deployed: {formatCurrency(totalSpent)}</span>
                <span>{spentPct}% utilized</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/20 backdrop-blur-xs">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-200 to-teal-100 transition-all duration-700"
                  style={{ width: `${spentPct}%` }}
                />
              </div>
            </div>

            {/* Breakdown Sub-boxes */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-md shadow-xs transition-colors hover:bg-white/15">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100">Meal Cost</p>
                  <span className="rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">
                    {mealPct}%
                  </span>
                </div>
                <p className="mt-1 font-heading text-xl font-bold tracking-tight text-white">
                  {formatCurrency(stats.totalMealExpenses)}
                </p>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-md shadow-xs transition-colors hover:bg-white/15">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100">Fixed Cost</p>
                  <span className="rounded-md bg-purple-400/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-100">
                    {fixedPct}%
                  </span>
                </div>
                <p className="mt-1 font-heading text-xl font-bold tracking-tight text-white">
                  {formatCurrency(stats.totalFixedExpenses)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Meal Economy & Consumption */}
        <Card className="glass-card border border-border/70 shadow-sm flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Current Meal Rate
            </CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Utensils className="h-4 w-4" />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-3xl font-extrabold text-foreground md:text-4xl">
                  {formatCurrency(stats.currentMealRate)}
                </span>
                <span className="text-xs text-muted-foreground font-medium">/ meal</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Blended effective cost per meal for this active cycle
              </p>
            </div>

            <div className="space-y-2.5 border-t pt-3.5 text-xs">
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

          {/* Member Balance Health Mini-Strip */}
          <div className="border-t bg-muted/25 px-4 py-2.5 text-[11px] rounded-b-xl flex items-center justify-between">
            <span className="text-muted-foreground">
              {membersWithDue > 0 ? (
                <strong className="text-amber-600 dark:text-amber-400 font-semibold">
                  {membersWithDue} member{membersWithDue === 1 ? '' : 's'} owe {formatCurrency(totalDueAmount)}
                </strong>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  All accounts settled / up to date
                </span>
              )}
            </span>
            <Link
              href="/app/members"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Details
            </Link>
          </div>
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
