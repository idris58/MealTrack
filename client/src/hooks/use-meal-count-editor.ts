import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';

import { useMealActions, type MealLog, type Member } from '@/lib/meal-context';
import { runMutation } from '@/lib/run-mutation';
import { normalizeBengaliDigits } from '@/lib/localized-number';

type MealCountEditorOptions = {
  members: Pick<Member, 'id'>[];
  mealLogs: MealLog[];
  initialDate?: Date;
  cycleId?: string;
  onSave?: () => void;
};

const validMealCount = /^[0-9\u09E6-\u09EF]*\.?[0-9\u09E6-\u09EF]*$/;

export function useMealCountEditor({ members, mealLogs, initialDate, cycleId, onSave }: MealCountEditorOptions) {
  const { saveMealLogs } = useMealActions();
  const [date, setDate] = useState<Date>(initialDate ?? new Date());
  const [mealCounts, setMealCounts] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dirtyMembersRef = useRef(new Set<string>());
  const membersRef = useRef(members);
  const mealLogsRef = useRef(mealLogs);
  membersRef.current = members;
  mealLogsRef.current = mealLogs;

  useEffect(() => {
    setDate(initialDate ?? new Date());
  }, [initialDate]);

  useEffect(() => {
    const dateKey = format(date, 'yyyy-MM-dd');
    dirtyMembersRef.current.clear();
    setMealCounts(Object.fromEntries(membersRef.current.map((member) => {
      const log = mealLogsRef.current.find((entry) => entry.memberId === member.id && entry.date === dateKey);
      return [member.id, log ? String(log.count) : '0'];
    })));
  }, [date]);

  useEffect(() => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setMealCounts((previous) => {
      const next = { ...previous };
      for (const member of members) {
        if (dirtyMembersRef.current.has(member.id)) continue;
        const log = mealLogs.find((entry) => entry.memberId === member.id && entry.date === dateKey);
        next[member.id] = log ? String(log.count) : '0';
      }
      return next;
    });
  }, [date, mealLogs, members]);

  const updateCount = (memberId: string, delta: number) => {
    dirtyMembersRef.current.add(memberId);
    setMealCounts((previous) => {
      const current = Number.parseFloat(normalizeBengaliDigits(previous[memberId] || '0'));
      return { ...previous, [memberId]: String(Math.max(0, (Number.isFinite(current) ? current : 0) + delta)) };
    });
  };

  const setMealCount = (memberId: string, value: string) => {
    if (validMealCount.test(value)) {
      dirtyMembersRef.current.add(memberId);
      setMealCounts((previous) => ({ ...previous, [memberId]: value }));
    }
  };

  const save = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await runMutation(async () => {
        await saveMealLogs(
          members.map((member) => ({ memberId: member.id, count: Math.max(0, Number.parseFloat(normalizeBengaliDigits(mealCounts[member.id] || '0')) || 0) })),
          format(date, 'yyyy-MM-dd'),
          cycleId,
        );
        onSave?.();
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return { date, setDate, mealCounts, updateCount, setMealCount, isSubmitting, save };
}
