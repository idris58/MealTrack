import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';

import { supabase } from '@/lib/supabase';
import type { Member } from '@/lib/meal-types';

type Options = {
  userId: string | null;
  messId: string | null;
  activeCycleId: string | null;
  members: Member[];
  setMembers: Dispatch<SetStateAction<Member[]>>;
  setArchivedMembers: Dispatch<SetStateAction<Member[]>>;
  reload: () => void;
  broadcast: () => void;
};

const avatarFor = (name: string, avatar?: string | null) =>
  avatar || name.substring(0, 2).toUpperCase();

export function useMembers(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  const addMember = useCallback(async (name: string) => {
    const { userId, messId, members, setMembers, broadcast } = latest.current;
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
    broadcast();
  }, []);

  const reorderMembers = useCallback(async (memberIds: string[]) => {
    const { userId, messId, members, setMembers, broadcast } = latest.current;
    if (!userId || !messId || memberIds.length !== members.length) return;
    const byId = new Map(members.map((member) => [member.id, member]));
    const next = memberIds.map((id) => byId.get(id)).filter((member): member is Member => Boolean(member));
    if (next.length !== members.length) return;
    setMembers(next);
    const { error } = await supabase.rpc('reorder_mess_members', { member_ids_input: memberIds });
    if (error) {
      setMembers(members);
      throw new Error('Could not save member order.');
    }
    broadcast();
  }, []);

  const updateMember = useCallback(async (id: string, updates: Partial<Member>) => {
    const { userId, messId, members, setMembers, broadcast } = latest.current;
    if (!userId || !messId) return;
    const current = members.find((member) => member.id === id);
    if (!current) return;
    const hasNameChange = updates.name !== undefined && updates.name !== current.name;
    const hasAvatarChange = updates.avatar !== undefined && updates.avatar !== current.avatar;
    if (!hasNameChange && !hasAvatarChange) return;
    const update: Record<string, unknown> = {};
    if (updates.name !== undefined) update.name = updates.name;
    if (updates.avatar !== undefined) update.avatar = updates.avatar;
    const { error } = await supabase.from('members').update(update).eq('id', id).eq('mess_id', messId);
    if (error) throw new Error('Unable to update member. Please try again.');
    setMembers((previous) => previous.map((member) => member.id === id
      ? { ...member, ...updates, deposit: member.deposit, mealsEaten: member.mealsEaten }
      : member));
    broadcast();
  }, []);

  const removeMember = useCallback(async (id: string) => {
    const { userId, messId, members, setMembers, setArchivedMembers, broadcast } = latest.current;
    if (!userId || !messId) return;
    const current = members.find((member) => member.id === id);
    if (!current) return;
    const [meals, deposits] = await Promise.all([
      supabase.from('meal_logs').select('id', { head: true, count: 'exact' }).eq('member_id', id),
      supabase.from('cycle_deposits').select('id', { head: true, count: 'exact' }).eq('member_id', id),
    ]);
    if (meals.error || deposits.error) throw new Error('Unable to verify this member\u2019s history. Please try again.');
    const hasHistory = (meals.count ?? 0) > 0 || (deposits.count ?? 0) > 0;
    // Use the RPC which atomically soft-deletes the member AND clears the
    // linked profile's mess_id so RLS immediately revokes access.
    const { error } = await supabase.rpc('remove_mess_member', { member_id_input: id });
    if (error) throw new Error(error.message || 'Unable to remove member. Please try again.');
    setMembers((previous) => previous.filter((member) => member.id !== id));
    if (hasHistory) setArchivedMembers((previous) => previous.some((member) => member.id === id)
      ? previous : [...previous, { ...current, archived: true }]);
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
