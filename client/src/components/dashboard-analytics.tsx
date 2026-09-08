import { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Layers,
  Lightbulb,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useMeal, type CycleDeposit, type Expense, type MealLog } from '@/lib/meal-context';

const CHART_COLORS = {
  meal: '#10b981',
  fixed: '#8b5cf6',
  deposits: '#06b6d4',
  expenses: '#f43f5e',
};

const currency = (value: number) => `৳${Math.round(value).toLocaleString()}`;
const preciseCurrency = (value: number) => `৳${value.toFixed(2)}`;
const mealCount = (value: number) => `${Math.round(value * 1000) / 1000}`;

type PeriodRow = {
  key: string;
  label: string;
  meal: number;
  fixed: number;
  deposits: number;
  expenses: number;
  meals: number;
};

type RateRow = {
  key: string;
  label: string;
  rawRate: number | null;
  rate: number | null;
  cumulativeExpenses: number;
  cumulativeMeals: number;
};

type InsightTone = 'positive' | 'warning' | 'attention' | 'neutral';
type Insight = { icon: typeof Info; title: string; detail: string; tone: InsightTone };

function dateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return format(new Date(value), 'yyyy-MM-dd');
}

function localDate(key: string) {
  return parseISO(`${key}T00:00:00`);
}

function buildDateKeys(startedAt: string) {
  const startKey = dateKey(startedAt);
  const start = localDate(startKey);
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (start > end) return [startKey];
  return Array.from({ length: differenceInCalendarDays(end, start) + 1 }, (_, index) =>
    dateKey(addDays(start, index).toISOString())
  );
}

function aggregatePeriods(dateKeys: string[], expenses: Expense[], deposits: CycleDeposit[], mealLogs: MealLog[]) {
  const weekly = dateKeys.length > 30;
  const rows = new Map<string, PeriodRow>();
  const periodKey = (key: string) =>
    weekly ? dateKey(startOfWeek(localDate(key), { weekStartsOn: 1 }).toISOString()) : key;
  const periodLabel = (key: string) =>
    weekly
      ? `${format(localDate(key), 'MMM d')}–${format(addDays(localDate(key), 6), 'MMM d')}`
      : format(localDate(key), 'MMM d');

  for (const key of dateKeys) {
    const bucket = periodKey(key);
    if (!rows.has(bucket)) {
      rows.set(bucket, {
        key: bucket,
        label: periodLabel(bucket),
        meal: 0,
        fixed: 0,
        deposits: 0,
        expenses: 0,
        meals: 0,
      });
    }
  }
  for (const item of expenses) {
    const bucket = periodKey(dateKey(item.date));
    const row = rows.get(bucket);
    if (!row) continue;
    row[item.type] += item.amount;
    row.expenses += item.amount;
  }
  for (const item of deposits) {
    const bucket = periodKey(dateKey(item.createdAt));
    const row = rows.get(bucket);
    if (row) row.deposits += item.amount;
  }
  for (const item of mealLogs) {
    const bucket = periodKey(dateKey(item.date));
    const row = rows.get(bucket);
    if (row) row.meals += item.count;
  }
  return {
    rows: Array.from(rows.values()).sort((a, b) => a.key.localeCompare(b.key)),
    weekly,
  };
}

function buildRateSeries(dateKeys: string[], expenses: Expense[], mealLogs: MealLog[]): RateRow[] {
  const expensesByDay = new Map<string, number>();
  const mealsByDay = new Map<string, number>();
  expenses
    .filter((item) => item.type === 'meal')
    .forEach((item) => expensesByDay.set(dateKey(item.date), (expensesByDay.get(dateKey(item.date)) ?? 0) + item.amount));
  mealLogs.forEach((item) => mealsByDay.set(item.date, (mealsByDay.get(item.date) ?? 0) + item.count));

  let cumulativeExpenses = 0;
  let cumulativeMeals = 0;

  const rawRows = dateKeys.map((key) => {
    cumulativeExpenses += expensesByDay.get(key) ?? 0;
    cumulativeMeals += mealsByDay.get(key) ?? 0;
    const rawRate = cumulativeMeals > 0 ? cumulativeExpenses / cumulativeMeals : null;
    return {
      key,
      label: format(localDate(key), 'MMM d'),
      rawRate,
      rate: rawRate,
      cumulativeExpenses,
      cumulativeMeals,
    };
  });

  // Outlier smoothing: when meals are minimal on Day 1-3, rates can spike to >3x the eventual average.
  // We identify the stabilized rate and clamp initial wild spikes for visual clarity while keeping accurate latest rate.
  const validRates = rawRows.filter((r) => r.rawRate !== null && r.cumulativeMeals >= 5);
  const benchmarkRate = validRates.length > 0 ? validRates[validRates.length - 1].rawRate! : null;

  return rawRows.map((row) => {
    if (row.rawRate === null) return row;
    if (benchmarkRate && row.cumulativeMeals < 5 && row.rawRate > benchmarkRate * 2.5) {
      // Clamp smoothed display rate to max 2.2x benchmark for the initial few meals so chart stays readable
      return { ...row, rate: Math.min(row.rawRate, benchmarkRate * 2.2) };
    }
    return row;
  });
}

function CustomTooltip({
  active,
  payload,
  label,
  kind,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  kind: 'rate' | 'expense' | 'cash';
}) {
  if (!active || !payload?.length) return null;
  const names: Record<string, string> = {
    meal: 'Meal Expenses',
    fixed: 'Fixed Expenses',
    deposits: 'Total Deposits',
    expenses: 'Total Expenses',
    rate: 'Effective Meal Rate',
    rawRate: 'Actual Rate',
  };

  return (
    <div className="min-w-[190px] rounded-xl border border-border/80 bg-popover/95 p-3.5 text-xs shadow-2xl backdrop-blur-md">
      <p className="mb-2.5 font-semibold text-foreground border-b pb-1.5 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {names[entry.dataKey ?? entry.name ?? ''] ?? entry.name}
            </span>
            <span className="font-bold text-foreground">
              {kind === 'rate' ? preciseCurrency(entry.value ?? 0) : currency(entry.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
      {kind === 'cash' && (
        <p className="mt-2.5 border-t pt-1.5 text-[10px] text-muted-foreground italic">Period financial activity</p>
      )}
    </div>
  );
}

function EmptyChart({ message, subtext }: { message: string; subtext?: string }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center">
      <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
        <BarChart3 className="h-5 w-5 opacity-60" />
      </div>
      <p className="text-sm font-semibold text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtext || 'Add meal and expense logs to unlock analytics.'}</p>
    </div>
  );
}

function insightClasses(tone: InsightTone) {
  return {
    positive: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 dark:border-emerald-500/20',
    warning: 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300 dark:border-amber-500/20',
    attention: 'border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300 dark:border-rose-500/20',
    neutral: 'border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300 dark:border-sky-500/20',
  }[tone];
}

function buildInsights(
  rateSeries: RateRow[],
  periods: PeriodRow[],
  expenses: Expense[],
  mealLogs: MealLog[],
  members: Array<{ balance: number }>,
  stats: { totalDeposits: number; remainingCash: number; totalMealExpenses: number; totalFixedExpenses: number; currentMealRate: number }
): Insight[] {
  const insights: Insight[] = [];
  const validRates = rateSeries.filter((item) => item.rawRate !== null);

  if (validRates.length >= 2) {
    const current = validRates[validRates.length - 1].rawRate ?? 0;
    const previous = validRates[validRates.length - 2].rawRate ?? current;
    const change = previous ? ((current - previous) / previous) * 100 : 0;
    if (Math.abs(change) >= 0.5) {
      insights.push({
        icon: change > 0 ? TrendingUp : TrendingDown,
        title: `Meal rate ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}%`,
        detail: `Currently ৳${current.toFixed(2)}/meal compared to ৳${previous.toFixed(2)} previous period.`,
        tone: change > 0 ? 'warning' : 'positive',
      });
    } else {
      insights.push({
        icon: CheckCircle2,
        title: 'Meal rate is steady',
        detail: `Stabilized around ৳${current.toFixed(2)} per meal across recent days.`,
        tone: 'positive',
      });
    }
  }

  const busiest = periods.reduce<PeriodRow | null>((best, row) => (!best || row.meals > best.meals ? row : best), null);
  if (busiest && busiest.meals > 0) {
    insights.push({
      icon: Utensils,
      title: 'Peak meal consumption',
      detail: `${mealCount(busiest.meals)} meals consumed on ${busiest.label}.`,
      tone: 'neutral',
    });
  }

  const highestSpend = periods.reduce<PeriodRow | null>((best, row) => (!best || row.expenses > best.expenses ? row : best), null);
  if (highestSpend && highestSpend.expenses > 0) {
    insights.push({
      icon: CircleDollarSign,
      title: 'Top spending period',
      detail: `${currency(highestSpend.expenses)} recorded on ${highestSpend.label}.`,
      tone: 'warning',
    });
  }

  const totalExpenses = stats.totalMealExpenses + stats.totalFixedExpenses;
  if (totalExpenses > 0) {
    const fixedPct = Math.round((stats.totalFixedExpenses / totalExpenses) * 100);
    insights.push({
      icon: PiggyBank,
      title: `Expense breakdown: ${100 - fixedPct}% meal / ${fixedPct}% fixed`,
      detail: `Fixed utilities account for ${currency(stats.totalFixedExpenses)} of total spend.`,
      tone: fixedPct > 35 ? 'warning' : 'positive',
    });
  }

  const outstanding = members.filter((member) => member.balance < 0).length;
  if (outstanding > 0) {
    insights.push({
      icon: Wallet,
      title: `${outstanding} member${outstanding === 1 ? '' : 's'} with due balance`,
      detail: 'Collect pending deposits to maintain a healthy cash reserve in hand.',
      tone: 'attention',
    });
  }

  return insights.slice(0, 4);
}

export function DashboardAnalytics() {
  const { activeCycle, stats, expenses, deposits, mealLogs, members, getMemberStats } = useMeal();
  const [cashMode, setCashMode] = useState<'daily' | 'cumulative'>('cumulative');
  const [viewFilter, setViewFilter] = useState<'all' | 'costs' | 'cash'>('all');

  const dateKeys = useMemo(() => (activeCycle ? buildDateKeys(activeCycle.startedAt) : []), [activeCycle]);
  const rateSeries = useMemo(() => buildRateSeries(dateKeys, expenses, mealLogs), [dateKeys, expenses, mealLogs]);
  const { rows: periods, weekly } = useMemo(
    () => aggregatePeriods(dateKeys, expenses, deposits, mealLogs),
    [dateKeys, expenses, deposits, mealLogs]
  );
  const memberBalances = useMemo(() => members.map((m) => getMemberStats(m.id)), [members, getMemberStats]);
  const insights = useMemo(
    () => buildInsights(rateSeries, periods, expenses, mealLogs, memberBalances, stats),
    [rateSeries, periods, expenses, mealLogs, memberBalances, stats]
  );

  const validRates = rateSeries.filter((item) => item.rawRate !== null);
  const minRate = validRates.length ? Math.min(...validRates.map((r) => r.rawRate!)) : 0;
  const maxRate = validRates.length ? Math.max(...validRates.map((r) => r.rawRate!)) : 0;

  const totalCycleExpenses = stats.totalMealExpenses + stats.totalFixedExpenses;
  const pieData = [
    { name: 'Meal Expenses', value: stats.totalMealExpenses, color: CHART_COLORS.meal },
    { name: 'Fixed Expenses', value: stats.totalFixedExpenses, color: CHART_COLORS.fixed },
  ].filter((item) => item.value > 0);

  let cumulativeDeposits = 0;
  let cumulativeExpenses = 0;
  const cashSeries = periods.map((row) => {
    cumulativeDeposits += row.deposits;
    cumulativeExpenses += row.expenses;
    return {
      ...row,
      deposits: cashMode === 'cumulative' ? cumulativeDeposits : row.deposits,
      expenses: cashMode === 'cumulative' ? cumulativeExpenses : row.expenses,
    };
  });

  if (!activeCycle) {
    return (
      <Card className="border border-dashed bg-card/60 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h3 className="mt-3 font-heading text-lg font-bold">Cycle Analytics</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Analytics, spending patterns, and cash flow will appear once a cycle is active.
        </p>
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      {/* Section Header with View Selector & Full Report Link */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">Cycle Analytics & Trends</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time meal rate velocity, expense patterns, and cash flow dynamics
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ToggleGroup
            type="single"
            value={viewFilter}
            onValueChange={(val) => val && setViewFilter(val as 'all' | 'costs' | 'cash')}
            className="rounded-lg border bg-muted/30 p-0.5"
          >
            <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:shadow-xs">
              <Layers className="mr-1 h-3 w-3" /> All
            </ToggleGroupItem>
            <ToggleGroupItem value="costs" className="h-7 px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:shadow-xs">
              <Utensils className="mr-1 h-3 w-3" /> Costs
            </ToggleGroupItem>
            <ToggleGroupItem value="cash" className="h-7 px-2.5 text-xs data-[state=on]:bg-card data-[state=on]:shadow-xs">
              <CircleDollarSign className="mr-1 h-3 w-3" /> Cash
            </ToggleGroupItem>
          </ToggleGroup>

          <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
            <Link href="/app/reports">
              Reports <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* 1. Meal Rate Trend */}
        {(viewFilter === 'all' || viewFilter === 'costs') && (
          <Card className="overflow-hidden border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-emerald-500" />
                  Meal Rate Trend
                </CardTitle>
                <p className="text-xs text-muted-foreground">Cumulative effective rate over the cycle</p>
              </div>
              {validRates.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md">
                  <span>Min: <strong className="text-foreground">{preciseCurrency(minRate)}</strong></span>
                  <span className="opacity-40">|</span>
                  <span>Max: <strong className="text-foreground">{preciseCurrency(maxRate)}</strong></span>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-2 pb-4 sm:px-4">
              {validRates.length ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rateSeries} margin={{ top: 12, right: 12, left: -4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mealRateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS.meal} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={CHART_COLORS.meal} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={46}
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        tickFormatter={(val) => `৳${Math.round(val)}`}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip content={<CustomTooltip kind="rate" />} />
                      <Area
                        type="monotone"
                        dataKey="rate"
                        name="Effective Rate"
                        stroke={CHART_COLORS.meal}
                        strokeWidth={2.5}
                        fill="url(#mealRateGradient)"
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart message="No meal rate data logged yet" />
              )}
            </CardContent>
          </Card>
        )}

        {/* 2. Expense Trend (Daily / Weekly) */}
        {(viewFilter === 'all' || viewFilter === 'costs') && (
          <Card className="overflow-hidden border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-violet-500" />
                  Expense Activity
                </CardTitle>
                <p className="text-xs text-muted-foreground">Meal vs fixed costs breakdown across timeline</p>
              </div>
              <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {weekly ? 'Weekly Buckets' : 'Daily'}
              </span>
            </CardHeader>
            <CardContent className="px-2 pb-4 sm:px-4">
              {periods.some((p) => p.expenses > 0) ? (
                <>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periods} margin={{ top: 12, right: 12, left: -4, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          minTickGap={24}
                          tick={{ fontSize: 11, fill: 'currentColor' }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={46}
                          tick={{ fontSize: 11, fill: 'currentColor' }}
                          className="text-muted-foreground"
                          tickFormatter={(val) => `৳${Math.round(val)}`}
                        />
                        <Tooltip content={<CustomTooltip kind="expense" />} />
                        <Bar
                          dataKey="meal"
                          name="Meal"
                          fill={CHART_COLORS.meal}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={18}
                        />
                        <Bar
                          dataKey="fixed"
                          name="Fixed"
                          fill={CHART_COLORS.fixed}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={18}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex justify-center gap-5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Meal Costs
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <i className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                      Fixed Costs
                    </span>
                  </div>
                </>
              ) : (
                <EmptyChart message="No expenses logged for this cycle" />
              )}
            </CardContent>
          </Card>
        )}

        {/* 3. Expense Distribution (Donut) */}
        {(viewFilter === 'all' || viewFilter === 'cash') && (
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-emerald-500" />
                Expense Allocation
              </CardTitle>
              <p className="text-xs text-muted-foreground">Where the mess cycle funds are distributed</p>
            </CardHeader>
            <CardContent className="grid items-center gap-4 sm:grid-cols-[1.1fr_1fr] pt-2">
              <div className="relative h-[220px]">
                {pieData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={64}
                          outerRadius={88}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => currency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Spent
                      </span>
                      <strong className="font-heading text-lg font-bold text-foreground">
                        {currency(totalCycleExpenses)}
                      </strong>
                    </div>
                  </>
                ) : (
                  <EmptyChart message="No expense data yet" />
                )}
              </div>

              <div className="space-y-3.5">
                {pieData.map((item) => {
                  const percentage = totalCycleExpenses > 0 ? (item.value / totalCycleExpenses) * 100 : 0;
                  return (
                    <div key={item.name} className="rounded-xl border border-border/50 bg-muted/20 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.name}
                        </span>
                        <span className="font-bold text-foreground">{currency(item.value)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%`, backgroundColor: item.color }}
                          />
                        </div>
                        <span className="font-semibold">{percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Cash Flow (Deposits vs Expenses) */}
        {(viewFilter === 'all' || viewFilter === 'cash') && (
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-cyan-500" />
                  Cash Flow Velocity
                </CardTitle>
                <p className="text-xs text-muted-foreground">Deposits collected vs Total expenses</p>
              </div>
              <ToggleGroup
                type="single"
                value={cashMode}
                onValueChange={(val) => val && setCashMode(val as 'daily' | 'cumulative')}
                className="rounded-lg bg-muted/50 p-0.5"
              >
                <ToggleGroupItem value="cumulative" className="h-6 px-2 text-[10px] font-medium">
                  Cumulative
                </ToggleGroupItem>
                <ToggleGroupItem value="daily" className="h-6 px-2 text-[10px] font-medium">
                  Period
                </ToggleGroupItem>
              </ToggleGroup>
            </CardHeader>
            <CardContent className="px-2 pb-4 sm:px-4">
              {periods.some((p) => p.deposits > 0 || p.expenses > 0) ? (
                <>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cashSeries} margin={{ top: 12, right: 12, left: -4, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          minTickGap={24}
                          tick={{ fontSize: 11, fill: 'currentColor' }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={46}
                          tick={{ fontSize: 11, fill: 'currentColor' }}
                          className="text-muted-foreground"
                          tickFormatter={(val) => `৳${Math.round(val)}`}
                        />
                        <Tooltip content={<CustomTooltip kind="cash" />} />
                        <Line
                          type="monotone"
                          dataKey="deposits"
                          name="Deposits"
                          stroke={CHART_COLORS.deposits}
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="expenses"
                          name="Expenses"
                          stroke={CHART_COLORS.expenses}
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex justify-center gap-5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <i className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                      Deposits In
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <i className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      Expenses Out
                    </span>
                  </div>
                </>
              ) : (
                <EmptyChart message="No deposits or expenses logged yet" />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Smart Intelligence / Insights */}
      {insights.length > 0 && (
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="pb-2.5">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Smart Cycle Insights
            </CardTitle>
            <p className="text-xs text-muted-foreground">Key signals and performance metrics computed from your active cycle data</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {insights.map((item) => (
                <div
                  key={`${item.title}-${item.detail}`}
                  className={`rounded-xl border p-3 transition-all duration-200 hover:shadow-xs ${insightClasses(item.tone)}`}
                >
                  <div className="flex items-start gap-2.5">
                    <item.icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-xs font-bold leading-snug">{item.title}</p>
                      <p className="mt-1 text-[11px] leading-relaxed opacity-85">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
