import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BellRing,
  ChefHat,
  KeyRound,
  Loader2,
  Megaphone,
  Share2,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { eachDayOfInterval, format, isSameDay, max, min, parseISO, startOfDay } from "date-fns";
import { useLocation } from "wouter";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePushNotifications } from "@/lib/push-notifications";
import { useMarqueeDuration } from "@/hooks/use-marquee-duration";
import { cn } from "@/lib/utils";
import { MealLogTable } from "@/components/meal-log-table";

const LAST_SHARED_MEAL_CODE_KEY = "mealtrack:last-shared-meal-code";
const SWITCH_SHARED_MEAL_CODE_KEY = "mealtrack:switch-shared-meal-code";

type SharedMember = {
  id: string;
  name: string;
  deposit: number;
  avatar: string;
  mealsEaten: number;
  mealCost: number;
  fixedCost: number;
  totalCost: number;
  balance: number;
};

type SharedExpense = {
  id: string;
  amount: number;
  description: string;
  type: "meal" | "fixed";
  date: string;
  paidBy: string;
};

type SharedMealLog = {
  id: string;
  date: string;
  memberId: string;
  count: number;
};

type SharedPayload = {
  cycle: {
    id: string;
    name: string;
    status: "active" | "pending" | "closed";
    closedAt?: string | null;
  };
  stats: {
    totalDeposits: number;
    totalMealExpenses: number;
    totalFixedExpenses: number;
    totalMealsConsumed: number;
    currentMealRate: number;
    fixedCostPerMember: number;
    remainingCash: number;
  };
  members: SharedMember[];
  expenses: SharedExpense[];
  mealLogs: SharedMealLog[];
  activeNotice: {
    id: string;
    title: string;
    content: string;
    expiresAt: string;
  } | null;
};

function formatCurrency(amount: number) {
  return `\u09F3${amount.toFixed(2)}`;
}

function formatBalance(amount: number) {
  return `\u09F3${Math.round(Math.abs(amount))}`;
}

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

function formatCycleStatus(status: SharedPayload["cycle"]["status"]) {
  if (status === "active") return "Active";
  if (status === "pending") return "Pending";
  return "Closed";
}

function getMealCodeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "This Meal Code is invalid or sharing is disabled. Ask the manager for a valid code.";
}

function SectionEmptyState({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center px-4 py-10 text-center">
        <div className="mb-3 rounded-full bg-emerald-50 p-3 text-emerald-600">
          {icon}
        </div>
        <p className="font-heading text-lg font-bold text-slate-900">{title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

function NoticeTicker({ notice }: { notice: NonNullable<SharedPayload["activeNotice"]> }) {
  const text = `${notice.title}: ${notice.content}`;
  const { targetRef, duration } = useMarqueeDuration(text);

  const renderTickerItems = (group: string) =>
    Array.from({ length: 10 }, (_, index) => (
      <span key={`${group}-${index}`} className="notice-ticker-item">
        {text}
      </span>
    ));

  return (
    <div
      className="flex overflow-hidden border-y border-amber-200 bg-amber-50 text-amber-950"
      aria-live="polite"
      aria-label={`Notice: ${notice.title}`}
    >
      <div className="z-10 flex shrink-0 items-center gap-2 border-r border-amber-200 bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-900 shadow-[8px_0_18px_-16px_rgba(120,53,15,0.8)]">
        <Megaphone className="h-4 w-4" />
        Notice
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden py-2.5">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-amber-50 to-transparent" />
        <div
          className="notice-ticker-track pl-10 text-sm font-medium"
          style={duration ? { animationDuration: `${duration}s` } : undefined}
        >
          <div ref={targetRef} className="notice-ticker-group">{renderTickerItems("primary")}</div>
          <div className="notice-ticker-group" aria-hidden="true">
            {renderTickerItems("copy")}
          </div>
        </div>
      </div>
    </div>
  );
}

function SharedNoticeNotificationButton({ token }: { token: string }) {
  const {
    supported,
    status,
    hasSubscription,
    working,
    subscribe,
    unsubscribe,
  } = usePushNotifications({ mode: "shared", shareToken: token });

  if (!supported || status === "denied") {
    return null;
  }

  const handleClick = () => {
    if (hasSubscription) {
      void unsubscribe();
      return;
    }

    void subscribe();
  };

  return (
    <Button
      type="button"
      variant={hasSubscription ? "secondary" : "outline"}
      size="sm"
      className="gap-2"
      onClick={handleClick}
      disabled={working}
      title={hasSubscription ? "Disable notice notifications" : "Enable notice notifications"}
    >
      <BellRing className={cn("h-4 w-4", hasSubscription && "text-primary")} />
      <span className="hidden sm:inline">
        {hasSubscription ? "Notices On" : "Notify Me"}
      </span>
    </Button>
  );
}

function getExpenseEmptyState(tab: "all" | "meal" | "fixed") {
  if (tab === "meal") {
    return {
      title: "No meal expenses yet",
      message: "Meal grocery or food expenses will appear here after the manager adds them.",
    };
  }

  if (tab === "fixed") {
    return {
      title: "No fixed expenses yet",
      message: "Shared bills or fixed costs will appear here after the manager adds them.",
    };
  }

  return {
    title: "No expenses yet",
    message: "This cycle does not have any shared expenses yet. Check back after the manager adds expenses.",
  };
}

function SharedDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-44" />
            </div>
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36 rounded-lg xl:col-span-2" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </section>
        <Skeleton className="h-80 rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Loading shared dashboard...
        </p>
      </div>
    </div>
  );
}

export function SharedAccessPage() {
  const [, setLocation] = useLocation();
  const [mealCode, setMealCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedMealCode = window.localStorage.getItem(LAST_SHARED_MEAL_CODE_KEY) ?? "";
    const shouldSwitchCode = window.sessionStorage.getItem(SWITCH_SHARED_MEAL_CODE_KEY) === "true";

    if (!savedMealCode) {
      return;
    }

    setMealCode(savedMealCode);

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    if (isStandalone && !shouldSwitchCode) {
      setLocation(`/shared/${savedMealCode}`);
    }
  }, [setLocation]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = mealCode.trim();

    if (!normalizedCode) {
      setError("Enter the Meal Code shared by the manager.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/share/${encodeURIComponent(normalizedCode)}`);
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.message || "This Meal Code is invalid or sharing is disabled. Ask the manager for a valid code.");
      }

      window.localStorage.setItem(LAST_SHARED_MEAL_CODE_KEY, normalizedCode);
      window.sessionStorage.removeItem(SWITCH_SHARED_MEAL_CODE_KEY);
      setLocation(`/shared/${normalizedCode}`);
    } catch (caughtError) {
      setError(getMealCodeErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eefcf6_100%)] px-4 py-8">
      <div className="absolute right-4 top-4">
        <PwaInstallButton
          appId="shared"
          appName="MealTrack Shared"
          className="gap-1.5 bg-white/80 px-3 text-xs shadow-sm hover:bg-white"
        />
      </div>
      <Card className="w-full max-w-md overflow-hidden border-none shadow-2xl shadow-emerald-100/70">
        <CardHeader className="space-y-5 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
            <ChefHat className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">
              Shared View
            </p>
            <CardTitle className="font-heading text-3xl">Enter Access Code</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Use the Meal Code shared by the manager to open the shared view.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="meal-code" className="text-sm font-medium">
                Access Code
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="meal-code"
                  value={mealCode}
                  onChange={(event) => {
                    setMealCode(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="Paste or type access code"
                  className="pl-9"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={loading}
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Enter an access code to view the latest shared meal-cycle data.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking code...
                </>
              ) : (
                "Open Shared View"
              )}
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            If the code does not work, ask the manager to confirm sharing is enabled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SharedPage({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState<"all" | "single">("all");
  const [selectedMemberId, setSelectedMemberId] = useState("");

  const handleSwitchCode = () => {
    window.sessionStorage.setItem(SWITCH_SHARED_MEAL_CODE_KEY, "true");
    setLocation("/shared");
  };

  useEffect(() => {
    let active = true;

    const loadSharedData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/share/${token}`);
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(body?.message || "Unable to load shared dashboard.");
        }

        if (active) {
          window.localStorage.setItem(LAST_SHARED_MEAL_CODE_KEY, token);
          setData(body as SharedPayload);
        }
      } catch (caughtError) {
        if (!active) {
          return;
        }

        const nextError =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load shared dashboard.";
        setError(nextError);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadSharedData();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const events = new EventSource(`/api/share/${encodeURIComponent(token)}/events`);

    const handleNoticeUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as Pick<SharedPayload, "activeNotice">;
        setData((currentData) =>
          currentData
            ? {
                ...currentData,
                activeNotice: payload.activeNotice,
              }
            : currentData,
        );
      } catch (caughtError) {
        console.error("Error parsing notice update:", caughtError);
      }
    };

    const handleSharedDataUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { data: SharedPayload | null };

        if (!payload.data) {
          setError("No active or pending cycle is available for this shared view yet.");
          return;
        }

        setError(null);
        setData(payload.data);
      } catch (caughtError) {
        console.error("Error parsing shared data update:", caughtError);
      }
    };

    events.addEventListener("notice", handleNoticeUpdate);
    events.addEventListener("shared-data", handleSharedDataUpdate);

    return () => {
      events.removeEventListener("notice", handleNoticeUpdate);
      events.removeEventListener("shared-data", handleSharedDataUpdate);
      events.close();
    };
  }, [token]);

  useEffect(() => {
    if (!data?.members.length) {
      setSelectedMemberId("");
      setSummaryMode("all");
      return;
    }

    setSelectedMemberId((currentMemberId) => {
      if (data.members.some((member) => member.id === currentMemberId)) {
        return currentMemberId;
      }

      return data.members[0].id;
    });
  }, [data?.members]);

  useEffect(() => {
    if (!data?.activeNotice) {
      return;
    }

    const delay = parseISO(data.activeNotice.expiresAt).getTime() - Date.now();

    if (delay <= 0) {
      setData((currentData) =>
        currentData
          ? {
              ...currentData,
              activeNotice: null,
            }
          : currentData,
      );
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setData((currentData) => {
        if (!currentData || currentData.activeNotice?.id !== data.activeNotice?.id) {
          return currentData;
        }

        return {
          ...currentData,
          activeNotice: null,
        };
      });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [data?.activeNotice]);

  const days = useMemo(() => {
    if (!data || data.mealLogs.length === 0) {
      return [startOfDay(new Date())];
    }

    const logDates = data.mealLogs.map((log) => startOfDay(parseISO(log.date)));
    const startDate = min(logDates);
    const endDate =
      data.cycle.status === "active"
        ? max([...logDates, startOfDay(new Date())])
        : max(logDates);
    return eachDayOfInterval({ start: startDate, end: endDate }).reverse();
  }, [data]);

  const memberMealTotals = useMemo(() => {
    if (!data) {
      return new Map<string, number>();
    }

    const totals = new Map<string, number>();

    for (const member of data.members) {
      totals.set(member.id, 0);
    }

    for (const log of data.mealLogs) {
      totals.set(log.memberId, (totals.get(log.memberId) ?? 0) + log.count);
    }

    return totals;
  }, [data]);

  const visibleSummaryMembers = useMemo(() => {
    if (!data) {
      return [];
    }

    if (summaryMode === "single") {
      const selectedMember = data.members.find((member) => member.id === selectedMemberId);
      return selectedMember ? [selectedMember] : [];
    }

    return data.members;
  }, [data, selectedMemberId, summaryMode]);

  if (loading) {
    return <SharedDashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-emerald-600" />
              Shared Dashboard Unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {error || "This shared link is invalid or sharing is disabled."}
            </p>
            <p className="text-sm text-muted-foreground">
              Ask the manager for a fresh shared link or Meal Code if you still need access.
            </p>
            <Button variant="outline" className="gap-2" onClick={handleSwitchCode}>
              <ArrowLeftRight className="h-4 w-4" />
              Switch Code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                Shared View
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="font-heading text-lg font-bold leading-tight text-slate-900 sm:text-xl">
                  {data.cycle.name}
                </h1>
                <p className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {formatCycleStatus(data.cycle.status)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <SharedNoticeNotificationButton token={token} />
            <PwaInstallButton
              appId="shared"
              appName="MealTrack Shared"
              className="gap-1.5"
            />
            <Button variant="outline" size="sm" className="gap-2" onClick={handleSwitchCode}>
              <ArrowLeftRight className="h-4 w-4" />
              Switch Code
            </Button>
          </div>
        </div>
      </div>

      {/* Notice ticker — shown below header when there is an active notice */}
      {data.activeNotice && <NoticeTicker notice={data.activeNotice} />}

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-none bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide text-emerald-100">
                Remaining Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-heading font-bold">
                {formatCurrency(data.stats.remainingCash)}
              </div>
              <p className="mt-2 text-sm text-emerald-100">
                {formatCurrency(data.stats.totalDeposits)} collected in total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm uppercase text-muted-foreground">
                <UtensilsCrossed className="h-4 w-4 text-emerald-500" />
                Meal Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-heading font-bold">
                {formatCurrency(data.stats.currentMealRate)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Fixed cost/person: {formatCurrency(data.stats.fixedCostPerMember)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase text-muted-foreground">
                Totals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meals</span>
                <span className="font-medium">{formatMealCount(data.stats.totalMealsConsumed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meal Cost</span>
                <span className="font-medium">
                  {formatCurrency(data.stats.totalMealExpenses)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fixed Cost</span>
                <span className="font-medium">
                  {formatCurrency(data.stats.totalFixedExpenses)}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-emerald-500" />
            <h2 className="text-xl font-heading font-bold">Meal Logs</h2>
          </div>
          {data.mealLogs.length === 0 ? (
            <SectionEmptyState
              icon={<UtensilsCrossed className="h-6 w-6" />}
              title="No meal logs yet"
              message="The manager has not logged meals for this cycle yet. Meal counts will appear here after the first daily log is saved."
            />
          ) : (
            <>
            <MealLogTable
              members={data.members}
              mealLogs={data.mealLogs}
              days={days}
              maxHeight="max-h-[480px]"
              tintedRows
              totalMeals={data.stats.totalMealsConsumed}
            />
            </>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-500" />
              <h2 className="text-xl font-heading font-bold">Members Summary</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:w-[26rem]">
              <Select value={summaryMode} onValueChange={(value: "all" | "single") => setSummaryMode(value)}>
                <SelectTrigger aria-label="Choose summary mode">
                  <SelectValue placeholder="Summary mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="single">Single Member</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={selectedMemberId}
                onValueChange={setSelectedMemberId}
                disabled={summaryMode !== "single" || data.members.length === 0}
              >
                <SelectTrigger aria-label="Choose member">
                  <SelectValue placeholder="Choose member" />
                </SelectTrigger>
                <SelectContent>
                  {data.members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3 md:hidden">
            {visibleSummaryMembers.map((member) => (
              <Card key={member.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-8 w-8 text-xs">
                      <AvatarFallback>{member.avatar}</AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium">{member.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-secondary/30 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Deposit</p>
                      <p className="font-medium">{formatCurrency(member.deposit)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/30 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Deposit - Fixed</p>
                      <p className="font-medium">{formatCurrency(member.deposit - member.fixedCost)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/30 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Meal Cost</p>
                      <p className="font-medium">{formatCurrency(member.mealCost)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/30 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {member.balance < 0 ? "Due" : "Refund"}
                      </p>
                      <p
                        className={cn(
                          "font-medium",
                          member.balance >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {member.balance >= 0 ? "+" : "-"}
                        {formatBalance(member.balance)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-lg border bg-card shadow-sm md:block">
            <div className="overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-card">
                  <tr className="border-b">
                    <th className="p-4 text-left font-bold">Member</th>
                    <th className="p-4 text-right font-bold">Deposit</th>
                    <th className="p-4 text-right font-bold">Deposit - Fixed</th>
                    <th className="p-4 text-right font-bold">Meal Cost</th>
                    <th className="p-4 text-right font-bold">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleSummaryMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/50">
                      <td className="p-4 font-medium">
                        {member.name}
                      </td>
                      <td className="p-4 text-right font-medium">
                        {formatCurrency(member.deposit)}
                      </td>
                      <td className="p-4 text-right font-medium">
                        {formatCurrency(member.deposit - member.fixedCost)}
                      </td>
                      <td className="p-4 text-right font-medium">
                        {formatCurrency(member.mealCost)}
                      </td>
                      <td
                        className={cn(
                          "p-4 text-right font-bold",
                          member.balance >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {member.balance >= 0 ? "+" : "-"}
                        {formatBalance(member.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-emerald-500" />
            <h2 className="text-xl font-heading font-bold">Expenses</h2>
          </div>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="meal">Meals</TabsTrigger>
              <TabsTrigger value="fixed">Fixed</TabsTrigger>
            </TabsList>

            {(["all", "meal", "fixed"] as const).map((tab) => {
              const expenses =
                tab === "all"
                  ? [...data.expenses]
                  : data.expenses.filter((expense) => expense.type === tab);
              const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
              const useScrollableExpenseList = expenses.length > 8;
              const emptyState = getExpenseEmptyState(tab);

              return (
                <TabsContent key={tab} value={tab} className="m-0">
                  <div className="space-y-3">
                    {expenses.length === 0 ? (
                      <SectionEmptyState
                        icon={<ShoppingBag className="h-6 w-6" />}
                        title={emptyState.title}
                        message={emptyState.message}
                      />
                    ) : (
                      <>
                        <div
                          className={cn(
                            "space-y-3",
                            useScrollableExpenseList &&
                              "max-h-[420px] overflow-y-auto rounded-lg border border-dashed bg-muted/10 p-2 sm:max-h-[460px] md:max-h-[540px]",
                          )}
                        >
                          {expenses.map((expense) => (
                            <div
                              key={expense.id}
                              className="flex items-center justify-between rounded-lg border bg-card p-4"
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={cn(
                                    "rounded-full p-2",
                                    expense.type === "meal"
                                      ? "bg-emerald-100 text-emerald-600"
                                      : "bg-slate-100 text-slate-600",
                                  )}
                                >
                                  {expense.type === "meal" ? (
                                    <ShoppingBag className="h-5 w-5" />
                                  ) : (
                                    <Zap className="h-5 w-5" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium">{expense.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(expense.date), "MMM d, yyyy")} • Paid by {expense.paidBy}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-heading font-bold">
                                  {formatCurrency(expense.amount)}
                                </p>
                                <Badge variant="secondary" className="text-[10px] uppercase">
                                  {expense.type}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Card className="border-dashed">
                          <CardContent className="flex items-center justify-between py-4">
                            <span className="text-sm font-medium text-muted-foreground">Total</span>
                            <span className="font-heading text-xl font-bold">
                              {formatCurrency(total)}
                            </span>
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </section>
      </div>
    </div>
  );
}
