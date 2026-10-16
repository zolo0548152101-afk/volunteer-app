"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ReportRow } from "@/lib/services/reports";
import { SubmitButton } from "@/components/submit-button";

export type Pl = { id: string; placeName: string; windowLabel: string; defaultHours: number; startTime: string; endTime: string; defaultDate: string };
const input = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base";
const REASONS = ["reserve_duty", "illness", "security_situation", "other"] as const;

/**
 * טופס הדיווח: שלושה שדות גלויים (שיבוץ, תאריך, שעות), הכול ממולא מהחוזה. שעות והערות מקופלות.
 * החלפת שיבוץ מעדכנת תאריך, שעות וזמנים לפי החוזה של השיבוץ החדש.
 */
export function ReportForm({ placements, absence: absenceInitial, report, action, max, today }: {
  placements: Pl[]; absence: boolean; report?: ReportRow; action: (fd: FormData) => Promise<void>; max: string; today: string;
}) {
  const t = useTranslations("reportForm");
  const editing = !!report;
  const first = placements.find((p) => p.id === report?.placementId) ?? placements[0];
  const [absence, setAbsence] = useState(absenceInitial);
  const [placementId, setPlacementId] = useState(first?.id ?? "");
  const [date, setDate] = useState(report?.volunteerDate ?? first?.defaultDate ?? today);
  const [hours, setHours] = useState(String(report ? report.reportedHours : (first?.defaultHours ?? "")));
  const [start, setStart] = useState(report?.startTime?.slice(0, 5) ?? first?.startTime ?? "");
  const [end, setEnd] = useState(report?.endTime?.slice(0, 5) ?? first?.endTime ?? "");

  function pick(id: string) {
    setPlacementId(id);
    const p = placements.find((x) => x.id === id);
    if (!p) return;
    setDate(p.defaultDate);
    setHours(String(p.defaultHours));
    setStart(p.startTime);
    setEnd(p.endTime);
  }

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      {report && <input type="hidden" name="reportId" value={report.id} />}
      <input type="hidden" name="type" value={absence ? "absence" : "volunteering"} />

      {!editing && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={absence} onChange={(e) => setAbsence(e.target.checked)} className="size-5" />
          {t("absenceToggle")}
        </label>
      )}

      {!absence && (
        <label className="flex flex-col gap-1 text-sm">{t("placement")}
          <select name="placementId" required value={placementId} onChange={(e) => pick(e.target.value)} className={input}>
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
        <input name="volunteerDate" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">{t("hours")}
        <input name="reportedHours" type="number" inputMode="decimal" step="0.25" min="0.25" max={max} required value={hours} onChange={(e) => setHours(e.target.value)} className={input} />
        {!absence && first && <span className="text-xs text-muted">{t("hoursHint")}</span>}
      </label>

      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center underline">{t("moreDetails")}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">{t("start")}<input name="startTime" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={input} /></label>
            <label className="flex flex-col gap-1">{t("end")}<input name="endTime" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={input} /></label>
          </div>
          <label className="flex flex-col gap-1">{t("notes")}
            <textarea name="studentNotes" rows={3} defaultValue={report?.studentNotes ?? ""} className={input} />
          </label>
        </div>
      </details>

      <SubmitButton className="min-h-12 rounded-lg bg-primary px-4 py-2.5 text-base font-medium text-primary-foreground">{report ? t("resubmit") : t("submit")}</SubmitButton>
    </form>
  );
}
