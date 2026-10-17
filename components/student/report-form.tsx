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
const MAX_FILE = 5 * 1024 * 1024;

export function ReportForm({ placements, absence: absenceInitial, report, action, max, today, extra }: {
  placements: Pl[]; absence: boolean; report?: ReportRow; action: (fd: FormData) => Promise<void>; max: string; today: string; extra?: React.ReactNode;
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
  const [fileError, setFileError] = useState(false);

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

      {editing && report?.status === "approved" && <p className="rounded-lg border border-warn/50 bg-warn-bg p-3 text-sm text-warn-fg">{t("editApprovedWarning")}</p>}

      {!editing && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm">{t("kind")}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-paper p-1">
            {([false, true] as const).map((isAbsence) => (
              <label key={String(isAbsence)} className="relative">
                <input type="radio" name="kind" value={isAbsence ? "absence" : "volunteering"} checked={absence === isAbsence} onChange={() => setAbsence(isAbsence)} className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0" />
                <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors duration-150 peer-checked:bg-card peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                  {t(isAbsence ? "kindAbsence" : "kindVolunteering")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
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

      {absence && (
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="attachment">{t("attachment")} <span className="text-muted">({t("optional")})</span></label>
          <input id="attachment" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby="attachment-hint"
            onChange={(e) => setFileError(!!e.target.files?.[0] && e.target.files[0].size > MAX_FILE)}
            className="min-h-11 w-full rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm file:me-3 file:min-h-9 file:rounded-md file:border-0 file:bg-paper file:px-3 file:text-sm" />
          <span id="attachment-hint" className="text-xs text-muted">{t("attachmentHint")}</span>
          {report?.attachment && <a href={`/api/reports/${report.id}/attachment`} target="_blank" rel="noreferrer" className="underline">{t("currentAttachment")}</a>}
          {fileError && <span role="alert" className="text-bad-fg">{t("fileTooLarge")}</span>}
        </div>
      )}

      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center underline">{t("moreDetails")}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">{t("start")}<input name="startTime" type="time" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} className={input} /></label>
            <label className="flex flex-col gap-1">{t("end")}<input name="endTime" type="time" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} className={input} /></label>
          </div>
          <label className="flex flex-col gap-1">{t("notes")}
            <textarea name="studentNotes" rows={3} defaultValue={report?.studentNotes ?? ""} className={input} />
          </label>
        </div>
      </details>

      {extra}

      <SubmitButton disabled={fileError} className="min-h-12 rounded-lg bg-primary px-4 py-2.5 text-base font-medium text-primary-foreground">{report ? t("resubmit") : t("submit")}</SubmitButton>
    </form>
  );
}
