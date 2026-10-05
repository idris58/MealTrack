import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Receipt,
  FileBarChart,
  History,
  Settings,
  ChefHat,
  UtensilsCrossed,
  LogOut,
  Loader2,
  User,
  Bell,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  WalletCards,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNotice } from "@/lib/notice-context";
import { NoticeBanner } from "@/components/notice-banner";
import { NoticeDialog } from "@/components/notice-dialog";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  capability?: keyof ReturnType<typeof useAuth>;
};

const PRIMARY_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/app" },
  { icon: UtensilsCrossed, label: "Meals", href: "/app/meals" },
  { icon: Receipt, label: "Expenses", href: "/app/expenses" },
  { icon: Users, label: "Members", href: "/app/members", capability: "canManageMembers" },
];

const SECONDARY_NAV: NavItem[] = [
  { icon: FileBarChart, label: "Reports", href: "/app/reports" },
  { icon: History, label: "History", href: "/app/history" },
];

const UTILITY_NAV: NavItem[] = [
  { icon: Settings, label: "Settings", href: "/app/settings" },
];

const MEMBER_PRIMARY_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/app" },
  { icon: UtensilsCrossed, label: "Meals", href: "/app/meals" },
  { icon: Receipt, label: "Expenses", href: "/app/expenses" },
  { icon: WalletCards, label: "Deposits", href: "/app/members" },
];

const MORE_ITEMS = [
  { icon: FileBarChart, label: "Reports", href: "/app/reports", desc: "Summary analytics and exports", member: false },
  { icon: History, label: "History", href: "/app/history", desc: "Archived cycles and settlements", member: true },
  { icon: Sparkles, label: "Changelog", href: "/app/changelog", desc: "Recent features and updates", member: true },
  { icon: Settings, label: "Settings", href: "/app/settings", desc: "Preferences and mess settings", member: true },
  { icon: User, label: "Profile", href: "/app/profile", desc: "Your personal information", member: true },
];

const PAGE_META: Record<string, { label: string; description?: string }> = {
  "/app": { label: "Dashboard", description: "Your mess at a glance" },
  "/app/meals": { label: "Meals", description: "Track and review daily meals" },
  "/app/expenses": { label: "Expenses", description: "Manage household spending" },
  "/app/members": { label: "Members", description: "Members and deposits" },
  "/app/reports": { label: "Reports", description: "Review the current cycle" },
  "/app/history": { label: "History", description: "Past cycles and settlements" },
  "/app/changelog": { label: "Changelog", description: "Recent MealTrack updates" },
  "/app/settings": { label: "Settings", description: "Configure your mess" },
  "/app/profile": { label: "Profile", description: "Your account information" },
};

function getInitials(name?: string | null, email?: string | null): string {
  const source = name ?? email ?? "";
  const parts = source.trim().split(/\\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function isCurrentRoute(location: string, href: string) {
  return href === "/app" ? location === "/app" : location === href || location.startsWith(href + "/");
}

function NavLink({
  item,
  active,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const content = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-11 items-center rounded-xl text-sm font-medium outline-none transition-[background-color,color,transform] duration-150",
        "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        active
          ? "bg-primary/[0.11] text-primary"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-[0.985]",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-2.5 h-6 w-0.5 rounded-full bg-primary"
        />
      )}
      <item.icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-transform duration-150",
          active ? "text-primary" : "group-hover:scale-[1.04]",
        )}
        strokeWidth={active ? 2.2 : 1.9}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, profile, signOut, canManageMembers } = useAuth();
  const { notice } = useNotice();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mealtrack-sidebar-collapsed");
      if (saved === "true") setSidebarCollapsed(true);
    } catch {
      // Ignore unavailable localStorage.
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("mealtrack-sidebar-collapsed", String(next));
      } catch {
        // Ignore unavailable localStorage.
      }
      return next;
    });
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const runQuickAction = (href: string) => {
    setIsCommandOpen(false);
    setLocation(href);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut();
      setLocation("/auth");
    } catch (error) {
      console.error("Error logging out:", error);
      setIsLoggingOut(false);
    }
  };

  const isMember = profile?.role === "member";
  const sidebarPrimary = useMemo(
    () => (isMember ? MEMBER_PRIMARY_NAV : PRIMARY_NAV).filter((item) => {
      if (item.capability === "canManageMembers") return canManageMembers;
      return true;
    }),
    [canManageMembers, isMember],
  );

  const sidebarSecondary = isMember ? [] : SECONDARY_NAV;
  const mobileMoreItems = MORE_ITEMS.filter((item) => item.member || !isMember);
  const isMoreActive = mobileMoreItems.some((item) => isCurrentRoute(location, item.href));
  const pageMeta = PAGE_META[location] ?? PAGE_META["/app"];
  const initials = getInitials(profile?.full_name, user?.email);
  const roleLabel =
    profile?.role === "manager" ? "Manager" : profile?.role === "coordinator" ? "Coordinator" : "Member";

  const userAvatar = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id="header-user-avatar"
          type="button"
          className="group flex shrink-0 items-center gap-2 rounded-full border border-transparent p-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Open account menu"
        >
          <Avatar className="h-8 w-8 border border-primary/20 sm:h-9 sm:w-9">
            {profile?.picture_url ? (
              <AvatarImage src={profile.picture_url} alt={profile.full_name ?? "User avatar"} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials || <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-left sm:block">
            <span className="block truncate text-xs font-semibold leading-4">
              {profile?.full_name ?? user?.email?.split("@")[0] ?? "User"}
            </span>
            <span className="block text-[11px] leading-4 text-muted-foreground">{roleLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-primary/20">
              {profile?.picture_url ? <AvatarImage src={profile.picture_url} alt="" /> : null}
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.full_name ?? user?.email ?? "Signed in"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email ?? roleLabel}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Link href="/app/profile">
          <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg">
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          id="header-menu-logout"
          className="cursor-pointer gap-2 rounded-lg text-destructive focus:text-destructive"
          disabled={isLoggingOut}
          onSelect={() => void handleLogout()}
        >
          {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {isLoggingOut ? "Logging out…" : "Logout"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const brand = (
    <Link href="/app" className="group flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-150 group-hover:scale-[1.03]">
        <ChefHat className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="truncate font-heading text-[17px] font-bold tracking-tight text-foreground">
        Meal<span className="text-primary">Track</span>
      </span>
    </Link>
  );

  return (
    <TooltipProvider delayDuration={350}>
      <div className="min-h-screen bg-background">
        <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
          <CommandInput placeholder="Search pages and actions..." />
          <CommandList>
            <CommandEmpty>No matching action found.</CommandEmpty>
            <CommandGroup heading="Quick actions">
              {!isMember && (
                <CommandItem onSelect={() => runQuickAction("/app/expenses")}>
                  <Receipt /> Add expense <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              )}
              <CommandItem onSelect={() => runQuickAction("/app/meals")}>
                <UtensilsCrossed /> Log meals <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
              {!isMember && (
                <CommandItem onSelect={() => runQuickAction("/app/settings#cycle-operations")}>
                  <Settings /> Cycle operations <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              )}
            </CommandGroup>
            <CommandGroup heading="Navigate">
              {sidebarPrimary.map((item) => (
                <CommandItem key={item.href} onSelect={() => runQuickAction(item.href)}>
                  <item.icon /> {item.label}
                </CommandItem>
              ))}
              {sidebarSecondary.map((item) => (
                <CommandItem key={item.href} onSelect={() => runQuickAction(item.href)}>
                  <item.icon /> {item.label}
                </CommandItem>
              ))}
              <CommandItem onSelect={() => runQuickAction("/app/settings")}><Settings /> Settings</CommandItem>
              <CommandItem onSelect={() => runQuickAction("/app/profile")}><User /> Profile</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        <header className="sticky top-0 z-40 flex h-16 w-full items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="md:hidden">{brand}</div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-sm font-semibold">{pageMeta.label}</p>
              {pageMeta.description && (
                <p className="truncate text-xs text-muted-foreground">{pageMeta.description}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <PwaInstallButton
              appId="main"
              appName="MealTrack"
              className="h-9 shrink-0 gap-1.5 rounded-lg px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm max-[380px]:[&_span]:hidden"
            />
            <ThemeToggle className="h-9 w-11 rounded-lg border-border/70 bg-transparent shadow-none hover:bg-muted hover:shadow-none" />
            {notice && (
              <button
                type="button"
                id="header-notice-bell"
                aria-label="View active notice"
                onClick={() => setShowNoticeDialog(true)}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200/70 bg-amber-50/80 text-amber-600 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-900/30"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-1 top-1 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              </button>
            )}
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            {userAvatar}
          </div>
        </header>

        <NoticeBanner />

        <div className="flex">
          <aside
            className={cn(
              "sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r bg-background md:flex",
              "transition-[width] duration-200 ease-out",
              sidebarCollapsed ? "w-[72px]" : "w-60",
            )}
          >
            <div className={cn("flex h-14 items-center border-b px-3", sidebarCollapsed ? "justify-center" : "justify-between px-4")}>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
                  <p className="truncate text-xs text-muted-foreground/80">Mess management</p>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                </TooltipContent>
              </Tooltip>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
              <div className="space-y-1">
                {sidebarPrimary.map((item) => (
                  <NavLink key={item.href} item={item} active={isCurrentRoute(location, item.href)} collapsed={sidebarCollapsed} />
                ))}
              </div>

              {sidebarSecondary.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  {!sidebarCollapsed && (
                    <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Insights
                    </p>
                  )}
                  <div className="space-y-1">
                    {sidebarSecondary.map((item) => (
                      <NavLink key={item.href} item={item} active={isCurrentRoute(location, item.href)} collapsed={sidebarCollapsed} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 border-t pt-4">
                {!sidebarCollapsed && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Workspace
                  </p>
                )}
                {UTILITY_NAV.map((item) => (
                  <NavLink key={item.href} item={item} active={isCurrentRoute(location, item.href)} collapsed={sidebarCollapsed} />
                ))}
              </div>
            </nav>

            <div className="border-t p-3">
              <div className={cn("flex items-center rounded-xl bg-muted/45", sidebarCollapsed ? "justify-center p-1" : "gap-2 p-2")}>
                <Avatar className="h-8 w-8 shrink-0">
                  {profile?.picture_url ? <AvatarImage src={profile.picture_url} alt="" /> : null}
                  <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{profile?.full_name ?? "User"}</p>
                    <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-x-clip">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-6 md:px-7 md:py-8 md:pb-10 lg:px-8">
              {children}
            </div>
          </main>
        </div>

        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary mobile navigation"
        >
          <div className="mx-auto grid h-14 max-w-lg grid-cols-5">
            {sidebarPrimary.map((item) => {
              const active = isCurrentRoute(location, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-transform duration-150 group-active:scale-95",
                    active ? "bg-primary/10" : "group-hover:bg-muted/70",
                  )}>
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.9} />
                  </span>
                  <span className={cn("max-w-full truncate text-[10px] leading-3", active ? "font-semibold" : "font-medium")}>
                    {item.label}
                  </span>
                  {active && <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-primary" />}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setIsMoreSheetOpen(true)}
              aria-expanded={isMoreSheetOpen}
              aria-label="Open more navigation"
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset",
                isMoreActive && "text-primary",
              )}
            >
              <span className={cn("flex h-7 w-11 items-center justify-center rounded-full", isMoreActive ? "bg-primary/10" : "hover:bg-muted/70")}>
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </span>
              <span className={cn("text-[10px] leading-3", isMoreActive ? "font-semibold" : "font-medium")}>More</span>
              {isMoreActive && <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-primary" />}
            </button>
          </div>
        </nav>

        <Sheet open={isMoreSheetOpen} onOpenChange={setIsMoreSheetOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-t bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 sm:mx-auto sm:max-w-lg"
          >
            <SheetHeader className="pb-3 text-left">
              <SheetTitle className="text-base">More</SheetTitle>
              <SheetDescription className="text-xs">
                {isMember ? "Account and history" : "Reports, history and account"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-1.5">
              {mobileMoreItems.map((item) => {
                const active = isCurrentRoute(location, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreSheetOpen(false)}
                    className={cn(
                      "flex min-h-14 items-center justify-between rounded-xl border px-3 py-2.5 outline-none transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary/50",
                      active ? "border-primary/30 bg-primary/[0.06]" : "border-border/70 hover:bg-muted/60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>

        {showNoticeDialog && (
          <NoticeDialog mode="read" open={showNoticeDialog} onOpenChange={setShowNoticeDialog} />
        )}
      </div>
    </TooltipProvider>
  );
}
