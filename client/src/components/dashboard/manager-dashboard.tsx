import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { format, isToday, parseISO } from 'date-fns';
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Coins,
  CreditCard,
  History,
  Plus,
  ReceiptText,
  Sparkles,
  TrendingDown,
  Utensils,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useMeal, type Member } from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OnboardingTour } from '@/components/onboarding-tour';
import { DashboardFab } from '@/components/dashboard-fab';
import { MealCountEditor } from '@/components/meal-count-editor';
import { ExpenseForm } from '@/components/expense-form';
import { cn } from '@/lib/utils';

const money = (value: number) => `৳${value.toFixed(2)}`;
const meals = (value: number) => String(Math.round(value * 1000) / 1000);

function MemberRow({ member, balance, onDeposit }: { member: Member; balance: number; onDeposit: () => void }) {
  const due = balance < 0;
  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{member.avatar}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{member.name}</p>
        <p className="text-xs text-muted-foreground">{meals(member.mealsEaten)} meals · {due ? 'Needs deposit' : 'Covered'}</p>
      </div>
      <div className="text-right">
        <p className={cn('font-heading text-sm font-bold tabular-nums', due ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
          {due ? '-' : '+'}{money(Math.abs(balance))}
        </p>
        {due ? <Button variant="ghost" size="sm" className="h-7 px-0 text-xs text-primary hover:bg-transparent hover:underline" onClick={onDeposit}>Add deposit</Button> : null}
      </div>
    </div>
  );
}

function ActivityRow({ title, action, createdAt }: { title: string; action: string; createdAt: string }) {
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-0 last:pb-0">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><History className="h-3.5 w-3.5" /></div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{title}</p><p className="text-xs capitalize text-muted-foreground">{action} · {format(new Date(createdAt), 'MMM d, h:mm a')}</p></div>
    </div>
  );
}

export function ManagerDashboard() {
  const { profile } = useAuth();
  const { stats, members, expenses, activeCycle, activeCycleChangelogEntries, getMemberStats, mealLogs } = useMeal();
  const [openExpense, setOpenExpense] = useState(false);
  const [openMeal, setOpenMeal] = useState(false);
  const [depositMember, setDepositMember] = useState<Member | null>(null);

  const totalSpent = stats.totalMealExpenses + stats.totalFixedExpenses;
  const dueMembers = useMemo(() => members.map((member) => ({ member, balance: getMemberStats(member.id).balance })).filter(({ balance }) => balance < 0).sort((a, b) => a.balance - b.balance), [members, getMemberStats]);
  const recentExpenses = useMemo(() => [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [expenses]);
  const recentActivity = activeCycleChangelogEntries.slice(0, 5);
  const loggedToday = mealLogs.some((log) => isToday(parseISO(log.date)));
  const isCoordinator = profile?.role === 'coordinator';

  return (
    <div className="space-y-6 pb-24">
      <OnboardingTour />
      <section className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{isCoordinator ? 'Coordinator workspace' : 'Manager workspace'}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Good to see you, {profile?.full_name?.split(' ')[0] ?? 'manager'}.</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">A focused view of what is happening in your mess and what needs your attention next.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" asChild><Link href="/app/members"><Users className="h-4 w-4" /> Members</Link></Button>
          <Button className="gap-2 shadow-sm" onClick={() => setOpenMeal(true)}><Utensils className="h-4 w-4" /> Log meals</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/20 bg-primary/[0.07] shadow-none"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cash available</span><Wallet className="h-4 w-4 text-primary" /></div><p className="font-heading text-3xl font-semibold tabular-nums">{money(stats.remainingCash)}</p><p className="mt-1 text-xs text-muted-foreground">{money(totalSpent)} spent from {money(stats.totalDeposits)} collected</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meal rate</span><Coins className="h-4 w-4 text-amber-500" /></div><p className="font-heading text-3xl font-semibold tabular-nums">{money(stats.currentMealRate)}</p><p className="mt-1 text-xs text-muted-foreground">per meal · {meals(stats.totalMealsConsumed)} consumed</p></CardContent></Card>
        <Card className={cn('shadow-none', dueMembers.length > 0 && 'border-amber-500/30')}><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Needs attention</span><XCircle className={cn('h-4 w-4', dueMembers.length ? 'text-amber-500' : 'text-emerald-500')} /></div><p className="font-heading text-3xl font-semibold tabular-nums">{dueMembers.length}</p><p className="mt-1 text-xs text-muted-foreground">members with an outstanding balance</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roster</span><Users className="h-4 w-4 text-sky-500" /></div><p className="font-heading text-3xl font-semibold tabular-nums">{members.length}</p><p className="mt-1 text-xs text-muted-foreground">active members in this mess</p></CardContent></Card>
      </section>

      {!activeCycle ? (
        <Card className="border-dashed shadow-none"><CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">No active cycle</h2></div><p className="mt-1 text-sm text-muted-foreground">Start a cycle to begin recording meals, expenses, and deposits.</p></div><Button asChild><Link href="/app/settings#cycle-operations">Start a cycle <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{activeCycle.name}</h2><Badge variant="secondary" className="gap-1.5 text-[10px] uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active</Badge></div><p className="mt-0.5 text-xs text-muted-foreground">Started {format(parseISO(activeCycle.startedAt), 'MMM d, yyyy')} · {loggedToday ? 'Meals logged today' : 'No meals logged today'}</p></div></div>
          <Button variant="ghost" className="justify-start text-muted-foreground sm:justify-center" asChild><Link href="/app/settings#cycle-operations">Manage cycle <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="shadow-none"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">Attention queue</CardTitle><p className="mt-1 text-sm text-muted-foreground">Resolve the items that affect your cash position.</p></div><TrendingDown className="h-5 w-5 text-amber-500" /></CardHeader><CardContent>{dueMembers.length ? <div className="divide-y">{dueMembers.slice(0, 5).map(({ member, balance }) => <MemberRow key={member.id} member={member} balance={balance} onDeposit={() => setDepositMember(member)} />)}</div> : <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15"><Sparkles className="h-4 w-4" /></div><div><p className="font-semibold">Everything is covered</p><p className="text-xs opacity-80">No member balances need follow-up right now.</p></div></div>}{dueMembers.length > 5 ? <Link href="/app/members" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">View all {dueMembers.length} members <ArrowUpRight className="ml-1 h-4 w-4" /></Link> : null}</CardContent></Card>

        <Card className="shadow-none"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">Recent expenses</CardTitle><p className="mt-1 text-sm text-muted-foreground">The latest money leaving the cycle.</p></div><ReceiptText className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent>{recentExpenses.length ? <div className="space-y-1">{recentExpenses.map((expense) => <div key={expense.id} className="flex items-center gap-3 border-b py-3 last:border-0"><div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', expense.type === 'meal' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600')}><CreditCard className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{expense.description}</p><p className="text-xs text-muted-foreground">{format(parseISO(expense.date), 'MMM d')} · {expense.paidBy}</p></div><p className="font-heading text-sm font-semibold tabular-nums">{money(expense.amount)}</p></div>)}</div> : <p className="py-6 text-sm text-muted-foreground">No expenses recorded in this cycle yet.</p>}<Button variant="ghost" className="mt-2 w-full justify-start px-0 text-primary hover:bg-transparent hover:underline" asChild><Link href="/app/expenses">View expense ledger <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button></CardContent></Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Quick actions</CardTitle><p className="mt-1 text-sm text-muted-foreground">Keep the daily workflow moving.</p></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"><Button variant="outline" className="h-auto justify-start gap-3 p-3" onClick={() => setOpenExpense(true)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Plus className="h-4 w-4" /></span><span className="text-left"><span className="block text-sm font-semibold">Record expense</span><span className="block text-xs font-normal text-muted-foreground">Add a grocery or fixed cost</span></span></Button><Button variant="outline" className="h-auto justify-start gap-3 p-3" onClick={() => setOpenMeal(true)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><Utensils className="h-4 w-4" /></span><span className="text-left"><span className="block text-sm font-semibold">Log today's meals</span><span className="block text-xs font-normal text-muted-foreground">Update counts by member</span></span></Button></CardContent></Card>
        <Card className="shadow-none"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">Activity</CardTitle><p className="mt-1 text-sm text-muted-foreground">A short audit trail for this cycle.</p></div><History className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent>{recentActivity.length ? recentActivity.map((entry) => <ActivityRow key={entry.id} title={entry.title} action={entry.action} createdAt={entry.createdAt} />) : <p className="py-4 text-sm text-muted-foreground">No activity recorded yet.</p>}</CardContent></Card>
      </section>

      <DashboardFab onOpenExpense={() => setOpenExpense(true)} onOpenMeal={() => setOpenMeal(true)} />
      <Dialog open={openExpense} onOpenChange={setOpenExpense}><DialogContent size="sm"><DialogHeader><DialogTitle>Add expense</DialogTitle><DialogDescription>Record a grocery, meal, or utility expense for this active cycle.</DialogDescription></DialogHeader><ExpenseForm mode="create" onClose={() => setOpenExpense(false)} /></DialogContent></Dialog>
      <Dialog open={openMeal} onOpenChange={setOpenMeal}><DialogContent size="sm"><DialogHeader><DialogTitle>Log meals</DialogTitle><DialogDescription>Update meal counts for each member for the selected date.</DialogDescription></DialogHeader><MealCountEditor members={members} mealLogs={mealLogs} onClose={() => setOpenMeal(false)} /></DialogContent></Dialog>
      <Dialog open={Boolean(depositMember)} onOpenChange={(open) => !open && setDepositMember(null)}><DialogContent size="sm"><DialogHeader><DialogTitle>Update deposit</DialogTitle><DialogDescription>Use the Members page to add or deduct a deposit for {depositMember?.name}.</DialogDescription></DialogHeader><Button asChild onClick={() => setDepositMember(null)}><Link href="/app/members">Open members</Link></Button></DialogContent></Dialog>
    </div>
  );
}

export default ManagerDashboard;
