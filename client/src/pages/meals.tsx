import { useMemo, useState } from 'react';
import { useMealData } from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Utensils, UtensilsCrossed, Users, Play } from 'lucide-react';
import { format, eachDayOfInterval, parseISO, max, startOfDay } from 'date-fns';
import { Link } from 'wouter';
import { SyncBadge } from '@/components/sync-badge';
import { MealCountEditor } from '@/components/meal-count-editor';
import { MealLogTable } from '@/components/meal-log-table';
import { MealOffRequests } from '@/components/meal-off-requests';
import { PageHeader } from '@/components/page-header';

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

export default function Meals() {
  const { members, mealLogs, activeCycle } = useMealData();
  const { canOperateMeals, profile } = useAuth();
  const isMember = profile?.role === 'member';
  const [openMeal, setOpenMeal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const today = startOfDay(new Date());
  const todayKey = format(today, 'yyyy-MM-dd');
  const logDateBounds = mealLogs.reduce(
    (bounds, log) => ({
      start: bounds.start === null || log.date < bounds.start ? log.date : bounds.start,
      end: bounds.end === null || log.date > bounds.end ? log.date : bounds.end,
    }),
    { start: null as string | null, end: null as string | null },
  );
  const days = useMemo(() => {
    if (logDateBounds.start === null || logDateBounds.end === null) return [today];

    const startDate = startOfDay(parseISO(logDateBounds.start));
    const endDate = max([startOfDay(parseISO(logDateBounds.end)), today]);
    return eachDayOfInterval({ start: startDate, end: endDate }).reverse();
  }, [logDateBounds.start, logDateBounds.end, todayKey]);

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
      <PageHeader icon={Utensils} title="Meal Logs" description="Log daily member meals and view consumption records.">
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
                  className="ml-auto gap-1.5 shrink-0 shadow-sm sm:h-9"
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
                  <DialogDescription>Record meal counts for the selected date.</DialogDescription>
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
          {activeCycle && profile ? (
            <MealOffRequests
              activeCycleId={activeCycle.id}
              members={members}
              profile={profile}
              canOperateMeals={canOperateMeals}
            />
          ) : null}
      </PageHeader>

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
            {isMember ? <Utensils className="h-10 w-10 text-primary" /> : <Play className="h-10 w-10 text-primary animate-pulse" />}
          </div>
          <h3 className="font-heading text-lg font-bold text-foreground">{isMember ? 'Meal logs will appear here' : 'No Active Cycle'}</h3>
          <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">
            {isMember
              ? 'There is no active meal cycle right now. Ask your manager or coordinator to start one, and your meal records will appear here.'
              : 'You must start an active cycle before logging meals.'}
          </p>
          {!isMember ? (
            <Link href="/app/settings">
              <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold">
                <Plus className="h-4 w-4" />
                Start New Cycle
              </Button>
            </Link>
          ) : null}
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
