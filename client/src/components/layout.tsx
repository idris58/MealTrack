import React, { useState } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNotice } from '@/lib/notice-context';
import { NoticeBanner } from '@/components/notice-banner';
import { NoticeDialog } from '@/components/notice-dialog';
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
  const { user, profile, signOut } = useAuth();
  const { notice } = useNotice();

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
  const navItems = NAV_ITEMS.filter((item) => !(isMember && item.href === '/app/reports'));

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
            {navItems.map((item) => (
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
          <div className="container mx-auto max-w-5xl p-4 pb-28 md:p-8">
            {children}
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 px-0.5 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
        aria-label="Primary mobile navigation"
      >
        <div
          className="grid h-16 items-center gap-0.5"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex min-w-0 w-full justify-center">
              <div
                className={cn(
                  'flex h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-md px-0.5 font-medium transition-colors',
                  location === item.href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                <span className="w-full truncate text-center leading-tight tracking-tight text-[9px] min-[360px]:text-[10px] sm:text-[11px]">
                  {item.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </nav>

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
