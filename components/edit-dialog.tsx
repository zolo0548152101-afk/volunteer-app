"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { showToast } from "@/components/toast";

/**
 * חלון קופץ לעריכה (dialog מקורי: פוקוס כלוא, Esc סוגר, רקע מוחשך).
 * התוכן הוא טפסי server-action שנבנו בשרת; אחרי שליחה תקינה החלון נסגר והעמוד נטען מחדש.
 * משוב: אחרי שליחה מוצגת הודעת "נשמר"; אם הפעולה נכשלה (שגיאה בכתובת) החלון נפתח מחדש עם ההודעה בתוכו.
 * הגנה: סגירה (×, Esc, לחיצה על הרקע) עם שינויים שלא נשמרו שואלת "לצאת בלי לשמור?".
 */
const KEY = "dialog:last";

export function EditDialog({ label, title, children, className, closeOnSubmit = true }: { label: string; title: string; children: ReactNode; className?: string; closeOnSubmit?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const id = `${title}|${label}`; // זהות יציבה גם אם הרכיב נוצר מחדש אחרי רענון מהשרת (useId משתנה)
  const t = useTranslations("common");
  const dirty = useRef(false);
  // המאזינים נרשמים פעם אחת: רישום מחדש בכל רינדור פספס את "dialogdone" שנשלח באותו commit
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const [asking, setAsking] = useState(false);
  const [gen, setGen] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submitted = useRef(false);
  // תוצאת שליחה: שגיאה (באנר בעמוד או ?error) פותחת את החלון מחדש עם ההודעה בתוכו; אחרת "נשמר"
  const settle = useCallback(() => {
    const el = ref.current; if (!el) return;
    const alert = document.querySelector<HTMLElement>("#content [role='alert']");
    if (new URLSearchParams(location.search).has("error") || alert) {
      setError(alert?.textContent?.trim() || tRef.current("saveFailed"));
      if (!el.open) el.showModal();
    } else showToast(tRef.current("saved"));
  }, []);

  const requestClose = useCallback(() => {
    const el = ref.current; if (!el) return;
    if (dirty.current) setAsking(true); else el.close();
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    // טפסים של צד לקוח (שמציגים שגיאה בתוך הטופס) סוגרים את החלון רק אחרי הצלחה, באירוע "dialogdone"
    const done = () => { dirty.current = false; el.close(); showToast(tRef.current("saved")); };
    el.addEventListener("dialogdone", done);
    const cancel = (e: Event) => { if (dirty.current) { e.preventDefault(); setAsking(true); } };
    el.addEventListener("cancel", cancel);
    const touch = () => { dirty.current = true; };
    el.addEventListener("input", touch); el.addEventListener("change", touch);
    // טעינה מלאה מחדש בעקבות שליחה מהחלון הזה (בלי JS או ניווט מלא): אותו טיפול
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const last = JSON.parse(raw) as { id: string; at: number };
        if (last.id === id && Date.now() - last.at < 20000) { sessionStorage.removeItem(KEY); settle(); }
      }
    } catch { /* אחסון חסום: בלי משוב אחרי טעינה */ }
    return () => { el.removeEventListener("dialogdone", done); el.removeEventListener("cancel", cancel); el.removeEventListener("input", touch); el.removeEventListener("change", touch); };
  }, [id, settle]);

  // פעולת שרת הסתיימה: העץ מהשרת מתרענן (children חדש) והמשוב מוצג בלי טעינת עמוד
  useEffect(() => {
    if (!submitted.current) return;
    submitted.current = false;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    settle();
  }, [children, settle]);

  const open = () => { dirty.current = false; setAsking(false); setError(null); ref.current?.showModal(); };
  const discard = () => { dirty.current = false; setAsking(false); setError(null); setGen((g) => g + 1); ref.current?.close(); };

  return (
    <>
      <button type="button" onClick={open} className={className ?? "inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-paper md:min-h-8 md:px-3"}>{label}</button>
      <dialog
        ref={ref}
        aria-labelledby={`${uid}-t`}
        onClick={(e) => { if (e.target === ref.current) requestClose(); }}
        onSubmit={(e) => {
          const form = e.target as HTMLFormElement;
          dirty.current = false;
          if (form.method?.toLowerCase() === "get") { if (closeOnSubmit) setTimeout(() => ref.current?.close(), 0); return; }
          if (!closeOnSubmit) return; // טפסי לקוח מדווחים בעצמם (dialogdone) או מציגים שגיאה בתוך הטופס
          submitted.current = true;
          try { sessionStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() })); } catch { /* ignore */ }
          setTimeout(() => ref.current?.close(), 0);
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-card p-0 text-ink backdrop:bg-black/60 open:flex"
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-hairline px-5 py-3">
          <h2 id={`${uid}-t`} className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={requestClose} aria-label={t("close")} className="grid size-11 place-items-center rounded-md text-lg hover:bg-paper md:size-9">×</button>
        </div>
        {error && <p role="alert" className="flex-none border-b border-bad/40 bg-bad-bg px-5 py-2 text-sm text-bad-fg">{error}</p>}
        <div key={gen} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">{children}</div>
        {asking && (
          <div role="alertdialog" aria-label={t("discardTitle")} className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-hairline bg-warn-bg px-5 py-3 text-sm text-warn-fg">
            <span className="font-medium">{t("discardTitle")}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setAsking(false)} className="min-h-11 rounded-lg border border-border bg-card px-4 text-ink">{t("keepEditing")}</button>
              <button type="button" onClick={discard} className="min-h-11 rounded-lg bg-bad px-4 font-medium text-white">{t("discard")}</button>
            </span>
          </div>
        )}
      </dialog>
    </>
  );
}
