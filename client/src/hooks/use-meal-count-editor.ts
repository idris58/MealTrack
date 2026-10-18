import { useEffect, useState } from 'react';
import { format } from 'date-fns';

import { useMeal, type MealLog, type Member } from '@/lib/meal-context';
import { runMutation } from '@/lib/run-mutation';

type MealCountEditorOptions = {
  members: Pick<Member, 'id'>[];
  mealLogs: MealLog[];
  initialDate?: Date;
  cycleId?: string;
  onSave?: () => void;
};

const validMealCount = /^\d*\.?\d*$/;

export function useMealCountEditor({ members, mealLogs, initialDate, cycleId, onSave }: MealCountEditorOptions) {
  const { saveMealLogs } = useMeal();
  const [date, setDate] = useState<Date>(initialDate ?? new Date());
  const [mealCounts, setMealCounts] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setDate(initialDate ?? new Date());
  }, [initialDate]);

  useEffect(() => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setMealCounts(Object.fromEntries(members.map((member) => {
      const log = mealLogs.find((entry) => entry.memberId === member.id && entry.date === dateKey);
      return [member.id, log ? String(log.count) : '0'];
    })));
  }, [date, mealLogs, members]);

  const updateCount = (memberId: string, delta: number) => {
    setMealCounts((previous) => {
      const current = Number.parseFloat(previous[memberId] || '0');
      return { ...previous, [memberId]: String(Math.max(0, (Number.isFinite(current) ? current : 0) + delta)) };
    });
  };

  const setMealCount = (memberId: string, value: string) => {
    if (validMealCount.test(value)) setMealCounts((previous) => ({ ...previous, [memberId]: value }));
  };

  const save = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await runMutation(async () => {
        await saveMealLogs(
          members.map((member) => ({ memberId: member.id, count: Math.max(0, Number.parseFloat(mealCounts[member.id] || '0') || 0) })),
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
