import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, startOfDay } from 'date-fns';
import { CalendarDays, Check, Clock3, Loader2, MessageSquareText, Plus, UtensilsCrossed, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Member } from '@/lib/meal-context';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
type MealPeriod = 'all_day' | 'lunch' | 'dinner';

type MealOffRequest = {
  id: string;
  member_id: string;
  requested_by_profile_id: string;
  start_date: string;
  end_date: string;
  meal_period: MealPeriod;
  status: RequestStatus;
  note: string | null;
  created_at: string;
};

type MealOffRequestsProps = {
  activeCycleId: string;
  members: Member[];
  profile: { id: string; mess_id: string | null; role: 'manager' | 'coordinator' | 'member' };
  canOperateMeals: boolean;
};

const periodOptions: Array<{ value: MealPeriod; label: string; helper: string }> = [
  { value: 'all_day', label: 'All meals', helper: 'Away for the day' },
  { value: 'lunch', label: 'Lunch', helper: 'Skip lunch only' },
  { value: 'dinner', label: 'Dinner', helper: 'Skip dinner only' },
];

const statusStyle: Record<RequestStatus, string> = {
  pending: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  declined: 'border-destructive/20 bg-destructive/10 text-destructive',
  cancelled: 'border-muted-foreground/20 bg-muted text-muted-foreground',
};

function requestDates(request: MealOffRequest) {
  const start = parseISO(request.start_date);
  const end = parseISO(request.end_date);
  return request.start_date === request.end_date
    ? format(start, 'EEE, MMM d')
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

function periodLabel(period: MealPeriod) {
  return periodOptions.find((option) => option.value === period)?.label ?? 'All meals';
}

function RequestRow({
  request,
  memberName,
  isStaff,
  busyId,
  onApprove,
  onDecline,
  onCancel,
}: {
  request: MealOffRequest;
  memberName?: string;
  isStaff: boolean;
  busyId: string | null;
  onApprove: (request: MealOffRequest) => void;
  onDecline: (request: MealOffRequest) => void;
  onCancel: (request: MealOffRequest) => void;
}) {
  const isBusy = busyId === request.id;
  const canReview = isStaff && request.status === 'pending';
  const canCancel = !isStaff && request.status === 'pending';

  return (
    <div className="rounded-xl border bg-card/70 p-3.5 shadow-sm transition-colors hover:bg-accent/30 sm:p-4">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UtensilsCrossed className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold leading-none text-foreground">
              {isStaff ? memberName ?? 'Member' : `${periodLabel(request.meal_period)} off`}
            </p>
            {isStaff ? <span className="text-sm text-muted-foreground">· {periodLabel(request.meal_period)}</span> : null}
            <Badge variant="outline" className={cn('capitalize', statusStyle[request.status])}>{request.status}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{requestDates(request)}</span>
            <span>{request.start_date === request.end_date ? 'One day' : 'Date range'}</span>
          </div>
          {request.note ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{request.note}</p> : null}
        </div>
      </div>
      {canReview || canCancel ? (
        <div className="mt-3 flex items-center justify-end gap-2 border-t pt-3">
          {canReview ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isBusy} onClick={() => onDecline(request)}>
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Decline
              </Button>
              <Button size="sm" className="gap-1.5" disabled={isBusy} onClick={() => onApprove(request)}>
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </Button>
            </>
          ) : null}
          {canCancel ? <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onCancel(request)}>Cancel request</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function MealOffRequests({ activeCycleId, members, profile, canOperateMeals }: MealOffRequestsProps) {
  const [requests, setRequests] = useState<MealOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const earliestDate = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(earliestDate);
  const [endDate, setEndDate] = useState(earliestDate);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>('all_day');
  const [note, setNote] = useState('');

  const linkedMember = useMemo(
    () => members.find((member) => member.profileId === profile.id),
    [members, profile.id],
  );
  const memberNames = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('meal_off_requests')
      .select('*')
      .eq('cycle_id', activeCycleId)
      .order('start_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Could not load meal-off requests', { description: error.message });
    } else {
      setRequests((data ?? []) as MealOffRequest[]);
    }
    setLoading(false);
  }, [activeCycleId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const resetForm = () => {
    setStartDate(earliestDate);
    setEndDate(earliestDate);
    setMealPeriod('all_day');
    setNote('');
  };

  const submitRequest = async () => {
    if (!linkedMember || !profile.mess_id) return;
    if (endDate < startDate) {
      toast.error('Choose a valid date range', { description: 'The end date cannot be before the start date.' });
      return;
    }

    const hasOverlap = requests.some((request) =>
      ['pending', 'approved'].includes(request.status)
      && (request.meal_period === mealPeriod || request.meal_period === 'all_day' || mealPeriod === 'all_day')
      && request.start_date <= endDate
      && request.end_date >= startDate,
    );
    if (hasOverlap) {
      toast.error('You already have an overlapping request', {
        description: 'Review or cancel the existing request before submitting another one for those meals.',
      });
      return;
    }

    setBusyId('new');
    const { error } = await supabase.from('meal_off_requests').insert({
      mess_id: profile.mess_id,
      cycle_id: activeCycleId,
      member_id: linkedMember.id,
      requested_by_profile_id: profile.id,
      start_date: startDate,
      end_date: endDate,
      meal_period: mealPeriod,
      note: note.trim() || null,
    });
    setBusyId(null);

    if (error) {
      toast.error('Could not send your request', { description: error.message });
      return;
    }

    toast.success('Request sent', { description: 'Your manager or coordinator can now review it.' });
    setDialogOpen(false);
    resetForm();
    void loadRequests();
  };

  const reviewRequest = async (request: MealOffRequest, status: 'approved' | 'declined') => {
    setBusyId(request.id);
    const { error } = await supabase
      .from('meal_off_requests')
      .update({ status, reviewed_by_profile_id: profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', request.id);
    setBusyId(null);

    if (error) {
      toast.error(`Could not ${status === 'approved' ? 'approve' : 'decline'} request`, { description: error.message });
      return;
    }
    toast.success(status === 'approved' ? 'Meal-off request approved' : 'Meal-off request declined');
    void loadRequests();
  };

  const cancelRequest = async (request: MealOffRequest) => {
    setBusyId(request.id);
    const { error } = await supabase
      .from('meal_off_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', request.id);
    setBusyId(null);

    if (error) {
      toast.error('Could not cancel request', { description: error.message });
      return;
    }
    toast.success('Request cancelled');
    void loadRequests();
  };

  const visibleRequests = canOperateMeals ? requests : requests.filter((request) => request.requested_by_profile_id === profile.id);
  const pendingRequests = visibleRequests.filter((request) => request.status === 'pending');
  const scheduledRequests = visibleRequests.filter((request) => request.status !== 'pending');

  if (!canOperateMeals && !linkedMember) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Clock3 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold sm:text-lg">{canOperateMeals ? 'Meal-off requests' : 'Plan a meal off'}</h2>
              <p className="mt-0.5 max-w-2xl text-sm leading-5 text-muted-foreground">
                {canOperateMeals
                  ? 'Review upcoming absences before planning meals. Approval never changes a meal that was already logged.'
                  : 'Let the mess team know before an upcoming meal. This is a request only—actual meal counts stay with your manager.'}
              </p>
            </div>
          </div>
          {!canOperateMeals ? (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 self-start shadow-sm"><Plus className="h-4 w-4" />Request meal off</Button>
              </DialogTrigger>
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>Request a meal off</DialogTitle>
                  <p className="text-sm leading-5 text-muted-foreground">Choose today or a future date for an upcoming meal. Your request will not change any meal that has already been logged.</p>
                </DialogHeader>
                <div className="grid gap-5 py-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2"><Label htmlFor="meal-off-start">From</Label><Input id="meal-off-start" type="date" min={earliestDate} value={startDate} onChange={(event) => { setStartDate(event.target.value); if (endDate < event.target.value) setEndDate(event.target.value); }} /></div>
                    <div className="grid gap-2"><Label htmlFor="meal-off-end">Until</Label><Input id="meal-off-end" type="date" min={startDate || earliestDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Which meal?</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {periodOptions.map((option) => (
                        <button key={option.value} type="button" onClick={() => setMealPeriod(option.value)} className={cn('rounded-xl border px-2 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', mealPeriod === option.value ? 'border-primary bg-primary/10 shadow-sm' : 'bg-card hover:bg-accent/50')}>
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{option.helper}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2"><Label htmlFor="meal-off-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="meal-off-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="Travelling, family plans, or anything helpful for the team" className="min-h-[82px] resize-none" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button className="gap-1.5" disabled={busyId === 'new'} onClick={() => void submitRequest()}>{busyId === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}Send request</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <section className={cn('space-y-3', !canOperateMeals && 'lg:col-span-2')}>
            <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{canOperateMeals ? 'Needs review' : 'Awaiting review'}</p>{pendingRequests.length ? <Badge variant="secondary">{pendingRequests.length}</Badge> : null}</div>
            {loading ? <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading requests</div> : pendingRequests.length ? pendingRequests.map((request) => <RequestRow key={request.id} request={request} memberName={memberNames.get(request.member_id)} isStaff={canOperateMeals} busyId={busyId} onApprove={(item) => void reviewRequest(item, 'approved')} onDecline={(item) => void reviewRequest(item, 'declined')} onCancel={(item) => void cancelRequest(item)} />) : <div className="rounded-xl border border-dashed bg-background/50 px-4 py-5 text-sm text-muted-foreground">{canOperateMeals ? 'No requests need review. Your upcoming meal plan is clear.' : 'No pending requests. Use “Request meal off” when you need one.'}</div>}
          </section>
          {canOperateMeals ? <section className="space-y-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Scheduled & resolved</p>{loading ? <div className="h-24 rounded-xl border border-dashed" /> : scheduledRequests.length ? scheduledRequests.slice(0, 5).map((request) => <RequestRow key={request.id} request={request} memberName={memberNames.get(request.member_id)} isStaff={canOperateMeals} busyId={busyId} onApprove={(item) => void reviewRequest(item, 'approved')} onDecline={(item) => void reviewRequest(item, 'declined')} onCancel={(item) => void cancelRequest(item)} />) : <div className="rounded-xl border border-dashed bg-background/50 px-4 py-5 text-sm text-muted-foreground">Approved requests will appear here for the meal-planning team.</div>}</section> : null}
        </div>
      </CardContent>
    </Card>
  );
}
