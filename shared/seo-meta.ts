import { LANDING_FAQS_BY_LOCALE } from "./landing-content";

/**
 * Shared SEO definitions for the two indexable public pages.
 * Imported by both the build-time prerenderer (script/prerender.tsx) and the
 * Express server (server/static.ts, server/public-meta.ts) so titles,
 * canonicals, hreflang pairs and JSON-LD can never drift apart.
 */
export type SeoLocale = "en" | "bn";

export interface LocaleSeo {
  /** Canonical path for this locale. */
  path: string;
  htmlLang: string;
  ogLocale: string;
  schemaLang: string;
  title: string;
  description: string;
}

export const SITE_ORIGIN = "https://mealstrack.live";

/** The only indexable URLs — expand here when Phase 2 content pages exist. */
export const PUBLIC_SEO_PATHS = ["/", "/bn"] as const;

export const SEO: Record<SeoLocale, LocaleSeo> = {
  en: {
    path: "/",
    htmlLang: "en",
    ogLocale: "en_US",
    schemaLang: "en",
    title: "MealTrack - Mess Management & Meal Tracking Software",
    description:
      "Manage your mess with MealTrack — track daily meals, member deposits, bazar expenses, meal rates and monthly settlements in one simple app. Free to start.",
  },
  bn: {
    path: "/bn",
    htmlLang: "bn",
    ogLocale: "bn_BD",
    schemaLang: "bn-BD",
    title: "MealTrack - মেস ব্যবস্থাপনা ও খাবার হিসাব অ্যাপ",
    description:
      "MealTrack দিয়ে মেস চালান — খাবার, জমা, বাজারের খরচ, খাবারের হার ও মাসের শেষের হিসাব এক জায়গায়। ফ্রিতে শুরু করুন।",
  },
};

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

/** Reciprocal hreflang tags — emitted identically on both public pages. */
export function buildAlternateLinks(origin: string): string[] {
  return [
    `<link rel="alternate" hreflang="en" href="${escapeHtmlAttr(absoluteUrl(origin, SEO.en.path))}" />`,
    `<link rel="alternate" hreflang="bn" href="${escapeHtmlAttr(absoluteUrl(origin, SEO.bn.path))}" />`,
    `<link rel="alternate" hreflang="bn-BD" href="${escapeHtmlAttr(absoluteUrl(origin, SEO.bn.path))}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtmlAttr(absoluteUrl(origin, SEO.en.path))}" />`,
  ];
}

export function buildSeoJsonLd(origin: string, locale: SeoLocale): string {
  const seo = SEO[locale];
  const faqs = LANDING_FAQS_BY_LOCALE[locale];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "MealTrack",
        url: absoluteUrl(origin, SEO.en.path),
        description: seo.description,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Any",
        inLanguage: seo.schemaLang,
      },
      {
        "@type": "FAQPage",
        inLanguage: seo.schemaLang,
        mainEntity: faqs.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(jsonLd);
}

/** Complete <head> fragment for a prerendered public page. */
export function buildPublicHeadTags(origin: string, locale: SeoLocale): string {
  const seo = SEO[locale];
  const canonical = absoluteUrl(origin, seo.path);
  const title = escapeHtmlAttr(seo.title);
  const description = escapeHtmlAttr(seo.description);
  const ogImage = escapeHtmlAttr(absoluteUrl(origin, "/og-landing.png"));

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    '<meta name="robots" content="index, follow" />',
    `<link rel="canonical" href="${escapeHtmlAttr(canonical)}" />`,
    ...buildAlternateLinks(origin),
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MealTrack" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(canonical)}" />`,
    `<meta property="og:locale" content="${seo.ogLocale}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:alt" content="${title}" />`,
    '<meta property="og:image:width" content="1280" />',
    '<meta property="og:image:height" content="720" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    `<meta name="twitter:image:alt" content="${title}" />`,
    `<script type="application/ld+json">${buildSeoJsonLd(origin, locale)}</script>`,
  ].join("\n    ");
}
