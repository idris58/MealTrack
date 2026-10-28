/**
 * dashboard-fab.tsx
 * Modern, animated Speed-Dial Floating Action Button for the Dashboard.
 * Replaces bulky static quick action tiles with a sleek, floating interaction.
 *
 * Actions:
 *  1. 🛒 Add Expense (if canManageExpenses & activeCycle)
 *  2. 🍽️ Log Meals (if canOperateMeals & activeCycle)
 *  3. 📢 Post Notice (if manager/coordinator)
 */
import { useState } from 'react';
import {
  Plus,
  X,
  ShoppingBag,
  Utensils,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useMealData } from '@/lib/meal-context';
import { NoticeDialog } from '@/components/notice-dialog';

interface DashboardFabProps {
  onOpenExpense: () => void;
  onOpenMeal: () => void;
}

export function DashboardFab({ onOpenExpense, onOpenMeal }: DashboardFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  const { profile, canManageExpenses, canOperateMeals } = useAuth();
  const { activeCycle } = useMealData();

  const canPostNotice =
    profile?.role === 'manager' || profile?.role === 'coordinator';

  // If the user has no allowed actions, don't show the FAB
  if (!canManageExpenses && !canOperateMeals && !canPostNotice) {
    return null;
  }

  const actions = [
    ...(canManageExpenses && activeCycle
      ? [
          {
            id: 'expense',
            label: 'Add Expense',
            icon: ShoppingBag,
            color: 'bg-success hover:bg-success/90 text-success-foreground shadow-success/25',
            badgeBg: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
            onClick: () => {
              setIsOpen(false);
              onOpenExpense();
            },
          },
        ]
      : []),
    ...(canOperateMeals && activeCycle
      ? [
          {
            id: 'meal',
            label: 'Log Meals',
            icon: Utensils,
            color: 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/25',
            badgeBg: 'bg-blue-50 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200 border-blue-200 dark:border-blue-800',
            onClick: () => {
              setIsOpen(false);
              onOpenMeal();
            },
          },
        ]
      : []),
    ...(canPostNotice
      ? [
          {
            id: 'notice',
            label: 'Post Notice',
            icon: Megaphone,
            color: 'bg-warning hover:bg-warning/90 text-warning-foreground shadow-warning/25',
            badgeBg: 'bg-amber-50 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border-amber-200 dark:border-amber-800',
            onClick: () => {
              setIsOpen(false);
              setShowNoticeDialog(true);
            },
          },
        ]
      : []),
  ];

  if (actions.length === 0) return null;

  return (
    <>
      {/* Backdrop overlay when speed dial is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/50 backdrop-blur-xs transition-opacity animate-in fade-in"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Speed Dial Container */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 sm:bottom-8 sm:right-8 z-40 flex flex-col items-end gap-3">
        {/* Expanded Speed-Dial Action Items */}
        {isOpen && (
          <div className="flex flex-col items-end gap-2.5 mb-1 animate-in slide-in-from-bottom-3 fade-in duration-200">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <div
                  key={action.id}
                  className="flex items-center gap-2.5 group cursor-pointer"
                  onClick={action.onClick}
                  style={{
                    animationDelay: `${index * 40}ms`,
                  }}
                >
                  {/* Action Label Pill */}
                  <span
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold shadow-md border backdrop-blur-md transition-all group-hover:scale-105',
                      action.badgeBg,
                    )}
                  >
                    {action.label}
                  </span>

                  {/* Action Icon Button */}
                  <button
                    type="button"
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-transform duration-200 group-hover:scale-110 active:scale-95',
                      action.color,
                    )}
                    aria-label={action.label}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Main Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Close actions menu' : 'Open quick actions menu'}
          aria-expanded={isOpen}
          className={cn(
            'group relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl shadow-primary/30 transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
            isOpen
              ? 'bg-foreground text-background rotate-90 scale-95'
              : 'bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white hover:scale-105 active:scale-95',
          )}
        >
          {isOpen ? (
            <X className="h-6 w-6 transition-transform" />
          ) : (
            <>
              <Plus className="h-7 w-7 transition-transform group-hover:rotate-90 duration-300" />
              {/* Subtle ambient pulse ring when closed */}
              <span className="absolute -inset-1 -z-10 animate-ping rounded-full bg-emerald-500/20 opacity-75 group-hover:opacity-100" />
            </>
          )}
        </button>
      </div>

      {/* Notice Dialog trigger from FAB */}
      {showNoticeDialog && (
        <NoticeDialog
          mode="post"
          open={showNoticeDialog}
          onOpenChange={setShowNoticeDialog}
        />
      )}
    </>
  );
}
