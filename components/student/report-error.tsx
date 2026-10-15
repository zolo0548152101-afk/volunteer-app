import { getTranslations } from "next-intl/server";

const KNOWN = ["bad_date", "future_date", "outside_year", "no_year", "bad_hours", "bad_time", "day_over_max", "duplicate", "not_your_placement", "not_editable", "reason_required", "bad_transition", "bad_reason", "not_a_student", "forbidden", "not_found", "generic"];

/** מציג רק קודים מוכרים, כדי שפרמטר ב-URL לא ישמש להזרקת טקסט */
export async function ReportErrorBanner({ code }: { code?: string }) {
  if (!code || !KNOWN.includes(code)) return null;
  const t = await getTranslations("reportErrors");
  return <p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-700">{t(code)}</p>;
}
