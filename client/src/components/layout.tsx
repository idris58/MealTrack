import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
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
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNotice } from '@/lib/notice-context';
import { NoticeBanner } from '@/components/notice-banner';
import { NoticeDialog } from '@/components/notice-dialog';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/app' },
  { icon: Users, label: 'Members', href: '/app/members' },
  { icon: UtensilsCrossed, label: 'Meals', href: '/app/meals' },
  { icon: Receipt, label: 'Expenses', href: '/app/expenses' },
  { icon: FileBarChart, label: 'Reports', href: '/app/reports' },
  { icon: History, label: 'History', href: '/app/history' },
  { icon: Settings, label: 'Settings', href: '/app/settings' },
];

const MEMBER_MOBILE_NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/app' },
  { icon: UtensilsCrossed, label: 'Meals', href: '/app/meals' },
  { icon: Receipt, label: 'Expenses', href: '/app/expenses' },
  { icon: WalletCards, label: 'Deposits', href: '/app/members' },
  { icon: Settings, label: 'Settings', href: '/app/settings' },
];

const MANAGER_MOBILE_NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/app' },
  { icon: UtensilsCrossed, label: 'Meals', href: '/app/meals' },
  { icon: Receipt, label: 'Expenses', href: '/app/expenses' },
  { icon: Users, label: 'Members', href: '/app/members' },
];

const MORE_ITEMS = [
  { icon: FileBarChart, label: 'Reports', href: '/app/reports', desc: 'Summary analytics, PDF & Excel export' },
  { icon: History, label: 'History', href: '/app/history', desc: 'Archived cycles, settlements & ledger' },
  { icon: Settings, label: 'Settings', href: '/app/settings', desc: 'Cycle operations, share links & notices' },
  { icon: Sparkles, label: 'Changelog', href: '/app/changelog', desc: 'Recent features and updates' },
];

/** Returns up to two uppercase initials from a display name or email. */
function getInitials(name?: string | null, email?: string | null): string {
  const source = name ?? email ?? '';
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const { notice } = useNotice();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
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
      setLocation('/auth');
    } catch (error) {
      console.error('Error logging out:', error);
      setIsLoggingOut(false);
    }
  };

  const isMember = profile?.role === 'member';
  const sidebarNavItems = NAV_ITEMS.filter((item) => {
    if (isMember && (item.href === '/app/reports' || item.href === '/app/history')) return false;
    return true;
  }).map((item) => {
    if (isMember && item.href === '/app/members') {
      return { ...item, icon: WalletCards, label: 'Deposits' };
    }
    return item;
  });

  const mobileNavItems = isMember ? MEMBER_MOBILE_NAV_ITEMS : MANAGER_MOBILE_NAV_ITEMS;
  const isMoreActive = !isMember && ['/app/reports', '/app/history', '/app/settings', '/app/changelog'].includes(location);

  const initials = getInitials(profile?.full_name, user?.email);

  /** Avatar button used in the header */
  const userAvatar = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id="header-user-avatar"
          type="button"
          className="relative flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-transparent p-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:border-border sm:pr-3"
          aria-label="User menu"
        >
          <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-primary/20">
            {profile?.picture_url ? (
              <AvatarImage src={profile.picture_url} alt={profile.full_name ?? 'User avatar'} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-xs sm:text-sm font-semibold text-primary">
              {initials || <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:block max-w-[150px] truncate">
            {profile?.full_name ?? user?.email?.split('@')[0] ?? 'User'}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User info label */}
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="truncate font-semibold">{profile?.full_name ?? user?.email ?? 'Signed in'}</span>
          {user?.email ? (
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <Link href="/app/profile">
          <DropdownMenuItem id="header-menu-profile" className="cursor-pointer gap-2">
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          id="header-menu-logout"
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          disabled={isLoggingOut}
          onSelect={() => void handleLogout()}
        >
          {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {isLoggingOut ? 'Logging out…' : 'Logout'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const brand = (
    <Link href="/app">
      <div className="flex min-w-0 cursor-pointer items-center gap-2">
        <ChefHat className="h-7 w-7 shrink-0 text-primary md:h-8 md:w-8" />
        <span className="truncate font-heading text-lg font-bold text-primary md:text-xl">
          MealTrack
        </span>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <CommandInput placeholder="Search actions and pages..." />
        <CommandList>
          <CommandEmpty>No matching action found.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {(profile?.role !== 'member') && (
              <CommandItem onSelect={() => runQuickAction('/app/expenses')}>
                <Receipt /> Add expense <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={() => runQuickAction('/app/meals')}>
              <UtensilsCrossed /> Log meals <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
            {profile?.role !== 'member' && (
              <CommandItem onSelect={() => runQuickAction('/app/settings#cycle-operations')}>
                <Settings /> Cycle operations <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>
          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => runQuickAction('/app')}><LayoutDashboard /> Dashboard</CommandItem>
            {profile?.role !== 'member' && <CommandItem onSelect={() => runQuickAction('/app/members')}><Users /> Members</CommandItem>}
            <CommandItem onSelect={() => runQuickAction('/app/settings')}><Settings /> Settings</CommandItem>
            <CommandItem onSelect={() => runQuickAction('/app/profile')}><User /> Profile</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b bg-card px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {brand}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <PwaInstallButton
            appId="main"
            appName="MealTrack"
            className="h-8 sm:h-9 shrink-0 gap-1.5 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm max-[380px]:[&_span]:hidden"
          />
          <ThemeToggle />

          {/* Notice bell — pulses amber when there is an active notice */}
          {notice && (
            <button
              type="button"
              id="header-notice-bell"
              aria-label="View active notice"
              onClick={() => setShowNoticeDialog(true)}
              className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-900/30"
            >
              <Bell className="h-4 w-4" />
              {/* Pulsing glow ring */}
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
            </button>
          )}

          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
          {userAvatar}
        </div>
      </header>

      {/* Notice banner — just below sticky header */}
      <NoticeBanner />

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r bg-card md:sticky md:top-16 md:flex">
          <nav className="flex-1 space-y-2 p-4 pt-6">
            {sidebarNavItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md px-4 py-3 transition-colors',
                    location === item.href
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </div>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="container mx-auto max-w-5xl p-4 pb-20 md:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Clean 5-Item Bar) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 w-full border-t bg-card md:hidden"
        aria-label="Primary mobile navigation"
      >
        <div className="grid h-[54px] w-full grid-cols-5 items-center">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex h-full min-w-0 w-full items-center justify-center">
                <div
                  className={cn(
                    'flex h-full w-full min-w-0 flex-col items-center justify-center py-1 font-medium transition-colors select-none',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-6 w-10 items-center justify-center rounded-full transition-all duration-150',
                      isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <item.icon className="h-4.5 w-4.5 shrink-0" />
                  </div>
                  <span
                    className={cn(
                      'mt-0.5 w-full truncate text-center leading-tight tracking-tight text-[10px]',
                      isActive ? 'font-bold text-primary' : 'font-medium text-muted-foreground'
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}

          {!isMember && (
            <button
              type="button"
              id="mobile-nav-more-btn"
              onClick={() => setIsMoreSheetOpen(true)}
              className="flex h-full min-w-0 w-full flex-col items-center justify-center py-1 font-medium transition-colors select-none text-muted-foreground hover:text-foreground"
            >
              <div
                className={cn(
                  'flex h-6 w-10 items-center justify-center rounded-full transition-all duration-150',
                  isMoreActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                )}
              >
                <MoreHorizontal className="h-4.5 w-4.5 shrink-0" />
              </div>
              <span
                className={cn(
                  'mt-0.5 w-full truncate text-center leading-tight tracking-tight text-[10px]',
                  isMoreActive ? 'font-bold text-primary' : 'font-medium text-muted-foreground'
                )}
              >
                More
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile More Sheet for Manager / Coordinator */}
      {!isMember && (
        <Sheet open={isMoreSheetOpen} onOpenChange={setIsMoreSheetOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl border-t bg-card p-5 sm:max-w-lg sm:mx-auto">
            <SheetHeader className="pb-3 text-left">
              <SheetTitle className="text-base font-bold">More Options</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Access reporting, archive records, and mess settings.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-2 pt-1">
              {MORE_ITEMS.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreSheetOpen(false)}
                    className={cn(
                      'flex items-center justify-between rounded-xl border p-3 transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/5 text-primary font-medium'
                        : 'bg-secondary/20 hover:bg-muted text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        <item.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Notice reader dialog triggered from the header bell */}
      {showNoticeDialog && (
        <NoticeDialog
          mode="read"
          open={showNoticeDialog}
          onOpenChange={setShowNoticeDialog}
        />
      )}
    </div>
  );
}
