import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';

import { supabase } from '@/lib/supabase';
import type { ChangelogChange, Member } from '@/lib/meal-types';

const SOFT_DELETE_GRACE_MS = 10_000;

type RecordChange = (entry: {
  cycleId: string | null;
  entityType: 'member';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  title: string;
  changes: ChangelogChange[];
}) => Promise<void>;

type Options = {
  userId: string | null;
  messId: string | null;
  activeCycleId: string | null;
  members: Member[];
  setMembers: Dispatch<SetStateAction<Member[]>>;
  setArchivedMembers: Dispatch<SetStateAction<Member[]>>;
  recordChange: RecordChange;
  reload: () => void;
  broadcast: () => void;
};

const avatarFor = (name: string, avatar?: string | null) =>
  avatar || name.substring(0, 2).toUpperCase();

const updateChange = (
  field: string,
  label: string,
  from: string | null | undefined,
  to: string | null | undefined,
): ChangelogChange | null => from === to ? null : { field, label, from: from ?? null, to: to ?? null };

export function useMembers(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const addMember = useCallback(async (name: string) => {
    const { userId, messId, activeCycleId, members, setMembers, recordChange, broadcast } = latest.current;
    if (!userId || !messId) return;
    const { data, error } = await supabase
      .from('members')
      .insert([{
        name,
        avatar: name.substring(0, 2).toUpperCase(),
        user_id: userId,
        mess_id: messId,
        profile_id: null,
        sort_order: members.length,
      }])
      .select()
      .single();
    if (error) throw new Error('Unable to add member. Please try again.');

    setMembers((previous) => [...previous, {
      id: data.id, name: data.name, deposit: 0, mealsEaten: 0,
      avatar: avatarFor(data.name, data.avatar),
    }]);
    await recordChange({
      cycleId: activeCycleId, entityType: 'member', entityId: data.id,
      action: 'create', title: `Added member ${data.name}`,
      changes: [{ field: 'name', label: 'Name', value: data.name }],
    });
    broadcast();
  }, []);

  const reorderMembers = useCallback(async (memberIds: string[]) => {
    const { userId, messId, members, setMembers, broadcast } = latest.current;
    if (!userId || !messId || memberIds.length !== members.length) return;
    const byId = new Map(members.map((member) => [member.id, member]));
    const next = memberIds.map((id) => byId.get(id)).filter((member): member is Member => Boolean(member));
    if (next.length !== members.length) return;
    setMembers(next);
    const results = await Promise.all(memberIds.map((id, sortOrder) =>
      supabase.from('members').update({ sort_order: sortOrder }).eq('id', id).eq('mess_id', messId),
    ));
    if (results.some((result) => result.error)) {
      setMembers(members);
      throw new Error('Could not save member order.');
    }
    broadcast();
  }, []);

  const updateMember = useCallback(async (id: string, updates: Partial<Member>) => {
    const { userId, messId, activeCycleId, members, setMembers, recordChange, broadcast } = latest.current;
    if (!userId || !messId) return;
    const current = members.find((member) => member.id === id);
    if (!current) return;
    const changes = [
      updateChange('name', 'Name', current.name, updates.name ?? current.name),
      updateChange('avatar', 'Avatar', current.avatar, updates.avatar ?? current.avatar),
    ].filter((change): change is ChangelogChange => Boolean(change));
    if (!changes.length) return;
    const update: Record<string, unknown> = {};
    if (updates.name !== undefined) update.name = updates.name;
    if (updates.avatar !== undefined) update.avatar = updates.avatar;
    const { error } = await supabase.from('members').update(update).eq('id', id).eq('mess_id', messId);
    if (error) throw new Error('Unable to update member. Please try again.');
    setMembers((previous) => previous.map((member) => member.id === id
      ? { ...member, ...updates, deposit: member.deposit, mealsEaten: member.mealsEaten }
      : member));
    await recordChange({
      cycleId: activeCycleId, entityType: 'member', entityId: id,
      action: 'update', title: `Updated member ${current.name}`, changes,
    });
    broadcast();
  }, []);

  const removeMember = useCallback(async (id: string) => {
    const { userId, messId, activeCycleId, members, setMembers, setArchivedMembers, recordChange, broadcast } = latest.current;
    if (!userId || !messId) return;
    const current = members.find((member) => member.id === id);
    if (!current) return;
    const [meals, deposits] = await Promise.all([
      supabase.from('meal_logs').select('id', { head: true, count: 'exact' }).eq('member_id', id),
      supabase.from('cycle_deposits').select('id', { head: true, count: 'exact' }).eq('member_id', id),
    ]);
    if (meals.error || deposits.error) throw new Error('Unable to verify this member’s history. Please try again.');
    const hasHistory = (meals.count ?? 0) > 0 || (deposits.count ?? 0) > 0;
    const now = new Date();
    const { error } = await supabase.from('members').update({
      deleted_at: now.toISOString(),
      delete_expires_at: hasHistory ? null : new Date(now.getTime() + SOFT_DELETE_GRACE_MS).toISOString(),
    }).eq('id', id).eq('mess_id', messId).is('deleted_at', null);
    if (error) throw new Error('Unable to remove member. Please try again.');
    setMembers((previous) => previous.filter((member) => member.id !== id));
    if (hasHistory) setArchivedMembers((previous) => previous.some((member) => member.id === id)
      ? previous : [...previous, { ...current, archived: true }]);
    await recordChange({
      cycleId: activeCycleId, entityType: 'member', entityId: id,
      action: 'delete', title: `${hasHistory ? 'Archived' : 'Deleted'} member ${current.name}`,
      changes: [{ field: 'name', label: 'Name', value: current.name }],
    });
    broadcast();
  }, []);

  const restoreMember = useCallback(async (id: string) => {
    const { userId, messId, setMembers, setArchivedMembers, reload, broadcast } = latest.current;
    if (!userId || !messId) return;
    const { data, error } = await supabase.from('members')
      .update({ deleted_at: null, delete_expires_at: null })
      .eq('id', id).eq('mess_id', messId).not('deleted_at', 'is', null)
      .select('id, name, avatar').maybeSingle();
    if (error) throw new Error('Unable to restore member. Please try again.');
    if (data) {
      setArchivedMembers((previous) => previous.filter((member) => member.id !== data.id));
      setMembers((previous) => previous.some((member) => member.id === data.id) ? previous : [...previous, {
        id: data.id, name: data.name, deposit: 0, mealsEaten: 0,
        avatar: avatarFor(data.name, data.avatar),
      }]);
    }
    reload();
    broadcast();
  }, []);

  return { addMember, reorderMembers, updateMember, removeMember, restoreMember };
}
