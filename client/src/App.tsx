import { useEffect, useRef, useState } from "react";
import { Route, Switch, useLocation, useRoute } from "wouter";
import { AlertTriangle, Bell, RefreshCw, X } from "lucide-react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { MealProvider, useMeal } from "@/lib/meal-context";
import { NoticeProvider } from "@/lib/notice-context";
import { OfflineToastManager } from "@/components/offline-toast";
import { supabase } from "@/lib/supabase";
import { usePushNotifications } from "@/lib/push-notifications";
import { getNotificationPreferences } from "@/lib/notification-preferences";
import { ErrorBoundary } from "@/components/error-boundary";
import AuthPage from "@/pages/auth";
import ChangelogPage from "@/pages/changelog";
import Dashboard from "@/pages/dashboard";
import Expenses from "@/pages/expenses";
import HistoryPage from "@/pages/history";
import ReportsPage from "@/pages/reports";
import Meals from "@/pages/meals";
import Members from "@/pages/members";
import OnboardingPage from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import Settings from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import SharedPage, { SharedAccessPage } from "@/pages/shared";
import InvitePage from "@/pages/invite";

function AppLoadingSkeleton({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r bg-card p-6 md:block">
          <div className="mb-8 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-2xl" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        </aside>
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Skeleton className="h-36 rounded-lg xl:col-span-2" />
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </div>
            <Skeleton className="h-72 rounded-lg" />
            <p className="text-center text-sm text-muted-foreground">{message}</p>
          </div>
        </main>
      </div>
    </div>
  );
}

function Router() {
  const { loading, dataError, retryLoadData } = useMeal();
  const [location] = useLocation();

  if (loading && !dataError) {
    return <AppLoadingSkeleton message="Loading your meal data..." />;
  }

  if (dataError) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
          <div className="mx-auto max-w-md text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold">Failed to load data</h2>
            <p className="text-sm text-muted-foreground">{dataError}</p>
            <Button onClick={retryLoadData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <ErrorBoundary key={location}>
        <Switch>
          <Route path="/app" component={Dashboard} />
          <Route path="/app/members" component={Members} />
          <Route path="/app/expenses" component={Expenses} />
          <Route path="/app/meals" component={Meals} />
          <Route path="/app/reports" component={ReportsPage} />
          <Route path="/app/history" component={HistoryPage} />
          <Route path="/app/changelog" component={ChangelogPage} />
          <Route path="/app/settings" component={Settings} />
          <Route path="/app/profile" component={ProfilePage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Layout>
  );
}

function NotificationOnboardingToast() {
  const { supported, permission, hasSubscription, working, subscribe } = usePushNotifications({ mode: "main" });
  const { user } = useAuth();
  const toastId = useRef<string | number | null>(null);
  const autoSubscribeAttemptedFor = useRef<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [toastDismissed, setToastDismissed] = useState(false);
  const dismissalKey = user ? `mealtrack:notification-onboarding-dismissed:${user.id}` : null;

  useEffect(() => {
    let active = true;
    setPreferencesReady(false);
    setToastDismissed(false);
    void getNotificationPreferences().then((preferences) => {
      if (!active) return;
      setNotificationsEnabled(
        preferences.global !== false &&
          (preferences.categories?.notices !== false || preferences.categories?.mealReminders !== false),
      );
      setPreferencesReady(true);
    }).catch(() => { if (active) setPreferencesReady(true); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    setToastDismissed(dismissalKey ? window.sessionStorage.getItem(dismissalKey) === "true" : false);
  }, [dismissalKey]);

  useEffect(() => {
    const canAutoSubscribe = supported && permission === "granted" && !hasSubscription && preferencesReady && notificationsEnabled && !working;
    if (!canAutoSubscribe || !user || autoSubscribeAttemptedFor.current === user.id) return;
    autoSubscribeAttemptedFor.current = user.id;
    void subscribe();
  }, [hasSubscription, notificationsEnabled, permission, preferencesReady, subscribe, supported, user, working]);

  useEffect(() => {
    const shouldShow = supported && permission === "default" && !hasSubscription && preferencesReady && notificationsEnabled && !toastDismissed;
    if (shouldShow && toastId.current === null) {
      const handleDismiss = () => {
        if (dismissalKey) window.sessionStorage.setItem(dismissalKey, "true");
        setToastDismissed(true);
        if (toastId.current !== null) toast.dismiss(toastId.current);
        toastId.current = null;
      };
      const handleEnable = () => {
        void subscribe();
        handleDismiss();
      };
      toastId.current = toast.custom(
        (id) => (
          <div className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/20 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/10">
            {/* gradient accent bar */}
            <div className="h-[3px] w-full bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />
            <div className="p-4">
              {/* header row: bell + text + close */}
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                  <Bell className="h-[18px] w-[18px] text-violet-600 dark:text-violet-400 [animation:bell-ring_1.2s_ease-in-out_0.5s_2]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground leading-snug">Stay updated with MealTrack</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground leading-relaxed">
                    Get meal reminders &amp; mess updates delivered instantly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
                  aria-label="Dismiss"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {/* action row */}
              <div className="mt-3.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEnable}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-3 text-[12px] font-semibold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
                >
                  <Bell className="h-3.5 w-3.5 shrink-0" />
                  Enable notifications
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-border/70 px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97] focus-visible:outline-none"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        ),
        { id: "notification-onboarding", duration: Infinity },
      );
    } else if (!shouldShow && toastId.current !== null) {
      toast.dismiss(toastId.current);
      toastId.current = null;
    }
    return () => {
      if (toastId.current !== null && !shouldShow) {
        toast.dismiss(toastId.current);
        toastId.current = null;
      }
    };
  }, [dismissalKey, hasSubscription, notificationsEnabled, permission, preferencesReady, subscribe, supported, toastDismissed]);

  return null;
}

const legacyMainRouteMap: Record<string, string> = {
  "/": "/app",
  "/members": "/app/members",
  "/expenses": "/app/expenses",
  "/meals": "/app/meals",
  "/reports": "/app/reports",
  "/history": "/app/history",
  "/changelog": "/app/changelog",
  "/settings": "/app/settings",
};

function AppShell() {
  const { session, loading, lastAuthEvent, profile, profileLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const routePath = location.split("?")[0];
  const [isSharedLandingRoute] = useRoute("/shared");
  const [isSharedRoute, sharedParams] = useRoute("/shared/:token");
  const [isInviteRoute, inviteParams] = useRoute("/invite/:token");
  const searchParams = new URLSearchParams(window.location.search);
  const pendingInviteToken = searchParams.get("invite");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const authCode = searchParams.get("code");
  const recoveryType =
    searchParams.get("type")?.toLowerCase() ??
    hashParams.get("type")?.toLowerCase() ??
    "";
  const recoveryTokenHash = searchParams.get("token_hash");
  const recoveryTokenInUrl =
    recoveryType === "recovery" ||
    (Boolean(recoveryTokenHash) && recoveryType === "recovery");

  const [authLinkResolved, setAuthLinkResolved] = useState(
    !authCode && !(recoveryTokenHash && recoveryType === "recovery"),
  );
  const [recoveryLinkVerified, setRecoveryLinkVerified] = useState(recoveryTokenInUrl);

  useEffect(() => {
    const needsCodeExchange = Boolean(authCode);
    const needsRecoveryVerification =
      Boolean(recoveryTokenHash) && recoveryType === "recovery" && !authCode;

    if (!needsCodeExchange && !needsRecoveryVerification) {
      setAuthLinkResolved(true);
      return;
    }

    let cancelled = false;
    setAuthLinkResolved(false);

    const resolveAuthLink = async () => {
      let error: Error | null = null;

      if (needsCodeExchange && authCode) {
        const result = await supabase.auth.exchangeCodeForSession(authCode);
        error = result.error;
      } else if (needsRecoveryVerification && recoveryTokenHash) {
        const result = await supabase.auth.verifyOtp({
          token_hash: recoveryTokenHash,
          type: "recovery",
        });
        error = result.error;
      }

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Error resolving auth recovery link:", error);
      } else {
        setRecoveryLinkVerified(true);
      }

      setAuthLinkResolved(true);
    };

    void resolveAuthLink();

    return () => {
      cancelled = true;
    };
  }, [authCode, recoveryTokenHash, recoveryType]);

  const hasRecoveryContext =
    recoveryLinkVerified || recoveryTokenInUrl || lastAuthEvent === "PASSWORD_RECOVERY";
  const isRecoveryFlow = routePath === "/auth" && hasRecoveryContext;

  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const isSharedExperience = isSharedLandingRoute || isSharedRoute || isInviteRoute;

    manifestLink?.setAttribute(
      "href",
      isSharedExperience ? "/shared-manifest.webmanifest" : "/manifest.webmanifest",
    );
    appleTitle?.setAttribute("content", isSharedExperience ? "MealTrack Shared" : "MealTrack");
  }, [isInviteRoute, isSharedLandingRoute, isSharedRoute]);

  useEffect(() => {
    if (isSharedLandingRoute) {
      document.title = "Meal Code - MealTrack";
      return;
    }

    if (isSharedRoute) {
      document.title = "Shared View - MealTrack";
      return;
    }
    if (isInviteRoute) {
      document.title = "Join a Mess - MealTrack";
      return;
    }

    const isMemberRole = profile?.role === "member";
    const pageTitleMap: Record<string, string> = {
      "/": "Dashboard - MealTrack",
      "/app": "Dashboard - MealTrack",
      "/members": isMemberRole ? "Deposits - MealTrack" : "Members - MealTrack",
      "/app/members": isMemberRole ? "Deposits - MealTrack" : "Members - MealTrack",
      "/expenses": "Expenses - MealTrack",
      "/app/expenses": "Expenses - MealTrack",
      "/meals": "Meals - MealTrack",
      "/app/meals": "Meals - MealTrack",
      "/history": "History - MealTrack",
      "/reports": "Reports - MealTrack",
      "/app/reports": "Reports - MealTrack",
      "/app/history": "History - MealTrack",
      "/changelog": "Changelog - MealTrack",
      "/app/changelog": "Changelog - MealTrack",
      "/settings": "Settings - MealTrack",
      "/app/settings": "Settings - MealTrack",
      "/auth": `${isRecoveryFlow ? "Reset Password" : "Authentication"} - MealTrack`,
    };

    document.title = pageTitleMap[routePath] ?? "MealTrack";
  }, [isInviteRoute, isRecoveryFlow, isSharedLandingRoute, isSharedRoute, routePath, profile?.role]);

  useEffect(() => {
    if (isSharedLandingRoute || isSharedRoute || isInviteRoute || !authLinkResolved) return;

    if (hasRecoveryContext && routePath !== "/auth") {
      window.history.replaceState(null, document.title, `/auth${window.location.search}${window.location.hash}`);
      setLocation("/auth");
      return;
    }

    if (loading) return;
    if (!session && routePath !== "/auth") {
      setLocation("/auth");
      return;
    }
    if (!session || isRecoveryFlow || profileLoading || !profile) return;

    if (!profile.mess_id && pendingInviteToken && routePath === "/auth") {
      setLocation(`/invite/${encodeURIComponent(pendingInviteToken)}`);
      return;
    }

    if (!profile.mess_id && routePath !== "/onboarding") {
      setLocation("/onboarding");
      return;
    }
    if (profile.mess_id && (routePath === "/auth" || routePath === "/onboarding")) {
      setLocation("/app");
      return;
    }
    if (profile.mess_id && legacyMainRouteMap[routePath]) {
      setLocation(legacyMainRouteMap[routePath]);
    }
  }, [authLinkResolved, hasRecoveryContext, isInviteRoute, isRecoveryFlow, isSharedLandingRoute, isSharedRoute, loading, pendingInviteToken, profile, profileLoading, routePath, session, setLocation]);

  if (isSharedLandingRoute) {
    return <SharedAccessPage />;
  }

  if (isSharedRoute && sharedParams?.token) {
    return <SharedPage token={sharedParams.token} />;
  }

  if (isInviteRoute && inviteParams?.token) {
    return <InvitePage token={inviteParams.token} />;
  }

  if (loading || !authLinkResolved || (session && (profileLoading || profile === null))) {
    return (
      <AppLoadingSkeleton
        message={authLinkResolved ? "Checking your session..." : "Preparing your reset link..."}
      />
    );
  }

  if (!session || isRecoveryFlow) {
    return <AuthPage />;
  }

  if (!profile?.mess_id) {
    return <OnboardingPage />;
  }

  return (
    <MealProvider>
      <NoticeProvider>
        <OfflineToastManager />
        <NotificationOnboardingToast />
        <Router />
      </NoticeProvider>
    </MealProvider>
  );
}

function PwaUpdateNotifier() {
  const hasShownUpdateToast = useRef(false);
  const waitingRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
      return;
    }

    const activateWaitingServiceWorker = () => {
      const waitingWorker = waitingRegistrationRef.current?.waiting;

      if (!waitingWorker) {
        window.location.reload();
        return;
      }

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) {
          return;
        }

        reloading = true;
        window.location.reload();
      });

      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    };

    const showUpdateToast = (registration: ServiceWorkerRegistration) => {
      if (hasShownUpdateToast.current) {
        return;
      }

      waitingRegistrationRef.current = registration;
      hasShownUpdateToast.current = true;
      toast.info("New version available", {
        description: "Update to get the latest fixes and features.",
        action: {
          label: "Update",
          onClick: activateWaitingServiceWorker,
        },
        duration: Infinity,
      });
    };

    const attachRegistrationListeners = (
      registration: ServiceWorkerRegistration | null | undefined,
    ) => {
      if (!registration) {
        return;
      }

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(registration);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener("statechange", () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            showUpdateToast(registration);
          }
        });
      });
    };

    void navigator.serviceWorker.getRegistration().then(attachRegistrationListeners);
  }, []);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PwaUpdateNotifier />
        <AppShell />
        <Toaster />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
