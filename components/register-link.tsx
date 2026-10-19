"use client";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/** קישור ההרשמה הפתוח לשיתוף: הכתובת המלאה, העתקה בלחיצה ופתיחה בלשונית חדשה */
export function RegisterLink() {
  const t = useTranslations("applicants");
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const url = `${origin}/register`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* הדפדפן חסם: הכתובת גלויה ואפשר לסמן אותה */ }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg border border-border bg-paper px-3 py-2.5 text-sm">{url}</code>
      <button type="button" onClick={copy} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">{copied ? t("copied") : t("copy")}</button>
      <a href="/register" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm hover:bg-paper">{t("openForm")}</a>
      <span role="status" aria-live="polite" className="sr-only">{copied ? t("copied") : ""}</span>
    </div>
  );
}
