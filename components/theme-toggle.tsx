"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

type Theme = "auto" | "light" | "dark";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const sub = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener("themechange", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("themechange", cb); }; };

/** מצב תצוגה: אוטומטי / בהיר / כהה, ומתג ניגודיות גבוהה. נשמר בדפדפן ומוחל על <html> */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const theme = (useSyncExternalStore(sub, () => read("theme"), () => null) as Theme | null) ?? "auto";
  const high = useSyncExternalStore(sub, () => read("contrast") === "high", () => false);
  const apply = (k: string, v: string | null, attr: string) => {
    try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* מצב פרטי */ }
    if (v) document.documentElement.setAttribute(attr, v); else document.documentElement.removeAttribute(attr);
    window.dispatchEvent(new Event("themechange"));
  };
  const opt = (v: Theme, label: string) => (
    <button type="button" aria-pressed={theme === v} onClick={() => apply("theme", v === "auto" ? null : v, "data-theme")}
      className={`min-h-9 px-2.5 text-xs ${theme === v ? "bg-primary text-primary-foreground" : "bg-card text-ink-2 hover:bg-paper"}`}>{label}</button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("label")} className="flex overflow-hidden rounded-lg border border-border">{opt("auto", t("auto"))}{opt("light", t("light"))}{opt("dark", t("dark"))}</div>
      <button type="button" aria-pressed={high} onClick={() => apply("contrast", high ? null : "high", "data-contrast")}
        className={`min-h-9 rounded-lg border border-border px-2.5 text-xs ${high ? "bg-primary text-primary-foreground" : "bg-card text-ink-2 hover:bg-paper"}`}>{t("contrast")}</button>
    </div>
  );
}
