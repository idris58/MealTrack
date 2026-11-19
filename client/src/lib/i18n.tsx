/**
 * Minimal EN/BN internationalization.
 *
 * Deliberately dependency-free (no react-i18next) — two locales, a flat
 * dot-key dictionary, localStorage persistence, and <html lang> sync.
 * English is the default; Bengali is a first-class, independently indexed
 * locale (the prerendered /bn page links here with ?lang=bn so the choice
 * carries through into the app).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import en from "@/locales/en";
import bn from "@/locales/bn";

export type Locale = "en" | "bn";

const STORAGE_KEY = "mealtrack:locale";

type Dict = Record<string, string>;

const dictionaries: Record<Locale, Dict> = {
  en: en as unknown as Dict,
  bn: bn as unknown as Dict,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within <I18nProvider>");
  }
  return ctx;
}

function readInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  // An explicit ?lang=bn from the prerendered Bengali landing page wins, so a
  // visitor who chose বাংলা keeps that choice after navigating into the app.
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl === "bn" || fromUrl === "en") return fromUrl;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "bn" || saved === "en" ? saved : "en";
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** Used by the build-time prerenderer; runtime callers leave this unset. */
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? readInitialLocale(),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / storage disabled — keep in-memory only
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "bn" : "en");
  }, [locale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string): string => {
      const value = dictionaries[locale][key];
      if (typeof value === "string") return value;
      const fallback = dictionaries.en[key];
      return typeof fallback === "string" ? fallback : key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
