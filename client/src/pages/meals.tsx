import { useMemo, useState } from 'react';
import { useMeal } from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Utensils, UtensilsCrossed, Calendar as CalendarIcon, Users, Play, Settings2 } from 'lucide-react';
import { format, eachDayOfInterval, parseISO, min, max, startOfDay } from 'date-fns';
import { Link } from 'wouter';
import { SyncBadge } from '@/components/sync-badge';
import { MealCountEditor } from '@/components/meal-count-editor';
import { MealLogTable } from '@/components/meal-log-table';

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

export default function Meals() {
  const { members, mealLogs, activeCycle } = useMeal();
  const { canOperateMeals } = useAuth();
  const [openMeal, setOpenMeal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const today = startOfDay(new Date());

  let days: Date[] = [];

  if (mealLogs.length > 0) {
    const logDates = mealLogs.map(l => startOfDay(parseISO(l.date)));
    const startDate = min(logDates);
    const endDate = max([...logDates, today]);
    days = eachDayOfInterval({ start: startDate, end: endDate }).reverse();
  } else {
    days = [today];
  }

  const todayKey = format(today, 'yyyy-MM-dd');
  const todayTotalMeals = useMemo(
    () => mealLogs.filter((log) => log.date === todayKey).reduce((sum, log) => sum + log.count, 0),
    [mealLogs, todayKey],
  );
  const cycleTotalMeals = useMemo(
    () => mealLogs.reduce((sum, log) => sum + log.count, 0),
    [mealLogs],
  );

  const openEditorForDate = (day: Date) => {
    setSelectedDate(day);
    setOpenMeal(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Utensils className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">Meal Logs</h1>
              <p className="hidden sm:block mt-1 text-sm leading-6 text-muted-foreground">
                Log daily member meals and view consumption records.
              </p>
            </div>
          </div>
          {canOperateMeals ? (
            <Dialog
              open={openMeal}
              onOpenChange={(open) => {
                setOpenMeal(open);
                if (!open) {
                  setSelectedDate(undefined);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0 shadow-sm sm:h-9"
                  onClick={() => setSelectedDate(undefined)}
                  disabled={members.length === 0 || !activeCycle}
                >
                  <Utensils className="h-4 w-4" />
                  <span className="hidden sm:inline">Log </span>Meals
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {selectedDate ? `Edit Meals for ${format(selectedDate, 'PPP')}` : 'Log Meals by Date'}
                  </DialogTitle>
                </DialogHeader>
                <MealCountEditor
                  members={members}
                  mealLogs={mealLogs}
                  initialDate={selectedDate}
                  onClose={() => {
                    setOpenMeal(false);
                    setSelectedDate(undefined);
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </header>

      {activeCycle && members.length > 0 && mealLogs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Today's Meals */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 sm:h-12 sm:w-12">
              <Utensils className="h-5 w-5 text-emerald-600 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">Today&apos;s Meals</p>
              <p className="mt-0.5 font-heading text-2xl font-bold leading-none sm:text-3xl">{formatMealCount(todayTotalMeals)}</p>
            </div>
          </div>

          {/* Total Meals */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 sm:h-12 sm:w-12">
              <UtensilsCrossed className="h-5 w-5 text-teal-600 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Meals</p>
              <p className="mt-0.5 font-heading text-2xl font-bold leading-none sm:text-3xl">{formatMealCount(cycleTotalMeals)}</p>
            </div>
          </div>
        </div>
      )}

      {!activeCycle ? (
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[350px] animate-in fade-in-50 duration-300">
          <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary">
            <Play className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground">No Active Cycle</h3>
          <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">
            You must start an active cycle before logging meals.
          </p>
          <Link href="/app/settings">
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold">
              <Plus className="h-4 w-4" />
              Start New Cycle
            </Button>
          </Link>
        </Card>
      ) : members.length === 0 ? (
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[350px] animate-in fade-in-50 duration-300">
          <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary">
            <Users className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground">No members to log meals</h3>
          <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">
            You must add mess members before you can start logging their daily meals.
          </p>
          <Link href="/app/members">
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold">
              <Plus className="h-4 w-4" />
              Add Members First
            </Button>
          </Link>
        </Card>
      ) : mealLogs.length === 0 ? (
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[350px] animate-in fade-in-50 duration-300">
          <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary">
            <Utensils className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground">No meals logged yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">
            Keep track of daily meal counts for each member. The app will calculate the current meal rate automatically.
          </p>
          {canOperateMeals ? (
            <Button
              className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
              onClick={() => setOpenMeal(true)}
            >
              <Utensils className="h-4 w-4" />
              Log First Daily Meal
            </Button>
          ) : null}
        </Card>
      ) : (
        <MealLogTable members={members} mealLogs={mealLogs} days={days}
          onDayClick={canOperateMeals ? openEditorForDate : undefined}
          renderLog={(log) => <><span>{formatMealCount(log.count)}</span><SyncBadge itemId={log.id!} className="[&>span:last-child]:hidden px-1 py-0" /></>}
        />
      )}
    </div>
  );
}
