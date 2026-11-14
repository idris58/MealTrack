import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChefHat,
  History,
  Link2,
  Scale,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  UsersRound,
  Utensils,
  Wallet,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Local building blocks                                                */
/* ------------------------------------------------------------------ */

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label="MealTrack home">
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
      >
        <ChefHat className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.2} />
      </span>
      <span
        className={cn(
          "font-heading font-bold tracking-tight text-foreground",
          compact ? "text-base" : "text-lg",
        )}
      >
        MealTrack
      </span>
    </a>
  );
}

function Eyebrow({ icon: Icon, children, muted = false }: {
  icon?: React.ElementType;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] shadow-sm",
        muted
          ? "border-border/70 bg-card/70 text-muted-foreground"
          : "border-primary/20 bg-primary/10 text-emerald-700 dark:text-emerald-400",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  iconClass,
  iconBgClass,
  title,
  description,
}: {
  icon: React.ElementType;
  iconClass: string;
  iconBgClass: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-border/70 bg-card/75 p-5 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/[0.08]">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconBgClass)}>
        <Icon className={cn("h-4 w-4", iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/**
 * CSS-art placeholder for the product UI — shown in the hero browser frame and
 * the command-center section. Swap the whole component for a <img> of a real
 * capture later. All figures are illustrative.
 */
function CommandPanel({ className }: { className?: string }) {
  const tiles: Array<[string, string]> = [
    ["Meal costs", "৳18,900"],
    ["Utility costs", "৳13,500"],
    ["Utility / member", "৳3,375"],
  ];

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70 sm:text-[11px]">
          Financial health
        </p>
        <span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100 sm:text-[10px]">
          Healthy reserve
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4 sm:mt-4">
        <p className="font-heading text-4xl font-extrabold tabular-nums leading-none text-white sm:text-5xl">
          ৳12,600
        </p>
        <div className="shrink-0 text-right">
          <p className="text-[9px] uppercase tracking-[0.16em] text-emerald-100/50 sm:text-[10px]">Remaining</p>
          <p className="text-[10px] text-emerald-100/75 sm:text-xs">of ৳45,000 pooled</p>
        </div>
      </div>

      <div className="mt-4 sm:mt-5">
        <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-100/70 sm:text-[11px]">
          <span>Spent / deposits</span>
          <span className="tabular-nums">৳32,400 / ৳45,000 · 72%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/25 ring-1 ring-white/10">
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-emerald-200 to-teal-100" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
        {tiles.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[0.07] px-2.5 py-2.5 backdrop-blur-sm sm:px-3"
          >
            <p className="truncate text-[8px] uppercase tracking-[0.14em] text-emerald-100/60 sm:text-[10px]">
              {label}
            </p>
            <p className="mt-1 truncate font-heading text-xs font-bold tabular-nums text-white sm:text-base">
              {value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[9px] uppercase tracking-[0.16em] text-emerald-100/45 sm:text-[10px]">
        Sample cycle · illustrative
      </p>
    </div>
  );
}

function GlowBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[130px] dark:bg-primary/[0.13]" />
      <div className="absolute -bottom-40 -right-20 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[110px] dark:bg-emerald-500/[0.09]" />
      <div className="absolute bottom-10 left-1/3 h-[300px] w-[400px] rounded-full bg-sky-500/5 blur-[90px] dark:bg-violet-500/[0.07]" />
      <div
        className="absolute inset-0 opacity-[0.035] dark:opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
    </div>
  );
}

function PanelOrbs() {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-teal-300/[0.08] blur-3xl" />
    </>
  );
}

const signBtnClass =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div id="top" className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground selection:bg-primary/20">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-primary"
      >
        Skip to content
      </a>

      <GlowBackdrop />

      {/* ============ Nav ============ */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <BrandLockup />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Product">
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href="/app/auth">Sign in</a>
            </Button>
            <Button asChild size="sm" className="shadow-sm shadow-primary/20">
              <a href="/app/auth?mode=signup">Create your mess</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ============ Hero ============ */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pt-20">
            <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6">
                <Eyebrow icon={Sparkles}>Free for every mess</Eyebrow>
                <h1 className="mt-5 font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.4rem]">
                  Every meal counted.
                  <br />
                  <span className="bg-gradient-to-r from-primary via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                    Every taka settled.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                  MealTrack is the shared ledger for messes and shared households — log meals and
                  bazar costs, track deposits, and close the month with every balance already computed.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="w-full shadow-lg shadow-primary/25 transition-shadow hover:shadow-xl hover:shadow-primary/30 sm:w-auto">
                    <a href="/app/auth?mode=signup" className="gap-2">
                      Create your mess — it&apos;s free
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <a href="/app/auth">Sign in</a>
                  </Button>
                </div>
                <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Free to create · No credit card · Private to your mess
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  Joining a mess? Your manager sends an invite link — open it and you&apos;re in.
                </p>
              </div>

              {/* Product preview placeholder (CSS art — swap for a real capture later) */}
              <div className="relative lg:col-span-6">
                <div
                  aria-hidden="true"
                  className="absolute -right-6 -top-10 h-56 w-56 rounded-full bg-primary/10 blur-[90px] sm:-right-10 sm:h-72 sm:w-72"
                />
                <div className="relative rotate-[0.5deg] rounded-3xl border border-border/70 bg-card p-2 shadow-2xl shadow-primary/10 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10">
                  <div className="flex items-center gap-1.5 rounded-2xl border-b border-border/60 bg-muted/60 px-3 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                    <span className="flex-1 text-center text-[10px] font-medium text-muted-foreground">
                      MealTrack — current cycle
                    </span>
                    <span className="h-2.5 w-2.5 opacity-0" />
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-4 sm:p-6">
                    <CommandPanel />
                  </div>
                </div>
                <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Illustrative preview
                </p>
              </div>
            </div>

            <p className="mt-12 text-center text-xs text-muted-foreground sm:text-sm">
              Replaces paper registers, calculator apps and end-of-month math.
            </p>
          </div>
        </section>

        {/* ============ Command center ============ */}
        <section id="showcase" className="relative scroll-mt-24 py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:px-8">
            <div className="lg:col-span-5">
              <Eyebrow muted>The command center</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl">
                Know the balance before the month ends.
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                One live picture for the manager — deposits in, costs out, meal rate per mouth,
                remaining cash, and exactly who owes what when the cycle closes. Fixed costs are
                shared equally (time-prorated); meal costs follow the meals actually eaten.
              </p>
              <ul className="mt-6 space-y-3.5 text-sm leading-6 text-foreground">
                {[
                  "Meal rate updates as you log — no spreadsheet formulas, ever.",
                  "Deposits tracked per member against meals and fixed costs.",
                  "Settlements rounded to whole taka — totals always add up exactly.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-7">
              <figure className="relative isolate overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-5 text-white shadow-xl shadow-emerald-950/20 sm:p-7 dark:border-white/10">
                <PanelOrbs />
                <CommandPanel className="relative" />
                <figcaption className="sr-only">
                  Illustrative preview of MealTrack&apos;s manager dashboard: financial-health
                  summary for a sample cycle.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ============ How it works ============ */}
        <section id="how-it-works" className="relative scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Eyebrow muted>How it works</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Three steps to a settled month.
              </h2>
            </div>
            <div className="relative mt-12 grid items-start gap-4 sm:gap-6 md:grid-cols-3">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[18%] right-[18%] top-12 hidden border-t-2 border-dashed border-border md:block"
              />
              {[
                {
                  step: "1",
                  title: "Create your mess",
                  body: "Sign up free, name your mess, and add the people you live with. You become the manager.",
                },
                {
                  step: "2",
                  title: "Log as you live",
                  body: "Mark meals, grocery runs and shared bills in seconds. Every change updates the shared ledger instantly.",
                },
                {
                  step: "3",
                  title: "Settle, don’t argue",
                  body: "Close the cycle and MealTrack computes each member’s balance — deposited vs. consumed, to the whole taka.",
                },
              ].map(({ step, title, body }) => (
                <div
                  key={step}
                  className="relative rounded-2xl border border-border/70 bg-card/75 p-6 text-center backdrop-blur-sm shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-bold text-primary ring-1 ring-primary/20">
                    {step}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-center text-sm leading-6 sm:flex-row sm:text-left">
              <UsersRound className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">Joining instead?</span> Open the
                invite link your manager sent you — you&apos;ll be a member of their mess in about
                a minute.
              </p>
            </div>
          </div>
        </section>

        {/* ============ Features ============ */}
        <section id="features" className="relative scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Eyebrow muted>What you get</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Built for the whole cycle — not just the math.
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                From the first meal of the month to the final settlement, everything a mess runs
                on lives in one place.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              <FeatureCard
                icon={Utensils}
                iconClass="text-emerald-600 dark:text-emerald-400"
                iconBgClass="bg-emerald-500/10 dark:bg-emerald-400/10"
                title="Meal logging that sticks"
                description="Breakfast, lunch, dinner — per member, per day. Meal rate recalculates live from real meals, not estimates."
              />
              <FeatureCard
                icon={Wallet}
                iconClass="text-emerald-600 dark:text-emerald-400"
                iconBgClass="bg-emerald-500/10 dark:bg-emerald-400/10"
                title="Deposits without the chase"
                description="Record who topped up, when and how much. Balances update instantly — nothing is settled from memory."
              />
              <FeatureCard
                icon={ShoppingBasket}
                iconClass="text-slate-600 dark:text-slate-300"
                iconBgClass="bg-slate-500/10 dark:bg-slate-400/10"
                title="Bazar & bills, shared fairly"
                description="Grocery runs split by meal consumption; utility costs — rent share, gas, Wi-Fi, electricity — split equally, time-prorated."
              />
              <FeatureCard
                icon={Scale}
                iconClass="text-primary"
                iconBgClass="bg-primary/10"
                title="Settlements in one tap"
                description="Close the cycle and get exact per-member balances — negative means pays in, positive means gets back."
              />
              <FeatureCard
                icon={UsersRound}
                iconClass="text-primary"
                iconBgClass="bg-primary/10"
                title="Manager & member views"
                description="Managers run cycles, deposits and reports. Members mark their own meals and see exactly where they stand."
              />
              <FeatureCard
                icon={History}
                iconClass="text-slate-600 dark:text-slate-300"
                iconBgClass="bg-slate-500/10 dark:bg-slate-400/10"
                title="Reports & history"
                description="Every closed cycle archived read-only — totals, meal rate, per-member breakdown. Export a PDF report when you need proof."
              />
            </div>
          </div>
        </section>

        {/* ============ Roles ============ */}
        <section id="roles" className="relative scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Eyebrow muted>Who it&apos;s for</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                One mess, two seats.
              </h2>
            </div>
            <div className="mt-12 grid items-stretch gap-5 sm:gap-8 lg:grid-cols-2">
              {/* Manager — dark emerald emphasis */}
              <div className="relative flex flex-col overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-6 text-white shadow-xl shadow-emerald-950/20 sm:p-8 dark:border-white/10">
                <PanelOrbs />
                <div className="relative">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
                    For the manager
                  </p>
                  <h3 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Run the mess. Not the drama.
                  </h3>
                  <ul className="mt-6 space-y-3.5 text-sm leading-6 text-emerald-50/95">
                    {[
                      "Create the mess, set the cycle, invite members",
                      "Approve deposits and track the shared fund",
                      "Close cycles and publish read-only reports",
                      "Full visibility — meals, costs, balances, settlement",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="relative mt-auto pt-8">
                  <a
                    href="/app/auth?mode=signup"
                    className={cn(
                      signBtnClass,
                      "bg-primary px-5 py-3 text-primary-foreground shadow-lg shadow-black/20 hover:bg-primary/90",
                    )}
                  >
                    Create your mess — it&apos;s free
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {/* Member — calm glass */}
              <div className="flex flex-col rounded-3xl border border-border/70 bg-card/85 p-6 shadow-xl shadow-primary/5 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-white/5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                    For the member
                  </p>
                  <h3 className="mt-3 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Eat. Log. See your balance. Done.
                  </h3>
                  <ul className="mt-6 space-y-3.5 text-sm leading-6 text-muted-foreground">
                    {[
                      "Join in a minute with your manager’s invite link",
                      "Mark your own meals — breakfast, lunch, dinner",
                      "See your balance, meal rate and what you’ll get back (or pay in) at cycle close",
                      "Same numbers the manager sees — no parallel ledgers, no doubt",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto pt-8">
                  <Button asChild variant="outline">
                    <a href="/app/auth">Have an invite? Sign in</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq" className="relative scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Eyebrow muted>FAQ</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Fair questions, straight answers.
              </h2>
            </div>
            <Accordion type="single" collapsible className="mt-10 w-full">
              {[
                {
                  q: "Is MealTrack free?",
                  a: "Yes. Anyone can sign up and create a mess for free — no card, no trial countdown. Joining a mess is free too; your manager’s invite link is all you need.",
                },
                {
                  q: "How do I invite my housemates?",
                  a: "The manager creates an invite link from inside the app and shares it however works — chat, SMS, anything. Anyone who opens it can sign up and join that mess.",
                },
                {
                  q: "How does MealTrack split costs?",
                  a: "Meal expenses are split by meals actually eaten (meal rate = meal costs ÷ total meals). Utility and other fixed costs are split equally, prorated to how long each member was in the mess during the cycle.",
                },
                {
                  q: "What happens when the month ends?",
                  a: "The manager closes the cycle. MealTrack computes every member’s balance — who pays in, who gets a refund — to whole-taka precision, and archives the cycle read-only in History.",
                },
                {
                  q: "Who can see my mess’s data?",
                  a: "Only the members of your mess. Numbers are never public. If the manager enables a shared (“Meal Code”) view, it’s read-only and meant for sharing balances — and they control it.",
                },
                {
                  q: "Do I need to install anything?",
                  a: "No. It runs in your browser on phone and desktop. If you want it on your home screen, it’s installable as a web app — and it updates itself.",
                },
              ].map(({ q, a }, i) => (
                <AccordionItem key={q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-sm font-semibold sm:text-base">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="leading-6 text-muted-foreground">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ============ Final CTA ============ */}
        <section className="relative pb-16 sm:pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 px-6 py-14 text-center text-white shadow-2xl shadow-emerald-950/20 sm:py-20 dark:border-white/10">
              <PanelOrbs />
              <h2 className="relative mx-auto max-w-3xl font-heading text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-5xl">
                Close your next cycle without the drama.
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl leading-7 text-emerald-100/80">
                Create your mess in two minutes — free to start, private to your household,
                settled down to the last taka.
              </p>
              <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="w-full shadow-lg shadow-black/30 sm:w-auto"
                >
                  <a href="/app/auth?mode=signup" className="gap-2">
                    Create your mess — it&apos;s free
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <a
                  href="/app/auth"
                  className={cn(
                    signBtnClass,
                    "w-full border border-white/20 bg-white/5 px-6 text-emerald-50 hover:bg-white/10 sm:w-auto",
                  )}
                >
                  Sign in
                </a>
              </div>
              <p className="relative mt-4 text-xs text-emerald-100/60">
                Free to create · No credit card · Invite your housemates after setup
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ============ Footer ============ */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <BrandLockup compact />
              <p className="mt-3 max-w-xs text-xs leading-5 text-muted-foreground">
                The shared meal, deposit and settlement tracker for messes and shared households.
              </p>
            </div>
            <nav aria-label="Product">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="transition-colors hover:text-foreground">Features</a></li>
                <li><a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground">FAQ</a></li>
                <li><a href="#showcase" className="transition-colors hover:text-foreground">The command center</a></li>
              </ul>
            </nav>
            <nav aria-label="Account">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Account
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href="/app/auth?mode=signup" className="transition-colors hover:text-foreground">Create your mess</a></li>
                <li><a href="/app/auth" className="transition-colors hover:text-foreground">Sign in</a></li>
                <li><a href="/app/auth" className="transition-colors hover:text-foreground">Join with an invite</a></li>
              </ul>
            </nav>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border/50 pt-6 text-[11px] text-muted-foreground sm:flex-row">
            <p>© {year} MealTrack · MealTrack — Shared Meal &amp; Cost Tracker</p>
            <p>Amounts shown in BDT (৳)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
