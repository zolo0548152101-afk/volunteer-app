"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { evaluateContract, round2, type PlacementLike, type WindowInfo } from "@/lib/services/capacity";
import type { LiveEvalInput } from "@/lib/services/interviews";
import type { Day } from "@/lib/services/places";

const ALL_DAYS: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri"];

export type WindowMeta = {
  windowId: string; placeName: string; label: string; city: string | null; category: string | null; days: Day[];
  startTime: string | null; endTime: string | null; hoursPerSlot: number; slots: number; taskDescription: string | null;
};
export type Candidate = WindowMeta & { remainingSlots: number; remainingHours: number; overlapDays: Day[]; typeMatch: boolean };
export type InitialLine = { windowId: string; slots: number; weeklyHours: number; days: Day[]; hours: string; report: string; desc: string; meta: WindowMeta };

type Line = { key: string; windowId: string; slots: number; weekly: number; linked: boolean; days: Day[]; hours: string; report: string; desc: string };

const n2 = (n: number) => String(round2(n));
/** תחזיות בשעות שלמות: "כ-401" קריא יותר מ-400.73 */
const h0 = (n: number) => String(Math.round(n));
const n1 = (n: number) => String(Math.round(n * 10) / 10);
const timeOf = (m: Pick<WindowMeta, "startTime" | "endTime">) => (m.startTime && m.endTime ? `${m.startTime.slice(0, 5)}–${m.endTime.slice(0, 5)}` : "");
const field = "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base tabular-nums";

/**
 * מסך עריכת השיבוץ של סטודנט: המקומות שלו (שורה אחת לכל מקום, עם תקנים, שעות, ימים ושעות ביום),
 * רשימת חלונות פנויים עם חיפוש חי והוספה בתוך השורה, ותחזית שעות עד סוף השנה שמתעדכנת בכל שינוי.
 * החישוב הוא אותו `evaluateContract` שהשרת מריץ בשמירה ובאישור; כאן הוא רק משוב מיידי.
 * הכל נשלח בטופס הטיוטה (שדות l_<i>_*), כך שפעולות השרת לא השתנו.
 */
export function PlacementEditor({ editable, studentName, initial, candidates, live, dayLabels, catLabels, studentDays, actions, children, canOverride }: {
  canOverride?: boolean; actions?: ReactNode; children?: ReactNode; editable: boolean; studentName: string; initial: InitialLine[]; candidates: Candidate[]; live: LiveEvalInput;
  dayLabels: Record<Day, string>; catLabels: Record<string, string>; studentDays: Day[];
}) {
  const t = useTranslations("placementEditor");
  const ti = useTranslations("issues");
  const seq = useRef(0);
  const nextKey = () => `l${seq.current++}`;
  const toLine = (l: InitialLine): Line => ({
    key: nextKey(), windowId: l.windowId, slots: l.slots, weekly: l.weeklyHours, linked: round2(l.slots * l.meta.hoursPerSlot) === round2(l.weeklyHours),
    days: l.days, hours: l.hours, report: l.report, desc: l.desc,
  });
  const [lines, setLines] = useState<Line[]>(() => initial.map(toLine));
  const [adding, setAdding] = useState<Line | null>(null);
  const [q, setQ] = useState("");
  const [day, setDay] = useState<Day | "">("");
  const [cat, setCat] = useState("");
  const [onlyMatch, setOnlyMatch] = useState(false);
  const formRef = useRef<HTMLElement | null>(null);

  // פרטי כל חלון שמופיע במסך: מהשורות השמורות ומהחלונות הפנויים
  const meta = useMemo(() => {
    const m = new Map<string, WindowMeta>();
    for (const l of initial) m.set(l.windowId, l.meta);
    for (const c of candidates) if (!m.has(c.windowId)) m.set(c.windowId, c);
    return m;
  }, [initial, candidates]);

  // קלט החישוב: חלונות ושיבוצים של אחרים. לחלון שנוסף מהרשימה מחשבים את תפוסת האחרים ממה שפנוי בו
  const { windows, others } = useMemo(() => {
    const ws: WindowInfo[] = [...live.windows];
    const os: PlacementLike[] = [...live.others];
    const known = new Set(ws.map((w) => w.id));
    for (const c of candidates) {
      if (known.has(c.windowId)) continue;
      ws.push({ id: c.windowId, placeId: c.windowId, slots: c.slots, hoursPerSlot: c.hoursPerSlot, isActive: true });
      const usedSlots = round2(c.slots - c.remainingSlots), usedHours = round2(c.slots * c.hoursPerSlot - c.remainingHours);
      if (usedSlots > 0 || usedHours > 0) os.push({ studentId: "others", timeWindowId: c.windowId, slots: usedSlots, weeklyHours: usedHours, isActive: true });
    }
    return { windows: ws, others: os };
  }, [live, candidates]);

  const ev = evaluateContract({ studentId: live.studentId, proposed: lines.map((l) => ({ timeWindowId: l.windowId, slots: l.slots, weeklyHours: l.weekly })), windows, activePlacements: others, bank: live.bank ?? undefined });
  const weeks = ev.bank?.weeksRemaining ?? null;

  // שינויים שלא נשמרו: אזהרה ביציאה מהדף
  const snapshot = (ls: Line[]) => JSON.stringify(ls.map(({ key: _k, linked: _l, ...r }) => r));
  const [initialSnap] = useState(() => snapshot(lines));
  const dirty = snapshot(lines) !== initialSnap;
  const submitting = useRef(false);
  useEffect(() => {
    const form = formRef.current?.closest("form");
    const onSubmit = () => { submitting.current = true; };
    form?.addEventListener("submit", onSubmit);
    const warn = (e: BeforeUnloadEvent) => { if (dirty && !submitting.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { form?.removeEventListener("submit", onSubmit); window.removeEventListener("beforeunload", warn); };
  }, [dirty]);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? withLink(l, patch) : l)));
  const withLink = (l: Line, patch: Partial<Line>): Line => {
    const next = { ...l, ...patch };
    const hps = meta.get(l.windowId)?.hoursPerSlot ?? 0;
    // שעות בשבוע צמודות לתקנים עד שמשנים אותן ידנית
    if (patch.slots !== undefined && l.linked) next.weekly = round2(patch.slots * hps);
    if (patch.weekly !== undefined) next.linked = round2(patch.weekly) === round2(next.slots * hps);
    return next;
  };

  const startAdd = (c: Candidate) => {
    const slots = Math.max(0.25, Math.min(1, c.remainingSlots));
    const fit = c.days.filter((d) => studentDays.includes(d));
    const days = fit.length ? fit : c.days;
    const weekly = round2(slots * c.hoursPerSlot);
    setAdding({ key: nextKey(), windowId: c.windowId, slots, weekly, linked: true, days, hours: timeOf(c), report: n2(weekly / Math.max(1, days.length)), desc: c.taskDescription ?? "" });
  };
  const confirmAdd = () => { if (adding) { setLines((ls) => [...ls, adding]); setAdding(null); } };

  const inLines = new Set(lines.map((l) => l.windowId));
  const needle = q.trim().toLocaleLowerCase();
  const shown = candidates.filter((c) => {
    if (inLines.has(c.windowId)) return false; // כבר בשיבוץ: נערך למעלה
    if (day && !c.days.includes(day)) return false;
    if (cat && c.category !== cat) return false;
    if (onlyMatch && c.overlapDays.length === 0) return false;
    if (!needle) return true;
    const hay = [c.placeName, c.label, c.city, c.category ? catLabels[c.category] : "", c.days.map((d) => dayLabels[d]).join(" "), c.taskDescription].filter(Boolean).join(" ").toLocaleLowerCase();
    return needle.split(/\s+/).every((w) => hay.includes(w));
  });
  const cats = [...new Set(candidates.map((c) => c.category).filter((x): x is string => !!x))];
  const issuesFor = (wid: string) => ev.issues.filter((i) => i.timeWindowId === wid && i.severity === "block");

  /* ── שדות העריכה של שורה (משותף לשורה קיימת ולהוספה) ── */
  const editor = (l: Line, set: (p: Partial<Line>) => void, idx: number | null) => {
    const m = meta.get(l.windowId)!;
    const dayOpts = m.days.length ? m.days : ALL_DAYS;
    const name = (f: string) => (idx === null ? undefined : `l_${idx}_${f}`);
    const errs = issuesFor(l.windowId).filter(() => idx !== null);
    const u = ev.windows[l.windowId];
    const errId = `${l.key}-err`;
    const maxWeekly = round2(l.slots * m.hoursPerSlot);
    return (
      <>
        {idx !== null && <input type="hidden" name={`l_${idx}_window`} value={l.windowId} />}
        {idx !== null && l.days.map((d) => <input key={d} type="hidden" name={`l_${idx}_days`} value={d} />)}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_9rem]">
          <label className="flex flex-col gap-1 text-sm text-ink-2">{t("slots")}
            <input type="number" inputMode="decimal" step="0.25" min="0.25" name={name("slots")} value={l.slots} disabled={!editable} aria-describedby={errs.length ? errId : undefined}
              onChange={(e) => set({ slots: Number(e.target.value) })} className={field} /></label>
          <label className="flex flex-col gap-1 text-sm text-ink-2">{t("weekly")}
            <input type="number" inputMode="decimal" step="0.25" min="0.25" name={name("weekly")} value={l.weekly} disabled={!editable} aria-describedby={errs.length ? errId : undefined}
              onChange={(e) => set({ weekly: Number(e.target.value) })} className={field} /></label>
          <fieldset className="col-span-2 min-w-0 sm:col-span-1">
            <legend className="mb-1 text-sm text-ink-2">{t("days")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {dayOpts.map((d) => {
                const on = l.days.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} disabled={!editable} onClick={() => set({ days: on ? l.days.filter((x) => x !== d) : ALL_DAYS.filter((x) => x === d || l.days.includes(x)) })}
                    className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm transition-colors duration-150 ${on ? "border-primary bg-info-bg font-medium text-info-fg" : "border-border bg-card text-ink-2 hover:bg-paper"}`}>{dayLabels[d]}</button>
                );
              })}
            </div>
          </fieldset>
          <label className="col-span-2 flex flex-col gap-1 text-sm text-ink-2 sm:col-span-1">{t("time")}
            <input name={name("hours")} value={l.hours} disabled={!editable} dir="ltr" placeholder="16:00–19:00" onChange={(e) => set({ hours: e.target.value })} className={`${field} text-end`} /></label>
        </div>
        {errs.length > 0 && (
          <ul id={errId} className="mt-2 flex flex-col gap-1 text-sm text-bad-fg">
            {errs.map((i, k) => (
              <li key={k}>⛔ {i.code === "window_over_slots" && u ? t("overSlots", { slots: n2(u.remainingSlots + l.slots) })
                : i.code === "window_over_hours" && u ? t("overHours", { hours: n2(u.remainingHours + l.weekly) })
                : i.code === "weekly_hours_over_slots" ? t("weeklyOverSlots", { slots: n2(l.slots), max: n2(maxWeekly) })
                : ti(i.code)}</li>
            ))}
          </ul>
        )}
        <details className="mt-2 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink-2 underline">{t("more")}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <label className="flex flex-col gap-1 text-ink-2">{t("reportHours")}
              <input type="number" inputMode="decimal" step="any" min="0" name={name("report")} value={l.report} disabled={!editable} onChange={(e) => set({ report: e.target.value })} className={field} /></label>
            <label className="flex flex-col gap-1 text-ink-2">{t("description")}
              <input name={name("desc")} value={l.desc} disabled={!editable} onChange={(e) => set({ desc: e.target.value })} className={field} /></label>
          </div>
        </details>
      </>
    );
  };

  const titleOf = (m: WindowMeta) => (
    <>
      <p className="text-base font-semibold">{m.placeName} <span className="font-normal text-ink-2">· {m.label}</span></p>
      <p className="text-sm text-ink-2">{[m.city, m.category ? catLabels[m.category] ?? m.category : null, m.days.map((d) => dayLabels[d]).join(", "), timeOf(m) ? `⁦${timeOf(m)}⁩` : null].filter(Boolean).join(" · ")}</p>
    </>
  );

  /* ── תחזית ── */
  const b = ev.bank;
  const projected = b ? round2(b.approved + b.plannedHours) : 0;
  const scale = b ? Math.max(b.target, projected, 1) : 1;
  const pct = (x: number) => `${Math.min(100, (x / scale) * 100)}%`;
  const generalIssues = ev.issues.filter((i) => !i.timeWindowId && i.severity === "block");

  return (
    <div ref={(el) => { formRef.current = el; }} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* המקומות של הסטודנט */}
        <section aria-labelledby="current-h" className="rounded-2xl border border-hairline bg-card p-4 sm:p-5">
          <h2 id="current-h" className="text-lg font-semibold">{t("currentTitle", { name: studentName })} <span className="text-base font-normal text-ink-3">({lines.length})</span></h2>
          <p className="mt-1 text-sm text-ink-2">{t("currentHint")}</p>
          {lines.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-ink-2">{t("empty")}</p>}
          <ul className="mt-4 flex flex-col gap-3">
            {lines.map((l, i) => {
              const m = meta.get(l.windowId)!;
              const u = ev.windows[l.windowId];
              const bad = issuesFor(l.windowId).length > 0;
              return (
                <li key={l.key} className={`rounded-xl border p-4 ${bad ? "border-bad/60" : "border-border"}`}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">{titleOf(m)}</div>
                    <div className="flex items-center gap-3">
                      {weeks !== null && <span className="rounded-full bg-info-bg px-3 py-1 text-sm font-medium text-info-fg">{t("untilYearEnd", { hours: h0(l.weekly * weeks) })}</span>}
                      {editable && <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t("removeAria", { name: `${m.placeName} · ${m.label}` })}
                        className="min-h-11 rounded-lg border border-bad/50 px-4 text-sm text-bad-fg hover:bg-bad-bg">{t("remove")}</button>}
                    </div>
                  </div>
                  {editor(l, (p) => update(l.key, p), i)}
                  {u && <p className={`mt-2 text-sm ${u.remainingSlots < 0 || u.remainingHours < 0 ? "text-bad-fg" : "text-ink-3"}`}>{t("capacityLeft", { slots: n2(u.remainingSlots), hours: n2(u.remainingHours) })}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* הוספת מקום */}
        {editable && (
          <section aria-labelledby="add-h" className="rounded-2xl border border-hairline bg-card p-4 sm:p-5">
            <h2 id="add-h" className="text-lg font-semibold">{t("addTitle")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem]">
              <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm text-ink-2 sm:col-span-1">{t("searchLabel")}
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} className={field} /></label>
              <label className="flex flex-col gap-1 text-sm text-ink-2">{t("day")}
                <select value={day} onChange={(e) => setDay(e.target.value as Day | "")} className={field}><option value="">{t("allDays")}</option>{ALL_DAYS.map((d) => <option key={d} value={d}>{dayLabels[d]}</option>)}</select></label>
              <label className="flex flex-col gap-1 text-sm text-ink-2">{t("category")}
                <select value={cat} onChange={(e) => setCat(e.target.value)} className={field}><option value="">{t("allCategories")}</option>{cats.map((c) => <option key={c} value={c}>{catLabels[c] ?? c}</option>)}</select></label>
            </div>
            <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} className="size-5" />{t("onlyMatching")}</label>
            <p role="status" aria-live="polite" className="mt-1 text-sm text-ink-3">{t("results", { n: shown.length })}</p>
            {shown.length === 0 && <p className="mt-3 text-ink-2">{t("noResults")}</p>}
            <ul className="mt-3 flex flex-col gap-3">
              {shown.map((c) => {
                const open = adding?.windowId === c.windowId;
                const already = inLines.has(c.windowId);
                return (
                  <li key={c.windowId} className={`rounded-xl border p-4 ${open ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {titleOf(c)}
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                          <span className="font-medium">{t("free", { slots: n2(c.remainingSlots), hours: n2(c.remainingHours) })}</span>
                          {c.overlapDays.length > 0 && <span className="text-ok-fg">✓ {t("matchDays", { days: c.overlapDays.map((d) => dayLabels[d]).join(", ") })}</span>}
                          {c.typeMatch && <span className="text-ok-fg">✓ {t("matchType")}</span>}
                        </p>
                      </div>
                      {!open && (already
                        ? <span className="inline-flex min-h-11 items-center rounded-lg bg-paper px-4 text-sm text-ink-3">{t("alreadyIn")}</span>
                        : <button type="button" onClick={() => startAdd(c)} aria-label={`${t("add")}: ${c.placeName} · ${c.label}`} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">{t("add")}</button>)}
                    </div>
                    {open && adding && (
                      <div className="mt-4 border-t border-hairline pt-4">
                        {editor(adding, (p) => setAdding((a) => (a ? withLink(a, p) : a)), null)}
                        {weeks !== null && <p className="mt-2 text-sm text-info-fg">{t("untilYearEnd", { hours: h0(adding.weekly * weeks) })}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={confirmAdd} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">{t("addConfirm")}</button>
                          <button type="button" onClick={() => setAdding(null)} className="min-h-11 rounded-lg border border-border px-5 text-sm hover:bg-paper">{t("cancel")}</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {children}
      </div>

      {/* בטלפון: שורת תחזית קבועה מעל הניווט התחתון, כדי לראות את ההשפעה בזמן העריכה */}
      {b && (
        <p aria-hidden="true" className={`sticky bottom-20 z-30 -mx-1 flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg lg:hidden ${b.status === "ok" ? "border-ok/40 bg-ok-bg text-ok-fg" : "border-warn/40 bg-warn-bg text-warn-fg"}`}>
          <span className="font-semibold">{t("mobileSummary", { projected: h0(projected), target: h0(b.target) })}</span>
          <span>{b.status === "ok" ? t("statusOk") : b.status === "under" ? t("statusUnder", { gap: h0(-b.gap) }) : t("statusOver", { gap: h0(b.gap) })}</span>
        </p>
      )}

      {/* תחזית שעות: נדבקת לצד במחשב */}
      <aside aria-labelledby="fc-h" className="lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-2xl border border-hairline bg-card p-4 sm:p-5" role="status" aria-live="polite">
          <h2 id="fc-h" className="text-lg font-semibold">{t("forecastTitle")}</h2>
          {!b ? <p className="mt-2 text-ink-2">{t("noTarget")}</p> : (
            <>
              <p className="mt-3 text-3xl font-bold tabular-nums">{h0(projected)} <span className="text-base font-normal text-ink-2">{t("ofTarget", { target: h0(b.target) })}</span></p>
              <p className={`mt-1 text-base font-medium ${b.status === "ok" ? "text-ok-fg" : "text-warn-fg"}`}>
                {b.status === "ok" ? t("statusOk") : b.status === "under" ? t("statusUnder", { gap: h0(-b.gap) }) : t("statusOver", { gap: h0(b.gap) })}
              </p>
              <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-paper" aria-hidden="true">
                <div className="absolute inset-y-0 start-0 bg-ok" style={{ width: pct(b.approved) }} />
                <div className="absolute inset-y-0 bg-primary/70" style={{ insetInlineStart: pct(b.approved), width: `calc(${pct(projected)} - ${pct(b.approved)})` }} />
              </div>
              <div className="relative h-4" aria-hidden="true"><span className="absolute top-0 h-3 w-0.5 bg-ink" style={{ insetInlineStart: pct(b.target) }} /></div>
              <dl className="mt-1 flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-2"><dt className="flex items-center gap-2"><span className="size-3 rounded-sm bg-ok" />{t("approvedSoFar")}</dt><dd className="font-medium tabular-nums">{h0(b.approved)}</dd></div>
                <div className="flex flex-wrap justify-between gap-x-2"><dt className="flex items-center gap-2"><span className="size-3 rounded-sm bg-primary/70" />{t("planned")}</dt><dd className="font-medium tabular-nums">{h0(b.plannedHours)}</dd>
                  <dd className="basis-full text-ink-3">{t("plannedDetail", { weekly: n2(b.contractWeekly), weeks: n1(b.weeksRemaining) })}</dd></div>
                <div className="flex justify-between gap-2"><dt className="flex items-center gap-2"><span className="h-3 w-0.5 bg-ink" />{t("target")}</dt><dd className="font-medium tabular-nums">{h0(b.target)}</dd></div>
              </dl>
              <p className="mt-3 rounded-lg bg-paper p-3 text-sm">{t("neededWeekly", { n: n1(b.neededWeekly) })}</p>
            </>
          )}
          {generalIssues.length > 0 && <ul className="mt-3 text-sm text-bad-fg">{generalIssues.map((i, k) => <li key={k}>⛔ {ti(i.code)}</li>)}</ul>}
          {dirty && <p className="mt-3 rounded-lg bg-warn-bg p-3 text-sm font-medium text-warn-fg">{t("unsaved")}</p>}
        </section>
        {actions && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-hairline bg-card p-4 sm:p-5">
            {/* חריגה מיעד הסטודנט: מנהל מאשר עם סיבה (נרשם ביומן); אחרים רואים שנדרש מנהל. מחושב חי, לפני שמירה */}
            {editable && ev.needsManagerOverride && !ev.blocked && (canOverride
              ? <label className="flex flex-col gap-1 text-sm text-ink-2">{t("overrideReason")}<input name="overrideReason" className={field} /></label>
              : <p className="text-sm text-warn-fg">{t("needsManager")}</p>)}
            {actions}
          </div>
        )}
      </aside>
    </div>
  );
}
