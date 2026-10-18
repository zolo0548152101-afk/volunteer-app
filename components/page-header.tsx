import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * נתיב אחיד למסכי משנה (במקום "חזרה" שונה בכל מסך): סטודנטים › איתי גולן.
 * כל חוליה קישור (שם נגיש "חזרה ל…"), והאחרונה היא העמוד הנוכחי. מוסתר בהדפסה.
 */
export async function PageHeader({ crumbs, current, className = "" }: { crumbs: { label: string; href: string }[]; current: string; className?: string }) {
  const t = await getTranslations("common");
  return (
    <nav aria-label={t("breadcrumb")} className={`mb-2 print:hidden ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-1 text-sm text-ink-2">
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <Link href={c.href} aria-label={t("backTo", { name: c.label })} className="inline-flex min-h-11 items-center underline md:min-h-9">{c.label}</Link>
            <span aria-hidden="true" className="rtl:-scale-x-100">›</span>
          </li>
        ))}
        <li aria-current="page" className="font-medium text-ink">{current}</li>
      </ol>
    </nav>
  );
}
