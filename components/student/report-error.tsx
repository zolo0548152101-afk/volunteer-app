import { getTranslations } from "next-intl/server";
import { Flash } from "@/components/flash";

const KNOWN = ["bad_date", "future_date", "outside_year", "no_year", "bad_hours", "bad_time", "day_over_max", "duplicate", "not_your_placement", "not_editable", "reason_required", "bad_transition", "bad_reason", "not_a_student", "bad_file", "file_too_large", "storage_unavailable", "forbidden", "not_found", "generic"];

/** מציג רק קודים מוכרים, כדי שפרמטר ב-URL לא ישמש להזרקת טקסט */
export async function ReportErrorBanner({ code }: { code?: string }) {
  if (!code || !KNOWN.includes(code)) return null;
  const t = await getTranslations("reportErrors");
  return <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{t(code)}</Flash>;
}
