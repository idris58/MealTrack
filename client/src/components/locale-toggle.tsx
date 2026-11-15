import { useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  const options: Array<{ value: Locale; label: string; full: string }> = [
    { value: "en", label: "EN", full: "English" },
    { value: "bn", label: "বাং", full: "বাংলা" },
  ];

  return (
    <div
      role="group"
      aria-label={t("nav.switchLang")}
      title={t("nav.switchLang")}
      className={cn(
        "inline-flex h-9 items-center rounded-full border border-primary/20 bg-primary/[0.04] p-0.5 shadow-sm",
        className,
      )}
    >
      {options.map(({ value, label, full }) => {
        const active = locale === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setLocale(value)}
            aria-pressed={active}
            aria-label={full}
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold leading-none transition-all duration-200",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
