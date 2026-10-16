"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { evaluateContract, type ProposedPlacement } from "@/lib/services/capacity";
import type { LiveEvalInput } from "@/lib/services/interviews";

type Props = {
  formId: string;
  live: LiveEvalInput;
  /** שורות החוזה כפי שנשמרו: האינדקס הוא זה ששם השדה בטופס (l_<i>_slots / l_<i>_weekly) משתמש בו */
  lines: { windowId: string; slots: number; weeklyHours: number; label: string }[];
  editable: boolean;
};

const num = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Number(v);
  return v === null || v === "" || !Number.isFinite(n) ? fallback : n;
};

/**
 * פאנל "שני הבנקים" חי: מחשב מחדש בכל שינוי בשדות הכמות והשעות, עם אותה פונקציה טהורה
 * שהשרת משתמש בה בשמירה ובסגירה (`evaluateContract`). השרת עדיין מחליט; זה רק משוב מיידי.
 */
export function LiveBanks({ formId, live, lines, editable }: Props) {
  const t = useTranslations("interviews");
  const ti = useTranslations("issues");
  const [proposed, setProposed] = useState<ProposedPlacement[]>(lines.map((l) => ({ timeWindowId: l.windowId, slots: l.slots, weeklyHours: l.weeklyHours })));

  useEffect(() => {
    if (!editable) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout>;
    const read = () => {
      const fd = new FormData(form);
      setProposed(lines.map((l, i) => ({ timeWindowId: l.windowId, slots: num(fd.get(`l_${i}_slots`), 0), weeklyHours: num(fd.get(`l_${i}_weekly`), 0) })));
    };
    // השהיה קצרה: לא לחשב ולהכריז על כל הקשה
    const onInput = () => { clearTimeout(timer); timer = setTimeout(read, 250); };
    form.addEventListener("input", onInput);
    return () => { clearTimeout(timer); form.removeEventListener("input", onInput); };
  }, [formId, lines, editable]);

  const ev = evaluateContract({ studentId: live.studentId, proposed, windows: live.windows, activePlacements: live.others, bank: live.bank });
  const label = (windowId: string) => lines.find((l) => l.windowId === windowId)?.label ?? "";
  const warns = ev.issues.filter((i) => i.severity === "warn");
  const blocks = ev.issues.filter((i) => i.severity === "block");

  return (
    <>
      {ev.bank ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{t("studentBank")}</p>
            <p>{t("bankLine1", { approved: ev.bank.approved, target: ev.bank.target, remaining: ev.bank.remainingNeed })}</p>
            <p>{t("bankLine2", { weeks: ev.bank.weeksRemaining, needed: ev.bank.neededWeekly })}</p>
            <p>{t("bankLine3", { contract: ev.bank.contractWeekly, planned: ev.bank.plannedHours })}</p>
            <p className={`mt-1 font-medium ${ev.bank.status === "ok" ? "text-green-700" : "text-amber-700"}`}>{t(`bankStatus.${ev.bank.status}`, { gap: Math.abs(ev.bank.gap) })}</p>
          </div>
          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{t("institutionBank")}</p>
            {Object.keys(ev.windows).length === 0 && <p className="text-muted">{t("noLines")}</p>}
            {Object.entries(ev.windows).map(([wid, u]) => (
              <p key={wid} className={u.remainingSlots < 0 || u.remainingHours < 0 ? "text-red-700" : undefined}>{label(wid)}: {t("windowLeft", { remainingSlots: u.remainingSlots, remainingHours: u.remainingHours })}</p>
            ))}
          </div>
        </div>
      ) : <p className="mt-2 text-sm text-muted">{t("noBank")}</p>}
      {/* אזור חי: שינוי בשדות מכריז על ההתראות החדשות */}
      <div role="status" aria-live="polite">
        {(blocks.length > 0 || warns.length > 0) && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {blocks.map((i, n) => <li key={`b${n}`} className="text-red-700">⛔ {ti(i.code)}{i.timeWindowId ? ` (${label(i.timeWindowId)})` : ""}</li>)}
            {warns.map((i, n) => <li key={`w${n}`} className="text-amber-700">⚠ {ti(i.code)}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}
