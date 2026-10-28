import { CalendarDays, Minus, Plus } from 'lucide-react';
import { format } from 'date-fns';

import { useMealCountEditor } from '@/hooks/use-meal-count-editor';
import type { MealLog, Member } from '@/lib/meal-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type MealCountEditorProps = {
  members: Member[];
  mealLogs: MealLog[];
  initialDate?: Date;
  cycleId?: string;
  onClose: () => void;
  submitLabel?: string;
  className?: string;
};

export function MealCountEditor({ members, mealLogs, initialDate, cycleId, onClose, submitLabel = 'Save Daily Log', className }: MealCountEditorProps) {
  const editor = useMealCountEditor({ members, mealLogs, initialDate, cycleId, onSave: onClose });

  return (
    <form onSubmit={(event) => { event.preventDefault(); void editor.save(); }} className={cn('space-y-6 pt-4', className)}>
      <div className="space-y-2">
        <label className="text-sm font-medium">Select Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start py-2 text-left text-sm font-normal">
              <CalendarDays className="mr-2 h-4 w-4" /> {format(editor.date, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center">
            <Calendar mode="single" selected={editor.date} onSelect={(date) => date && editor.setDate(date)} initialFocus className="p-3" />
          </PopoverContent>
        </Popover>
      </div>
      <div className="max-h-[40vh] space-y-4 overflow-y-auto pr-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between rounded-lg border bg-secondary/10 p-2">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0 text-xs"><AvatarFallback>{member.avatar}</AvatarFallback></Avatar>
              <span className="max-w-[100px] truncate text-sm font-medium">{member.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => editor.updateCount(member.id, -0.5)}><Minus className="h-3 w-3" /></Button>
              <Input className="h-8 w-16 px-1 text-center text-sm font-bold" inputMode="decimal" value={editor.mealCounts[member.id] ?? '0'} onChange={(event) => editor.setMealCount(member.id, event.target.value)} />
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => editor.updateCount(member.id, 0.5)}><Plus className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Button type="submit" variant="success" className="w-full" disabled={editor.isSubmitting}>
        {editor.isSubmitting ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}
