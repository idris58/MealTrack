import { useEffect, useState, type MutableRefObject } from 'react';

import { supabase } from '@/lib/supabase';
import type { ChangelogActor } from '@/lib/meal-types';

/** Resolves the authenticated user and their mess scope, with offline fallback. */
export function useMealIdentity(profilesRef: MutableRefObject<Map<string, ChangelogActor>>) {
  const [userId, setUserId] = useState<string | null>(null);
  const [messId, setMessId] = useState<string | null>(null);

  useEffect(() => {
    const resolve = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      setUserId(user.id);
      const cacheKey = `mealtrack-mess-id-${user.id}`;
      if (!navigator.onLine) {
        setMessId(localStorage.getItem(cacheKey));
        return;
      }
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('mess_id, full_name, picture_url, role')
        .eq('id', user.id)
        .maybeSingle();
      if (error) console.error('Error loading current mess:', error);
      if (profile) profilesRef.current.set(user.id, {
        id: user.id,
        name: profile.full_name,
        pictureUrl: profile.picture_url ?? null,
        role: profile.role ?? null,
      });
      const nextMessId = profile?.mess_id ?? null;
      setMessId(nextMessId);
      if (nextMessId) localStorage.setItem(cacheKey, nextMessId);
    };
    void resolve();
  }, [profilesRef]);

  return { userId, messId };
}
