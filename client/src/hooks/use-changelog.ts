import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

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
  } | Array<{
    id: string;
    full_name: string;
    picture_url?: string | null;
    role?: string | null;
  }> | null;
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

type ChangelogSearchRow = ChangelogRow & {
  actor_profile_id: string | null;
  actor_full_name: string | null;
  actor_picture_url: string | null;
  actor_role: string | null;
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
  const pageRef = useRef(0);
  const requestRef = useRef(0);
  const loadingRef = useRef(false);

  // Audit rows are now written atomically by PostgreSQL SECURITY DEFINER triggers
  // using auth.uid(), preventing forgery and saving client round-trips.
  const recordChangelog = useCallback(async (_input?: RecordChangelogInput) => {}, []);

  const loadMore = useCallback(async (
    cycleIds: string[],
    entityType: ChangelogEntityType | 'all',
    action: ChangelogAction | 'all',
    search: string,
    reset = false,
  ) => {
    if (!userId || !messId || cycleIds.length === 0 || (loadingRef.current && !reset)) return;

    const requestId = ++requestRef.current;
    const from = reset ? 0 : pageRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('search_changelog_entries', {
        cycle_ids_input: cycleIds,
        entity_type_input: entityType,
        action_input: action,
        search_input: search,
        offset_input: from,
        limit_input: CHANGELOG_PAGE_SIZE,
      });

      if (error) throw error;
      if (requestId !== requestRef.current) return;

      const rpcRows = (data ?? []) as ChangelogSearchRow[];
      const next = mapChangelogRows(
        rpcRows.map((row) => ({
          ...row,
          profiles: row.actor_profile_id && row.actor_full_name
            ? {
                id: row.actor_profile_id,
                full_name: row.actor_full_name,
                picture_url: row.actor_picture_url,
                role: row.actor_role,
              }
            : null,
        })),
        profilesMapRef.current,
      );
      setEntries((previous) => {
        if (reset) return next;
        const seen = new Set(previous.map((entry) => entry.id));
        return [...previous, ...next.filter((entry) => !seen.has(entry.id))];
      });
      pageRef.current = from + next.length;
      setHasMore(next.length === CHANGELOG_PAGE_SIZE);
    } catch (error) {
      if (requestId === requestRef.current) console.error('Error loading changelog entries:', error);
    } finally {
      if (requestId === requestRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [messId, profilesMapRef, userId]);

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
