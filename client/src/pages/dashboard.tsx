/**
 * dashboard.tsx
 * Role-based dashboard router.
 * – Members  → MemberDashboard  (personalized view)
 * – Manager / Coordinator → ManagerDashboard  (mess command center)
 */

import { useAuth } from '@/lib/auth-context';
import { MemberDashboard } from '@/components/dashboard/member-dashboard';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { Skeleton } from '@/components/ui/skeleton';

function DashboardSkeleton() {
  return (
    <div className="space-y-5 pb-24 animate-pulse">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 w-full rounded-2xl lg:col-span-2" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile, profileLoading } = useAuth();

  if (profileLoading) return <DashboardSkeleton />;

  if (profile?.role === 'member') {
    return <MemberDashboard />;
  }

  return <ManagerDashboard />;
}
