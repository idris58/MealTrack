import { useEffect, useRef, useState } from "react";
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
  Zap,
  Bell,
  Share2,
  Sun,
  Moon,
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
import { useI18n } from "@/lib/i18n";
import { LocaleToggle } from "@/components/locale-toggle";

/* ------------------------------------------------------------------ */
/* Scroll-reveal hook                                                   */
/* ------------------------------------------------------------------ */

function useReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.15,
) {
  const ref = useRef<T>(null);
  // Users who prefer reduced motion (and anything uncrawlable) get the final
  // layout immediately — content is never hidden, only nudged into place.
  const [visible, setVisible] = useState(
    () =>
      // During build-time prerendering there is no window: render the final,
      // fully visible state so all copy is present in the served HTML.
      typeof window === "undefined"
        ? true
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, visible]);

  return { ref, visible };
}

/* ------------------------------------------------------------------ */
/* Local building blocks                                                */
/* ------------------------------------------------------------------ */

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-2.5 group" aria-label="MealTrack home">
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-transform duration-300 group-hover:scale-110",
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
  index = 0,
}: {
  icon: React.ElementType;
  iconClass: string;
  iconBgClass: string;
  title: string;
  description: string;
  index?: number;
}) {
  const { ref, visible } = useReveal();

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? "0ms" : `${index * 80}ms` }}
      className={cn(
        "group flex items-start gap-3.5 rounded-2xl border border-border/70 bg-card/75 p-5 shadow-sm backdrop-blur-sm transition-all duration-500 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/[0.08]",
        visible ? "translate-y-0" : "translate-y-6",
      )}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110", iconBgClass)}>
        <Icon className={cn("h-[18px] w-[18px]", iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground">{description}</p>
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
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-emerald-200 to-teal-100 landing-bar-animate" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
        {tiles.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[0.07] px-2.5 py-2.5 backdrop-blur-sm sm:px-3 transition-colors duration-200 hover:bg-white/[0.12]"
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
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Markup-identical stand-ins for the React toggles on prerendered pages.
 * /seo-landing.js supplies the behaviour (no React is loaded there).
 */
function StaticThemeToggle() {
  return (
    <button
      type="button"
      data-seo-theme
      aria-label="Switch to dark mode"
      aria-pressed="false"
      className="relative inline-flex h-9 w-[3.25rem] items-center justify-center rounded-full border border-primary/20 bg-primary/[0.04] p-0 shadow-sm transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-md"
    >
      <span
        data-seo-theme-knob
        className="absolute left-1 flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm transition-transform duration-300"
      >
        <Sun
          data-seo-theme-sun
          className="absolute h-4 w-4 rotate-0 text-amber-500 transition-all duration-300"
          aria-hidden="true"
        />
        <Moon
          data-seo-theme-moon
          className="absolute h-4 w-4 -rotate-90 text-indigo-400 opacity-0 transition-all duration-300"
          aria-hidden="true"
        />
      </span>
      <span className="sr-only">Switch theme</span>
    </button>
  );
}

function StaticLocaleToggle({ locale }: { locale: "en" | "bn" }) {
  return (
    <div
      role="group"
      aria-label="Change language"
      title="Change language"
      className="inline-flex h-9 items-center rounded-full border border-primary/20 bg-primary/[0.04] p-0.5 shadow-sm"
    >
      {[
        { value: "en", label: "EN", href: "/", full: "English" },
        { value: "bn", label: "বাং", href: "/bn", full: "বাংলা" },
      ].map(({ value, label, href, full }) => {
        const active = locale === value;
        return (
          <a
            key={value}
            href={href}
            aria-label={full}
            aria-pressed={active}
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold leading-none transition-all duration-200",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function LandingPage({ seoStatic = false }: { seoStatic?: boolean }) {
  const year = new Date().getFullYear();
  const { t, locale } = useI18n();

  // On the prerendered Bengali page carry the locale into the app so the
  // choice survives the jump from /bn to /app/auth.
  const withLang = (url: string): string => {
    if (!seoStatic || locale !== "bn") return url;
    return url.includes("?") ? `${url}&lang=bn` : `${url}?lang=bn`;
  };

  /* Navbar background on scroll */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Section reveal refs */
  const heroReveal = useReveal();
  const showcaseReveal = useReveal();
  const howReveal = useReveal();
  const rolesReveal = useReveal();
  const faqReveal = useReveal();
  const ctaReveal = useReveal();

  return (
    <div id="top" className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground selection:bg-primary/20">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-primary"
      >
        {t("nav.skipToContent")}
      </a>

      <GlowBackdrop />

      {/* ============ Nav ============ */}
      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-all duration-300",
          scrolled
            ? "border-border/60 bg-background/85 shadow-sm backdrop-blur-xl"
            : "border-transparent bg-transparent backdrop-blur-sm",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <BrandLockup />
          <nav className="hidden items-center gap-6 md:flex" aria-label={t("nav.productAria")}>
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {t("nav.features")}
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {t("nav.howItWorks")}
            </a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {t("nav.faq")}
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {seoStatic ? <StaticLocaleToggle locale={locale} /> : <LocaleToggle />}
            {seoStatic ? <StaticThemeToggle /> : <ThemeToggle />}
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href={withLang("/app/auth")}>{t("nav.signIn")}</a>
            </Button>
            <Button asChild size="sm" className="shadow-sm shadow-primary/20">
              <a href={withLang("/app/auth?mode=signup")}>{t("nav.createMess")}</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ============ Hero ============ */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14 lg:px-8 lg:pt-16 lg:pb-16">
            <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
              <div
                ref={heroReveal.ref}
                className={cn(
                  "lg:col-span-6 transition-all duration-700",
                  heroReveal.visible ?"translate-y-0" : "translate-y-8",
                )}
              >
                <Eyebrow icon={Sparkles}>{t("hero.eyebrowFree")}</Eyebrow>
                <h1 className="mt-5 font-heading text-[2.5rem] font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.5rem]">
                  {t("hero.titleA")}
                  <br />
                  <span className="bg-gradient-to-r from-primary via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                    {t("hero.titleB")}
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-[17px] sm:leading-8">
                  {t("hero.lede")}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="w-full shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] sm:w-auto">
                    <a href={withLang("/app/auth?mode=signup")} className="gap-2">
                      {t("hero.createMessFree")}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <a href={withLang("/app/auth")}>{t("hero.signIn")}</a>
                  </Button>
                </div>
                <div className="mt-5 space-y-1.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    {t("hero.trustFree")}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Link2 className="h-3.5 w-3.5" />
                    {t("hero.inviteHint")}
                  </p>
                </div>
              </div>

              {/* Product photo — real home-style meal (Unsplash, free license) */}
              <div
                className={cn(
                  "relative lg:col-span-6 transition-all duration-700 delay-200",
                  heroReveal.visible ?"translate-y-0" : "translate-y-8",
                )}
              >
                <div
                  aria-hidden="true"
                  className="absolute -right-6 -top-10 h-56 w-56 rounded-full bg-primary/10 blur-[90px] sm:-right-10 sm:h-72 sm:w-72"
                />
                <div className="relative overflow-hidden rounded-3xl border border-border/70 shadow-2xl shadow-primary/10 ring-1 ring-black/5 transition-transform duration-500 hover:-translate-y-1.5 dark:border-white/10 dark:ring-white/10">
                  <img
                    src="/hero-meal.jpg"
                    alt={t("hero.altPhoto")}
                    width={1024}
                    height={572}
                    className="block aspect-[16/9] w-full object-cover"
                    loading="eager"
                    fetchPriority="high"
                  />
                </div>
              </div>
            </div>

            <p className="mt-8 text-center text-xs text-muted-foreground sm:mt-10 sm:text-sm">
              {t("hero.replaces")}
            </p>
          </div>
        </section>

        {/* ============ Logos / social proof strip ============ */}
        <section className="border-y border-border/50 bg-muted/30 py-4 sm:py-5">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:gap-x-12 sm:text-xs">
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> {t("strip.offline")}</span>
            <span className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5 text-primary" /> {t("strip.push")}</span>
            <span className="flex items-center gap-1.5"><Share2 className="h-3.5 w-3.5 text-primary" /> {t("strip.reports")}</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> {t("strip.rls")}</span>
            <span className="flex items-center gap-1.5"><Utensils className="h-3.5 w-3.5 text-primary" /> {t("strip.halfMeal")}</span>
          </div>
        </section>

        {/* ============ Command center ============ */}
        <section id="showcase" className="relative scroll-mt-20 py-10 sm:py-14">
          <div
            ref={showcaseReveal.ref}
            className={cn(
              "mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:px-8 transition-all duration-700",
              showcaseReveal.visible ?"translate-y-0" : "translate-y-8",
            )}
          >
            <div className="lg:col-span-5">
              <Eyebrow muted>{t("showcase.kicker")}</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl">
                {t("showcase.title")}
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                {t("showcase.body")}
              </p>
              <ul className="mt-6 space-y-3.5 text-sm leading-6 text-foreground">
                {[
                  t("showcase.b1"),
                  t("showcase.b2"),
                  t("showcase.b3"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-7">
              <figure className="relative isolate overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-5 text-white shadow-xl shadow-emerald-950/20 sm:p-7 dark:border-white/10 transition-transform duration-500 hover:-translate-y-1">
                <PanelOrbs />
                <CommandPanel className="relative" />
                <figcaption className="sr-only">
                  {t("hero.illPreview")} of MealTrack&apos;s manager dashboard: financial-health
                  summary for a sample cycle.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ============ How it works ============ */}
        <section id="how-it-works" className="relative scroll-mt-20 py-10 sm:py-14">
          <div
            ref={howReveal.ref}
            className={cn(
              "mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 transition-all duration-700",
              howReveal.visible ?"translate-y-0" : "translate-y-8",
            )}
          >
            <div className="text-center">
              <Eyebrow muted>{t("how.kicker")}</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                {t("how.title")}
              </h2>
            </div>
            <div className="relative mt-10 grid items-start gap-4 sm:gap-6 md:grid-cols-3">
              {/* Connecting line */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[18%] right-[18%] top-12 hidden border-t-2 border-dashed border-primary/20 md:block"
              />
              {[
                {
                  step: "1",
                  title: t("how.step1Title"),
                  body: t("how.step1Body"),
                  icon: UsersRound,
                },
                {
                  step: "2",
                  title: t("how.step2Title"),
                  body: t("how.step2Body"),
                  icon: Utensils,
                },
                {
                  step: "3",
                  title: t("how.step3Title"),
                  body: t("how.step3Body"),
                  icon: Scale,
                },
              ].map(({ step, title, body, icon: StepIcon }, i) => (
                <div
                  key={step}
                  style={{ transitionDelay: howReveal.visible ? "0ms" : `${i * 120}ms` }}
                  className={cn(
                    "group relative rounded-2xl border border-border/70 bg-card/75 p-6 text-center backdrop-blur-sm shadow-sm transition-all duration-500 hover:shadow-lg hover:border-primary/25 hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5",
                    howReveal.visible ? "translate-y-0" : "translate-y-6",
                  )}
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-110">
                    <StepIcon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="mt-3 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                    {t("how.stepBadge")} {step}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-center text-sm leading-6 sm:flex-row sm:text-left">
              <UsersRound className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{t("how.invitePrefix")}</span>{" "}
                {t("how.inviteRest")}
              </p>
            </div>
          </div>
        </section>

        {/* ============ Features ============ */}
        <section id="features" className="relative scroll-mt-20 py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Eyebrow muted>{t("features.kicker")}</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                {t("features.title")}
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {t("features.subtitle")}
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              <FeatureCard
                index={0}
                icon={Utensils}
                iconClass="text-emerald-600 dark:text-emerald-400"
                iconBgClass="bg-emerald-500/10 dark:bg-emerald-400/10"
                title={t("features.mealTitle")}
                description={t("features.mealBody")}
              />
              <FeatureCard
                index={1}
                icon={Wallet}
                iconClass="text-emerald-600 dark:text-emerald-400"
                iconBgClass="bg-emerald-500/10 dark:bg-emerald-400/10"
                title={t("features.depositsTitle")}
                description={t("features.depositsBody")}
              />
              <FeatureCard
                index={2}
                icon={ShoppingBasket}
                iconClass="text-slate-600 dark:text-slate-300"
                iconBgClass="bg-slate-500/10 dark:bg-slate-400/10"
                title={t("features.bazarTitle")}
                description={t("features.bazarBody")}
              />
              <FeatureCard
                index={3}
                icon={Scale}
                iconClass="text-primary"
                iconBgClass="bg-primary/10"
                title={t("features.settleTitle")}
                description={t("features.settleBody")}
              />
              <FeatureCard
                index={4}
                icon={UsersRound}
                iconClass="text-primary"
                iconBgClass="bg-primary/10"
                title={t("features.rolesTitle")}
                description={t("features.rolesBody")}
              />
              <FeatureCard
                index={5}
                icon={History}
                iconClass="text-slate-600 dark:text-slate-300"
                iconBgClass="bg-slate-500/10 dark:bg-slate-400/10"
                title={t("features.reportsTitle")}
                description={t("features.reportsBody")}
              />
            </div>
          </div>
        </section>

        {/* ============ Roles ============ */}
        <section id="roles" className="relative scroll-mt-20 py-10 sm:py-14">
          <div
            ref={rolesReveal.ref}
            className={cn(
              "mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 transition-all duration-700",
              rolesReveal.visible ?"translate-y-0" : "translate-y-8",
            )}
          >
            <div className="text-center">
              <Eyebrow muted>{t("roles.kicker")}</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                {t("roles.title")}
              </h2>
            </div>
            <div className="mt-12 grid items-stretch gap-5 sm:gap-8 lg:grid-cols-2">
              {/* Manager — dark emerald emphasis */}
              <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-6 text-white shadow-xl shadow-emerald-950/20 sm:p-8 dark:border-white/10 transition-transform duration-500 hover:-translate-y-1">
                <PanelOrbs />
                <div className="relative">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
                    {t("roles.managerEyebrow")}
                  </p>
                  <h3 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {t("roles.managerTitle")}
                  </h3>
                  <ul className="mt-6 space-y-3.5 text-sm leading-6 text-emerald-50/95">
                    {[
                      t("roles.m1"),
                      t("roles.m2"),
                      t("roles.m3"),
                      t("roles.m4"),
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
                    href={withLang("/app/auth?mode=signup")}
                    className={cn(
                      signBtnClass,
                      "bg-primary px-5 py-3 text-primary-foreground shadow-lg shadow-black/20 hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]",
                    )}
                  >
                    {t("roles.managerCta")}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {/* Member — calm glass */}
              <div className="group flex flex-col rounded-3xl border border-border/70 bg-card/85 p-6 shadow-xl shadow-primary/5 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-white/5 transition-transform duration-500 hover:-translate-y-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                    {t("roles.memberEyebrow")}
                  </p>
                  <h3 className="mt-3 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {t("roles.memberTitle")}
                  </h3>
                  <ul className="mt-6 space-y-3.5 text-sm leading-6 text-muted-foreground">
                    {[
                      t("roles.p1"),
                      t("roles.p2"),
                      t("roles.p3"),
                      t("roles.p4"),
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
                    <a href={withLang("/app/auth")}>{t("roles.memberCta")}</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq" className="relative scroll-mt-20 py-10 sm:py-14">
          <div
            ref={faqReveal.ref}
            className={cn(
              "mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 transition-all duration-700",
              faqReveal.visible ?"translate-y-0" : "translate-y-8",
            )}
          >
            <div className="text-center">
              <Eyebrow muted>{t("faq.kicker")}</Eyebrow>
              <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                {t("faq.title")}
              </h2>
            </div>
            {seoStatic ? (
              // Native <details> keeps every answer in the served HTML (and
              // works without JS) so the FAQPage JSON-LD has visible content.
              <div className="mt-8 w-full divide-y divide-border/70 rounded-2xl border border-border/70 bg-card/60">
                {Array.from({ length: 6 }, (_, i) => ({
                  q: t(`faq.q${i + 1}`),
                  a: t(`faq.a${i + 1}`),
                })).map(({ q, a }) => (
                  <details key={q} className="group px-5 py-4">
                    <summary className="cursor-pointer list-none text-left text-sm font-semibold sm:text-base [&::-webkit-details-marker]:hidden">
                      {q}
                    </summary>
                    <p className="mt-3 leading-6 text-muted-foreground">{a}</p>
                  </details>
                ))}
              </div>
            ) : (
              <Accordion type="single" collapsible className="mt-8 w-full">
                {[
                  { q: t("faq.q1"), a: t("faq.a1") },
                  { q: t("faq.q2"), a: t("faq.a2") },
                  { q: t("faq.q3"), a: t("faq.a3") },
                  { q: t("faq.q4"), a: t("faq.a4") },
                  { q: t("faq.q5"), a: t("faq.a5") },
                  { q: t("faq.q6"), a: t("faq.a6") },
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
            )}
          </div>
        </section>

        {/* ============ Final CTA ============ */}
        <section className="relative pt-2 pb-12 sm:pt-4 sm:pb-16">
          <div
            ref={ctaReveal.ref}
            className={cn(
              "mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 transition-all duration-700",
              ctaReveal.visible ? "translate-y-0 scale-100" : "translate-y-8 scale-[0.97]",
            )}
          >
            <div className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 px-6 py-12 text-center text-white shadow-2xl shadow-emerald-950/20 sm:py-16 dark:border-white/10">
              <PanelOrbs />
              {/* Subtle grid pattern overlay */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              <h2 className="relative mx-auto max-w-3xl font-heading text-3xl font-extrabold leading-[1.12] tracking-tight text-white sm:text-5xl">
                {t("cta.title")}
              </h2>
              <p className="relative mx-auto mt-5 max-w-xl text-base leading-7 text-emerald-100/80 sm:text-lg">
                {t("cta.sub")}
              </p>
              <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="w-full shadow-lg shadow-black/30 hover:scale-[1.02] active:scale-[0.98] transition-all sm:w-auto"
                >
                  <a href={withLang("/app/auth?mode=signup")} className="gap-2">
                    {t("cta.button")}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <a
                  href={withLang("/app/auth")}
                  className={cn(
                    signBtnClass,
                    "w-full border border-white/20 bg-white/5 px-6 py-3 text-emerald-50 hover:bg-white/10 sm:w-auto",
                  )}
                >
                  {t("cta.signIn")}
                </a>
              </div>
              <p className="relative mt-4 text-xs text-emerald-100/60">
                {t("cta.micro")}
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
                {t("footer.brandLine")}
              </p>
            </div>
            <nav aria-label={t("nav.productAria")}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("footer.product")}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="transition-colors hover:text-foreground">{t("footer.features")}</a></li>
                <li><a href="#how-it-works" className="transition-colors hover:text-foreground">{t("footer.howItWorks")}</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground">{t("footer.faq")}</a></li>
                <li><a href="#showcase" className="transition-colors hover:text-foreground">{t("footer.commandCenter")}</a></li>
              </ul>
            </nav>
            <nav aria-label={t("nav.accountAria")}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("footer.account")}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href={withLang("/app/auth?mode=signup")} className="transition-colors hover:text-foreground">{t("footer.createMess")}</a></li>
                <li><a href={withLang("/app/auth")} className="transition-colors hover:text-foreground">{t("nav.signIn")}</a></li>
                <li><a href={withLang("/app/auth")} className="transition-colors hover:text-foreground">{t("footer.joinInvite")}</a></li>
              </ul>
            </nav>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border/50 pt-6 text-[11px] text-muted-foreground sm:flex-row">
            <p>© {year} MealTrack · Shared Meal &amp; Cost Tracker</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
