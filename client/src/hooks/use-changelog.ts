import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { supabase } from '@/lib/supabase';
import type {
  ChangelogAction,
  ChangelogActor,
  ChangelogChange,
  ChangelogEntityType,
  ChangelogEntry,
} from '@/lib/meal-types';

export const CHANGELOG_PAGE_SIZE = 50;

export type ChangelogRow = {
  id: string;
  cycle_id: string;
  user_id?: string;
  profile_id?: string | null;
  entity_type: ChangelogEntityType;
  entity_id: string;
  action: ChangelogAction;
  title: string;
  changes: ChangelogChange[] | null;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string;
    picture_url?: string | null;
    role?: string | null;
  } | null;
};

export function mapChangelogRows(
  rows: ChangelogRow[],
  profilesMap?: Map<string, ChangelogActor>,
): ChangelogEntry[] {
  return rows.map((entry) => {
    const profileData = Array.isArray(entry.profiles)
      ? entry.profiles[0]
      : entry.profiles;
    const matched = profileData
      ? {
          id: profileData.id,
          name: profileData.full_name,
          pictureUrl: profileData.picture_url ?? null,
          role: (profileData.role as ChangelogActor['role']) ?? null,
        }
      : (entry.profile_id && profilesMap?.get(entry.profile_id)) ||
        (entry.user_id && profilesMap?.get(entry.user_id)) ||
        null;

    return {
      id: entry.id,
      cycleId: entry.cycle_id,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
      action: entry.action,
      title: entry.title,
      changes: entry.changes ?? [],
      createdAt: entry.created_at,
      actor: matched,
    };
  });
}

type RecordChangelogInput = {
  cycleId: string | null;
  entityType: ChangelogEntityType;
  entityId: string;
  action: ChangelogAction;
  title: string;
  changes: ChangelogChange[];
};

/**
 * Owns changelog state and persistence. Keeping it independent of meal data
 * lets member, expense, and meal-log actions record audit entries uniformly.
 */
export function useChangelog(
  userId: string | null,
  messId: string | null,
  profilesMapRef: MutableRefObject<Map<string, ChangelogActor>>,
) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const recordChangelog = useCallback(async ({
    cycleId,
    entityType,
    entityId,
    action,
    title,
    changes,
  }: RecordChangelogInput) => {
    if (!userId || !messId || !cycleId) return;

    const { data, error } = await supabase
      .from('changelog_entries')
      .insert([{
        user_id: userId,
        profile_id: userId,
        mess_id: messId,
        cycle_id: cycleId,
        entity_type: entityType,
        entity_id: entityId,
        action,
        title,
        changes,
      }])
      .select('*, profiles(id, full_name, picture_url, role)')
      .single();

    if (error) {
      console.error('Error recording changelog entry:', error);
      return;
    }

    const [entry] = mapChangelogRows([data as ChangelogRow], profilesMapRef.current);
    setEntries((previous) => [entry, ...previous]);
  }, [messId, profilesMapRef, userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !messId || loading || !hasMore) return;

    setLoading(true);
    try {
      const from = entries.length;
      const { data, error } = await supabase
        .from('changelog_entries')
        .select('*, profiles(id, full_name, picture_url, role)')
        .eq('mess_id', messId)
        .order('created_at', { ascending: false })
        .range(from, from + CHANGELOG_PAGE_SIZE - 1);

      if (error) throw error;

      const next = mapChangelogRows(
        (data ?? []) as ChangelogRow[],
        profilesMapRef.current,
      );
      setEntries((previous) => {
        const seen = new Set(previous.map((entry) => entry.id));
        return [...previous, ...next.filter((entry) => !seen.has(entry.id))];
      });
      setHasMore(next.length === CHANGELOG_PAGE_SIZE);
    } catch (error) {
      console.error('Error loading changelog entries:', error);
    } finally {
      setLoading(false);
    }
  }, [entries.length, hasMore, loading, messId, profilesMapRef, userId]);

  return {
    entries,
    setEntries: setEntries as Dispatch<SetStateAction<ChangelogEntry[]>>,
    hasMore,
    setHasMore,
    loading,
    recordChangelog,
    loadMore,
  };
}
