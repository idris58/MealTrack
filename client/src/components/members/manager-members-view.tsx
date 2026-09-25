/**
 * manager-members-view.tsx
 * Extracts the full manager/coordinator Members roster page into a standalone component.
 * Includes: DnD sortable member cards, add member, invite links, role management,
 * deposit modal, and soft-delete / undo.
 */

import { useMeal, type Member } from '@/lib/meal-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Check, ChevronDown, Clipboard, Clock3, Copy, GripVertical, Link2, Link2Off,
  Plus, RotateCcw, Send, ShieldCheck, Trash2, Wallet, Users, Play,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useState } from 'react';
import { UndoDeleteGhost } from '@/components/undo-delete-ghost';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SyncBadge } from '@/components/sync-badge';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────
const DELETE_GRACE_MS = 10 * 1000;

const memberSchema = z.object({ name: z.string().min(2, 'Name is required') });

function formatMealCount(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toString();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type MemberStatsSnapshot = { mealCost: number; fixedCost: number; totalCost: number; balance: number; mealsEaten: number };
type DeletedMemberGhost = { member: Member; stats: MemberStatsSnapshot; index: number; expiresAt: number };
type MemberInvite = {
  id: string; target_member_id: string | null; target_member_name: string | null;
  expires_at: string; created_at: string; claimed_at: string | null;
  revoked_at: string | null; status: 'active' | 'used' | 'revoked' | 'expired';
};

function inviteUrl(invite: MemberInvite) { return `${window.location.origin}/invite/${invite.id}`; }
function inviteTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// ── Sub-forms ─────────────────────────────────────────────────────────────────
function AddMemberForm({ onClose }: { onClose: () => void }) {
  const { addMember } = useMeal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<z.infer<typeof memberSchema>>({
    resolver: zodResolver(memberSchema),
    defaultValues: { name: '' },
  });
  const onSubmit = async (data: z.infer<typeof memberSchema>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try { await addMember(data.name); onClose(); } finally { setIsSubmitting(false); }
  };
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Member Name" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Member'}</Button>
      </form>
    </Form>
  );
}

function DepositForm({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { addDeposit } = useMeal();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const val = parseFloat(amount);
    if (!isNaN(val) && val !== 0) {
      setIsSubmitting(true);
      const signedAmount = mode === 'deduct' ? -Math.abs(val) : Math.abs(val);
      try { await addDeposit(memberId, signedAmount, undefined, mode === 'deduct' ? 'Deduction/Refund' : undefined); onClose(); }
      finally { setIsSubmitting(false); }
    }
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={mode === 'add' ? 'default' : 'outline'} onClick={() => setMode('add')} disabled={isSubmitting}>Add</Button>
        <Button type="button" variant={mode === 'deduct' ? 'destructive' : 'outline'} onClick={() => setMode('deduct')} disabled={isSubmitting}>Deduct</Button>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Amount {mode === 'deduct' ? '(deduction)' : '(deposit)'}</label>
        <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus disabled={isSubmitting} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : mode === 'deduct' ? 'Deduct Amount' : 'Add Deposit'}
      </Button>
    </form>
  );
}

// ── Member Card ───────────────────────────────────────────────────────────────
function MemberCard({
  member, stats, deletingMemberId, onDeposit, onDelete, profileRole,
  onCoordinatorAction, canManageRoles = false, isLinked = false, dragHandleProps, isDragging = false,
}: {
  member: Member; stats: MemberStatsSnapshot; deletingMemberId?: string | null;
  onDeposit?: () => void; onDelete?: () => void;
  profileRole?: 'manager' | 'coordinator' | 'member'; onCoordinatorAction?: () => void;
  canManageRoles?: boolean; isLinked?: boolean; dragHandleProps?: any; isDragging?: boolean;
}) {
  return (
    <Card className={`overflow-hidden transition-shadow ${isDragging ? 'shadow-xl ring-2 ring-primary/30' : ''}`}>
      <CardContent className="p-0">
        <div className="flex items-start justify-between border-b bg-secondary/20 p-4">
          <div className="flex items-center gap-3">
            {dragHandleProps ? (
              <button type="button" className="-ml-2 touch-none cursor-grab rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing" aria-label="Drag to reorder member" {...dragHandleProps}>
                <GripVertical className="h-4 w-4" />
              </button>
            ) : null}
            <Avatar><AvatarFallback className="bg-primary/10 text-primary">{member.avatar}</AvatarFallback></Avatar>
            <div className="flex items-center gap-1.5">
              <p className="font-bold">{member.name}</p>
              {isLinked
                ? <span title="Account Linked" className="inline-flex shrink-0"><Link2 className="h-3.5 w-3.5 text-emerald-500" /></span>
                : <span title="Offline Member (Not Linked)" className="inline-flex shrink-0"><Link2Off className="h-3.5 w-3.5 text-gray-400" /></span>}
            </div>
          </div>
          {onDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={deletingMemberId === member.id}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this member?</AlertDialogTitle>
                  <AlertDialogDescription>This will remove {member.name} and also delete their meal logs and deposits.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} disabled={deletingMemberId === member.id}>
                    {deletingMemberId === member.id ? 'Deleting...' : 'Yes, Delete Member'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        <div className="space-y-3 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Deposit</span>
            <div className="flex items-center gap-2">
              <span className="font-bold">৳{member.deposit.toFixed(2)}</span>
              <SyncBadge show={member.hasPendingDeposit} className="[&>span:last-child]:hidden px-1.5 py-0" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Meals Eaten</span>
            <span className="font-medium">{formatMealCount(member.mealsEaten)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Meal Cost</span>
            <span className="font-medium">৳{stats.mealCost.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fixed Share</span>
            <span className="font-medium">৳{stats.fixedCost.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-medium">Net Balance</span>
            <span className={`text-lg font-bold ${stats.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {stats.balance >= 0 ? '+' : '-'}{Math.round(Math.abs(stats.balance))}
            </span>
          </div>

          {(onDeposit || canManageRoles) ? (
            <div className="flex items-center gap-2 pt-1">
              {onDeposit ? (
                <Button variant="outline" className={cn('gap-1.5 px-2.5 sm:px-3', canManageRoles ? 'shrink-0' : 'w-full')} onClick={onDeposit}>
                  <Wallet className="h-4 w-4 shrink-0" /><span>Deposit</span>
                </Button>
              ) : null}
              {canManageRoles ? (
                onCoordinatorAction && profileRole !== 'manager' ? (
                  <Button variant="outline" className="min-w-0 flex-1 gap-1.5 px-2.5 sm:px-3 text-xs sm:text-sm" onClick={onCoordinatorAction}>
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span className="truncate">{profileRole === 'coordinator' ? 'Remove Coordinator' : 'Make Coordinator'}</span>
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="min-w-0 flex-1">
                        <Button variant="outline" className="w-full gap-1.5 px-2.5 sm:px-3 text-xs sm:text-sm" disabled>
                          <ShieldCheck className="h-4 w-4 shrink-0" /><span className="truncate">Unavailable</span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Action available only for linked accounts</TooltipContent>
                  </Tooltip>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SortableMemberCard({
  member, stats, deletingMemberId, onDeposit, onDelete, profileRole, onCoordinatorAction, canManageRoles, canManageMembers, isLinked,
}: {
  member: Member; stats: MemberStatsSnapshot; deletingMemberId?: string | null;
  onDeposit?: () => void; onDelete?: () => void;
  profileRole?: 'manager' | 'coordinator' | 'member'; onCoordinatorAction?: () => void;
  canManageRoles?: boolean; canManageMembers?: boolean; isLinked?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: member.id, disabled: !canManageMembers });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : undefined }} className={isDragging ? 'opacity-80' : undefined} {...attributes}>
      <MemberCard member={member} stats={stats} deletingMemberId={deletingMemberId} onDeposit={onDeposit} onDelete={onDelete} profileRole={profileRole} onCoordinatorAction={onCoordinatorAction} canManageRoles={canManageRoles} isLinked={isLinked} isDragging={isDragging} dragHandleProps={canManageMembers ? { ref: setActivatorNodeRef, ...listeners } : undefined} />
    </div>
  );
}

// ── Main Manager Members View ─────────────────────────────────────────────────
export function ManagerMembersView() {
  const { members, archivedMembers, removeMember, restoreMember, reorderMembers, getMemberStats, activeCycle } = useMeal();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [depositMemberId, setDepositMemberId] = useState<string | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [deletedMembers, setDeletedMembers] = useState<DeletedMemberGhost[]>([]);
  const { user, canManageMembers, canManageRoles, canManageDeposits } = useAuth();
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string; email: string; role: 'manager' | 'coordinator' | 'member' }>>([]);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTargetMemberId, setInviteTargetMemberId] = useState<string>('new');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<MemberInvite | null>(null);
  const [inviteManagerOpen, setInviteManagerOpen] = useState(false);
  const [archivedMembersOpen, setArchivedMembersOpen] = useState(false);
  const [countdownMemberIds, setCountdownMemberIds] = useState<Set<string>>(new Set());
  const [invites, setInvites] = useState<MemberInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const handleRemoveMember = async (memberId: string) => {
    if (deletingMemberId) return;
    const memberIndex = members.findIndex((entry) => entry.id === memberId);
    const member = members[memberIndex];
    if (!member) return;
    const stats = getMemberStats(memberId);
    const expiresAt = Date.now() + DELETE_GRACE_MS;
    setCountdownMemberIds((prev) => new Set(prev).add(memberId));
    setDeletingMemberId(memberId);
    try {
      await removeMember(memberId);
      setDeletedMembers((prev) => [
        ...prev.filter((entry) => entry.member.id !== memberId),
        { member, stats, index: Math.max(0, memberIndex), expiresAt },
      ]);
    } catch (error) {
      setCountdownMemberIds((prev) => { const next = new Set(prev); next.delete(memberId); return next; });
      throw error;
    } finally { setDeletingMemberId(null); }
  };

  const handleUndoMember = async (memberId: string) => {
    await restoreMember(memberId);
    setDeletedMembers((prev) => prev.filter((entry) => entry.member.id !== memberId));
    setCountdownMemberIds((prev) => { const next = new Set(prev); next.delete(memberId); return next; });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canManageMembers) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = members.findIndex((member) => member.id === active.id);
    const newIndex = members.findIndex((member) => member.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    void reorderMembers(arrayMove(members.map((member) => member.id), oldIndex, newIndex)).catch((error) => console.error('Could not reorder members:', error));
  };

  useEffect(() => {
    let active = true;
    if (!user) return;
    void Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('profiles').select('id, full_name, email, role').order('full_name'),
    ]).then(([selfResult, profilesResult]) => {
      if (!active) return;
      setProfiles((profilesResult.data ?? []).filter((profile) => profile.id !== user.id));
    });
    return () => { active = false; };
  }, [user?.id]);

  const toggleCoordinator = async (profileId: string, role: 'coordinator' | 'member') => {
    if (!canManageRoles || roleUpdating) return;
    setRoleUpdating(profileId);
    const { error } = await supabase.rpc('set_mess_role', { profile_id_input: profileId, role_input: role });
    if (error) console.error('Could not update member role:', error);
    else setProfiles((current) => current.map((profile) => profile.id === profileId ? { ...profile, role } : profile));
    setRoleUpdating(null);
  };

  const loadInvites = async () => {
    if (!canManageMembers) return;
    setInvitesLoading(true);
    const { data, error } = await supabase.rpc('list_member_invites');
    if (error) setInviteError(error.message);
    else setInvites((data ?? []) as MemberInvite[]);
    setInvitesLoading(false);
  };

  useEffect(() => { if (inviteManagerOpen) void loadInvites(); }, [inviteManagerOpen]);

  const createInvite = async () => {
    if (creatingInvite) return;
    setCreatingInvite(true); setInviteError(null);
    const targetMemberId = inviteTargetMemberId === 'new' ? null : inviteTargetMemberId;
    const { data, error } = await supabase.rpc('create_member_invite', { target_member_id_input: targetMemberId });
    if (error) setInviteError(error.message);
    else {
      const target = targetMemberId ? members.find((member) => member.id === targetMemberId) : null;
      setCreatedInvite({ ...(data as any), target_member_id: targetMemberId, target_member_name: target?.name ?? null, status: 'active' });
      setInviteOpen(false);
      void loadInvites();
    }
    setCreatingInvite(false);
  };

  const copyInvite = async (invite: MemberInvite) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite));
      setCopiedInviteId(invite.id);
      window.setTimeout(() => setCopiedInviteId(null), 1800);
    } catch { setInviteError('Could not copy the link. Please copy it from your browser address bar.'); }
  };

  const shareInvite = async (invite: MemberInvite) => {
    const text = invite.target_member_name ? `Join MealTrack and link your account to ${invite.target_member_name}.` : 'Join our MealTrack mess.';
    if (navigator.share) {
      try { await navigator.share({ title: 'MealTrack invitation', text, url: inviteUrl(invite) }); return; } catch { /* cancelled */ }
    }
    await copyInvite(invite);
  };

  const revokeInvite = async (inviteId: string) => {
    setInviteActionId(inviteId); setInviteError(null);
    const { error } = await supabase.rpc('revoke_member_invite', { invite_id_input: inviteId });
    if (error) setInviteError(error.message);
    else setInvites((current) => current.map((invite) => invite.id === inviteId ? { ...invite, status: 'revoked', revoked_at: new Date().toISOString() } : invite));
    setInviteActionId(null);
  };

  const memberCards = useMemo(() => {
    const cards: Array<{ type: 'member'; member: Member; index: number } | { type: 'deleted'; ghost: DeletedMemberGhost }> =
      members.map((member, index) => ({ type: 'member', member, index }));
    for (const ghost of [...deletedMembers].sort((a, b) => a.index - b.index)) {
      cards.splice(Math.min(ghost.index, cards.length), 0, { type: 'deleted', ghost });
    }
    return cards;
  }, [deletedMembers, members]);
  const visibleArchivedMembers = archivedMembers.filter((member) => !countdownMemberIds.has(member.id));

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
                <Users className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">Members</h1>
                <p className="hidden sm:block mt-1 text-sm leading-6 text-muted-foreground">Manage mess members and cycle deposits.</p>
              </div>
            </div>
            {canManageMembers ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={!activeCycle} className="shrink-0 gap-1.5 whitespace-nowrap shadow-sm sm:h-9">
                    <Plus className="h-4 w-4" /><span className="hidden sm:inline">Manage </span>Member<ChevronDown className="h-3.5 w-3.5 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem onSelect={() => { setInviteError(null); setInviteOpen(true); }}><Send className="h-4 w-4" />Invite Member</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setIsAddOpen(true)}><Plus className="h-4 w-4" />Add Offline Member</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setArchivedMembersOpen(true)} disabled={visibleArchivedMembers.length === 0}>
                    <RotateCcw className="h-4 w-4" />Archived Members{visibleArchivedMembers.length ? ` (${visibleArchivedMembers.length})` : ''}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setInviteManagerOpen(true)}><Clipboard className="h-4 w-4" />Manage Invite Links</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>

        {/* Dialogs */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}><DialogContent><DialogHeader><DialogTitle>Add New Member</DialogTitle></DialogHeader><AddMemberForm onClose={() => setIsAddOpen(false)} /></DialogContent></Dialog>

        <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setInviteError(null); setInviteTargetMemberId('new'); } }}>
          <DialogContent><DialogHeader><DialogTitle>Invite a member</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">The link works once and expires in 7 days. The recipient can create an account or sign in to join.</p>
              <div className="grid gap-2">
                <Button type="button" variant={inviteTargetMemberId === 'new' ? 'default' : 'outline'} className="h-auto justify-start p-4 text-left" onClick={() => setInviteTargetMemberId('new')}><div><p>Invite a new member</p><p className="mt-1 text-xs font-normal opacity-80">Their account name will be added to your roster.</p></div></Button>
                <Button type="button" variant={inviteTargetMemberId !== 'new' ? 'default' : 'outline'} className="h-auto justify-start p-4 text-left" onClick={() => { if (members.some((member) => !member.profileId)) setInviteTargetMemberId(members.find((member) => !member.profileId)?.id ?? 'new'); }} disabled={!members.some((member) => !member.profileId)}><div><p>Link an offline member</p><p className="mt-1 text-xs font-normal opacity-80">Keep their existing meals and deposits attached to their account.</p></div></Button>
              </div>
              {inviteTargetMemberId !== 'new' ? <Select value={inviteTargetMemberId} onValueChange={setInviteTargetMemberId}><SelectTrigger><SelectValue placeholder="Choose an offline member" /></SelectTrigger><SelectContent>{members.filter((member) => !member.profileId).map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select> : null}
              {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
              <Button className="w-full" disabled={creatingInvite} onClick={() => void createInvite()}>{creatingInvite ? 'Creating link...' : 'Create invite link'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!createdInvite} onOpenChange={(open) => !open && setCreatedInvite(null)}>
          <DialogContent><DialogHeader><DialogTitle>Invite link ready</DialogTitle></DialogHeader>
            {createdInvite ? <div className="space-y-4">
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                <p className="font-semibold">{createdInvite.target_member_name ? `For ${createdInvite.target_member_name}` : 'For a new member'}</p>
                <p className="mt-1 text-muted-foreground">One use only · expires {inviteTime(createdInvite.expires_at)}</p>
                <p className="mt-3 break-all rounded-md bg-background p-2 font-mono text-xs">{inviteUrl(createdInvite)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void copyInvite(createdInvite)}>{copiedInviteId === createdInvite.id ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy link</>}</Button>
                <Button variant="outline" onClick={() => void shareInvite(createdInvite)}><Send className="h-4 w-4" />Share</Button>
              </div>
            </div> : null}
          </DialogContent>
        </Dialog>

        <Dialog open={inviteManagerOpen} onOpenChange={setInviteManagerOpen}>
          <DialogContent size="lg"><DialogHeader><DialogTitle>Invite links</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Links are one-time and expire after 7 days.</p>
              {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
              {invitesLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading invite links...</p> : invites.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No invite links yet.</p> : (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto">
                  {invites.map((invite) => (
                    <div key={invite.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{invite.target_member_name ? `Link ${invite.target_member_name}` : 'New member invite'}</p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{invite.status === 'active' ? `Expires ${inviteTime(invite.expires_at)}` : `${invite.status[0].toUpperCase()}${invite.status.slice(1)}${invite.claimed_at ? ` ${inviteTime(invite.claimed_at)}` : ''}`}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${invite.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{invite.status}</span>
                      </div>
                      {invite.status === 'active' ? (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => void copyInvite(invite)}>{copiedInviteId === invite.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy</Button>
                          <Button size="sm" variant="outline" onClick={() => void shareInvite(invite)}><Send className="h-4 w-4" />Share</Button>
                          <Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={inviteActionId === invite.id} onClick={() => void revokeInvite(invite.id)}><Trash2 className="h-4 w-4" />Revoke</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="mt-3" onClick={() => { setInviteManagerOpen(false); setInviteTargetMemberId(invite.target_member_id ?? 'new'); setInviteOpen(true); }}><RotateCcw className="h-4 w-4" />Create replacement</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={archivedMembersOpen} onOpenChange={setArchivedMembersOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Archived members</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Historical meal and deposit records are preserved. Restore a member to add them back to the active roster.</p>
            {visibleArchivedMembers.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted-foreground">No archived members.</p>
            ) : (
              <div className="max-h-[55vh] divide-y overflow-y-auto rounded-xl border">
                {visibleArchivedMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">Historical records retained</p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => void restoreMember(member.id).catch((error) => console.error('Could not restore archived member:', error))}>
                      <RotateCcw className="h-4 w-4" />Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Member list / empty states */}
        {!activeCycle ? (
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[350px] animate-in fade-in-50 duration-300">
            <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary"><Play className="h-10 w-10 text-primary animate-pulse" /></div>
            <h3 className="font-heading text-lg font-bold text-foreground">No Active Cycle</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">You must start an active cycle before managing members.</p>
            <Link href="/app/settings"><Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"><Plus className="h-4 w-4" />Start New Cycle</Button></Link>
          </Card>
        ) : members.length === 0 ? (
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-card/50 backdrop-blur-sm min-h-[350px] animate-in fade-in-50 duration-300">
            <div className="rounded-full bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4 ring-8 ring-primary/5 text-primary"><Users className="h-10 w-10 text-primary animate-pulse" /></div>
            <h3 className="font-heading text-lg font-bold text-foreground">No members in this cycle</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-2 mb-6 leading-relaxed">Add roommates, family members, or mess colleagues to start tracking their meals, deposits, and shared expenses.</p>
            <Button className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform bg-primary hover:bg-primary/95 text-primary-foreground font-semibold" onClick={() => setIsAddOpen(true)}><Plus className="h-4 w-4" />Add Your First Member</Button>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={members.map((member) => member.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {memberCards.map((item) => {
                  if (item.type === 'deleted') {
                    const { ghost } = item;
                    return <UndoDeleteGhost key={`deleted-${ghost.member.id}`} message={`Member '${ghost.member.name}' deleted.`} expiresAt={ghost.expiresAt} onUndo={() => void handleUndoMember(ghost.member.id)} onExpired={() => {
                      setDeletedMembers((prev) => prev.filter((entry) => entry.member.id !== ghost.member.id));
                      setCountdownMemberIds((prev) => { const next = new Set(prev); next.delete(ghost.member.id); return next; });
                    }} className="min-h-full"><MemberCard member={ghost.member} stats={ghost.stats} /></UndoDeleteGhost>;
                  }
                  const stats = getMemberStats(item.member.id);
                  const linkedProfile = profiles.find((profile) => profile.id === item.member.profileId);
                  const coordinatorAction = canManageRoles && linkedProfile && linkedProfile.role !== 'manager' ? () => void toggleCoordinator(linkedProfile.id, linkedProfile.role === 'coordinator' ? 'member' : 'coordinator') : undefined;
                  return <SortableMemberCard key={item.member.id} member={item.member} stats={stats} deletingMemberId={deletingMemberId} onDeposit={canManageDeposits ? () => setDepositMemberId(item.member.id) : undefined} onDelete={canManageMembers ? () => handleRemoveMember(item.member.id) : undefined} profileRole={linkedProfile?.role} onCoordinatorAction={coordinatorAction} canManageRoles={canManageRoles} canManageMembers={canManageMembers} isLinked={!!item.member.profileId} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Dialog open={!!depositMemberId} onOpenChange={(open) => !open && setDepositMemberId(null)}>
          <DialogContent><DialogHeader><DialogTitle>Manage Deposit</DialogTitle></DialogHeader>
            {depositMemberId && <DepositForm memberId={depositMemberId} onClose={() => setDepositMemberId(null)} />}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
