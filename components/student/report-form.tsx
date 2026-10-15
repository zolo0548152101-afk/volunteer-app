import { getTranslations } from "next-intl/server";
import type { ReportRow } from "@/lib/services/reports";

type Pl = { id: string; placeName: string; windowLabel: string; defaultHours: number; startTime: string; endTime: string };
const input = "w-full rounded-lg border border-border bg-background px-3 py-2";
const REASONS = ["reserve_duty", "illness", "security_situation", "other"] as const;

export async function ReportForm({ placements, absence, report, action, max }: { placements: Pl[]; absence: boolean; report?: ReportRow; action: (fd: FormData) => Promise<void>; max: string }) {
  const t = await getTranslations("reportForm");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  const first = placements.find((p) => p.id === report?.placementId) ?? placements[0];
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      {report && <input type="hidden" name="reportId" value={report.id} />}
      <input type="hidden" name="type" value={absence ? "absence" : "volunteering"} />
      {!absence && (
        <label className="flex flex-col gap-1 text-sm">{t("placement")}
          <select name="placementId" required defaultValue={first?.id} className={input}>
            {placements.map((p) => <option key={p.id} value={p.id}>{p.placeName} · {p.windowLabel}</option>)}
          </select>
        </label>
      )}
      {absence && (
        <label className="flex flex-col gap-1 text-sm">{t("absenceReason")}
          <select name="absenceReason" required defaultValue={report?.absenceReason ?? ""} className={input}>
            <option value="" disabled>—</option>
            {REASONS.map((r) => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">{t("date")}
        <input name="volunteerDate" type="date" required max={today} defaultValue={report?.volunteerDate ?? today} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{t("hours")}
        <input name="reportedHours" type="number" inputMode="decimal" step="0.25" min="0.25" max={max} required defaultValue={report ? report.reportedHours : (first?.defaultHours ?? "")} className={input} />
        {!absence && first && <span className="text-xs text-muted">{t("hoursHint")}</span>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">{t("start")}<input name="startTime" type="time" defaultValue={report?.startTime?.slice(0, 5) ?? first?.startTime ?? ""} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("end")}<input name="endTime" type="time" defaultValue={report?.endTime?.slice(0, 5) ?? first?.endTime ?? ""} className={input} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm">{t("notes")}
        <textarea name="studentNotes" rows={3} defaultValue={report?.studentNotes ?? ""} className={input} />
      </label>
      <button type="submit" className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">{report ? t("resubmit") : t("submit")}</button>
    </form>
  );
}
