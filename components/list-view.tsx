"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type View = "cards" | "table";

/**
 * רשימה בשני תצוגות (כרטיסים / טבלה) עם חיפוש חי.
 * שתי התצוגות נבנות בשרת; כאן רק מחליפים ביניהן ומסננים לפי data-search (בלי בקשה לשרת).
 * בלי `cards` זו טבלה בלבד עם חיפוש. התצוגה האחרונה נשמרת בדפדפן (אם אפשר).
 */
export function ListView({ cards, table, storageKey }: { cards?: ReactNode; table: ReactNode; storageKey: string }) {
  const t = useTranslations("listView");
  const key = `listview:${storageKey}`;
  const stored = useSyncExternalStore(
    (cb) => { window.addEventListener("storage", cb); window.addEventListener("listview", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("listview", cb); }; },
    () => { try { return localStorage.getItem(key); } catch { return null; } }, // מצב פרטי: ברירת המחדל
    () => null,
  );
  const [local, setLocal] = useState<View | null>(null); // כשהאחסון חסום, הבחירה נשמרת לפחות בזיכרון הדף
  const view: View = local ?? (stored === "table" ? "table" : "cards");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const both = cards !== undefined;
  const active: View = both ? view : "table";

  useEffect(() => {
    const el = root.current; if (!el) return;
    const needle = q.trim().toLocaleLowerCase();
    const pane = el.querySelector<HTMLElement>(`[data-pane="${active}"]`);
    el.querySelectorAll<HTMLElement>("[data-search]").forEach((n) => {
      n.hidden = needle !== "" && !(n.dataset.search ?? "").toLocaleLowerCase().includes(needle);
    });
    // כותרות קבוצה (למשל רכז) מוסתרות כשאין בהן שורות גלויות
    el.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => { g.hidden = g.querySelectorAll("[data-search]:not([hidden])").length === 0; });
    setShown(pane ? pane.querySelectorAll("[data-search]:not([hidden])").length : 0);
  }, [q, active, cards, table]);

  const choose = (v: View) => { setLocal(v); try { localStorage.setItem(key, v); } catch { /* ignore */ } window.dispatchEvent(new Event("listview")); };
  const btn = (v: View, label: string) => (
    <button type="button" aria-pressed={active === v} onClick={() => choose(v)}
      className={`min-h-10 px-3 text-sm transition-colors duration-150 ${active === v ? "bg-primary text-primary-foreground" : "bg-card text-ink-2 hover:bg-paper"}`}>{label}</button>
  );

  return (
    <div ref={root} onClick={(e) => {
      // "פרטים" בטבלה: עוברים לכרטיסים וגוללים לכרטיס של אותו דיווח
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-open-card]");
      if (!a || !both) return;
      e.preventDefault(); choose("cards");
      const id = a.dataset.openCard!;
      setTimeout(() => { const c = document.getElementById(id); c?.scrollIntoView({ block: "center" }); c?.focus?.(); }, 50);
    }}>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3">
          <span className="sr-only">{t("search")}</span>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeholder")} className="min-h-10 w-full bg-transparent text-sm outline-none" />
        </label>
        {both && (
          <div role="group" aria-label={t("viewLabel")} className="flex overflow-hidden rounded-lg border border-border">
            {btn("cards", t("cards"))}{btn("table", t("table"))}
          </div>
        )}
        <span role="status" aria-live="polite" className="text-xs text-ink-3">{q.trim() && shown !== null ? t("count", { n: shown }) : ""}</span>
      </div>
      {both && <div data-pane="cards" hidden={active !== "cards"}>{cards}</div>}
      <div data-pane="table" role="region" aria-label={t("table")} tabIndex={0} hidden={active !== "table"} className="mt-3 overflow-x-auto rounded-xl border border-hairline bg-card">{table}</div>
      {q.trim() && shown === 0 && <p className="mt-3 text-sm text-ink-3">{t("none")}</p>}
    </div>
  );
}
