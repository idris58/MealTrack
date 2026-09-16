/**
 * members.tsx
 * Role-based router for the /app/members route.
 * – Members        → MemberDepositsView   (personal deposit & ledger)
 * – Manager / Coordinator → ManagerMembersView  (full roster management)
 */

import { useAuth } from '@/lib/auth-context';
import { ManagerMembersView } from '@/components/members/manager-members-view';
import { MemberDepositsView } from '@/components/members/member-deposits-view';
import { Skeleton } from '@/components/ui/skeleton';

function MembersSkeleton() {
  return (
    <div className="space-y-5 pb-24 animate-pulse">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-52 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function Members() {
  const { profile, profileLoading } = useAuth();

  if (profileLoading) return <MembersSkeleton />;

  if (profile?.role === 'member') {
    return <MemberDepositsView />;
  }

  return <ManagerMembersView />;
}
