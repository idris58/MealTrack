import { ArrowLeft, ArrowRight, ChefHat, Compass, Home } from 'lucide-react';
import { Link, useLocation } from 'wouter';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  const [, setLocation] = useLocation();

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation('/app');
  };

  return (
    <main className="relative isolate flex min-h-[min(72vh,760px)] items-center justify-center overflow-hidden rounded-3xl border bg-card px-5 py-12 shadow-sm sm:px-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--muted-foreground)/0.12)_1px,transparent_1px)] [background-size:22px_22px] opacity-30" />
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <div className="relative mb-7 flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
          <div className="absolute inset-0 rounded-full border border-primary/15" />
          <div className="absolute inset-3 rounded-full border border-dashed border-primary/25" />
          <div className="absolute inset-7 rounded-full bg-gradient-to-br from-primary/15 via-emerald-500/5 to-transparent shadow-inner" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-lg shadow-primary/10 ring-1 ring-primary/10 sm:h-[4.5rem] sm:w-[4.5rem]">
            <ChefHat className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.7} />
          </div>
          <span className="absolute -right-1 top-5 rounded-full border bg-card px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-primary shadow-sm">404</span>
          <span className="absolute -bottom-1 left-0 flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm">
            <Compass className="h-4 w-4" />
          </span>
        </div>

        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Page not found
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Looks like this page took a wrong turn.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
          The link may be old, or the page may have moved. Let&apos;s get you back to your MealTrack workspace.
        </p>

        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="group h-11 rounded-xl px-5 shadow-md shadow-primary/15">
            <Link href="/app">
              <Home className="h-4 w-4" />
              Back to dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={goBack} className="h-11 rounded-xl px-5">
            <ArrowLeft className="h-4 w-4" />
            Go back
          </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/80">MealTrack · Shared meals, made simple</p>
      </section>
    </main>
  );
}
