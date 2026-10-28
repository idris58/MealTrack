import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  descriptionClassName?: string;
  children?: ReactNode;
};

export function PageHeader({ icon: Icon, title, description, descriptionClassName, children }: PageHeaderProps) {
  return (
    <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20 sm:h-11 sm:w-11 sm:rounded-2xl">
            <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className={cn('mt-1 hidden text-sm leading-6 text-muted-foreground sm:block', descriptionClassName)}>
              {description}
            </p>
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
