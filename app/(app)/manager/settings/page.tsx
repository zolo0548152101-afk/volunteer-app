import { getTranslations } from "next-intl/server";
import { saveGeneralAction, saveLookupAction, saveProgramAction, saveRuleAction, saveYearAction } from "@/lib/actions/settings";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { loadAdminSettings, LOOKUP_KINDS } from "@/lib/services/settings";
import type { RuleKind } from "@/lib/services/reminders";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

const input = "rounded-lg border border-border bg-background px-3 py-2";
const btn = "self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground";
const KNOWN = ["invalid", "bad_dates", "name_required", "bad_milestones", "not_found", "forbidden", "generic"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [sp, t, actor] = await Promise.all([searchParams, getTranslations("settings"), requireRole("manager")]);
  const s = await loadAdminSettings(db(), actor);
  const current = s.years.find((y) => y.isCurrent);
  const field = (label: string, node: React.ReactNode) => <label className="flex flex-col gap-1 text-sm">{label}{node}</label>;
  const section = (id: string, title: string, body: React.ReactNode) => (
    <section id={id} className="mt-8 scroll-mt-4"><h2 className="text-lg font-medium">{title}</h2>{sp.saved === id && <Flash tone="status" className="mt-2 rounded-lg border border-green-300 p-2 text-sm text-green-800">{t("saved")}</Flash>}{body}</section>
  );
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {sp.error && KNOWN.includes(sp.error) && <Flash tone="error" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-700">{t(`errors.${sp.error}`)}</Flash>}

      {section("general", t("general"), (
        <form action={saveGeneralAction} className="mt-3 flex flex-col gap-3">
          {field(t("tolerance"), <input name="tolerance" type="number" step="0.25" min="0" max="24" defaultValue={s.tolerance} className={input} />)}
          <p className="text-xs text-muted">{t("toleranceHint")}</p>
          <fieldset className="flex gap-4"><legend className="text-sm">{t("languages")}</legend>
            {(["he", "en"] as const).map((l) => <label key={l} className="flex items-center gap-1 text-sm"><input type="checkbox" name="languages" value={l} defaultChecked={s.languages.includes(l)} />{t(`lang.${l}`)}</label>)}
          </fieldset>
          <SubmitButton className={btn}>{t("save")}</SubmitButton>
        </form>
      ))}

      {section("year", t("year"), (
        <div className="mt-3 flex flex-col gap-4">
          {[...(current ? [current] : []), ...s.years.filter((y) => !y.isCurrent)].map((y) => (
            <form key={y.id} action={saveYearAction} className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
              <input type="hidden" name="id" value={y.id} />
              {field(t("yearName"), <input name="name" required defaultValue={y.name} className={input} />)}
              {field(t("reportDeadline"), <input name="reportDeadline" type="date" defaultValue={y.reportDeadline ?? ""} className={input} />)}
              {field(t("startDate"), <input name="startDate" type="date" required defaultValue={String(y.startDate)} className={input} />)}
              {field(t("endDate"), <input name="endDate" type="date" required defaultValue={String(y.endDate)} className={input} />)}
              <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="makeCurrent" defaultChecked={y.isCurrent} />{t("isCurrent")}</label>
              <SubmitButton className={btn}>{t("save")}</SubmitButton>
            </form>
          ))}
          <form action={saveYearAction} className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-border p-3">
            <h3 className="col-span-2 font-medium">{t("newYear")}</h3>
            {field(t("yearName"), <input name="name" required className={input} />)}
            {field(t("reportDeadline"), <input name="reportDeadline" type="date" className={input} />)}
            {field(t("startDate"), <input name="startDate" type="date" required className={input} />)}
            {field(t("endDate"), <input name="endDate" type="date" required className={input} />)}
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="makeCurrent" />{t("isCurrent")}</label>
            <SubmitButton className={btn}>{t("add")}</SubmitButton>
          </form>
        </div>
      ))}

      {section("programs", t("programs"), (
        <div className="mt-3 flex flex-col gap-4">
          {[...s.programs, null].map((p) => (
            <form key={p?.id ?? "new"} action={saveProgramAction} className={`grid grid-cols-2 gap-3 rounded-xl border p-3 ${p ? "border-border" : "border-dashed border-border"}`}>
              {p ? <input type="hidden" name="id" value={p.id} /> : <h3 className="col-span-2 font-medium">{t("newProgram")}</h3>}
              {field(t("programName"), <input name="name" required defaultValue={p?.name} className={input} />)}
              {field(t("requiredHours"), <input name="requiredHours" type="number" step="0.5" min="0" required defaultValue={p ? Number(p.requiredHours) : ""} className={input} />)}
              {field(t("maxHoursPerDay"), <input name="maxHoursPerDay" type="number" step="0.5" min="0" max="24" defaultValue={p?.maxHoursPerDay != null ? Number(p.maxHoursPerDay) : ""} className={input} />)}
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} />{t("active")}</label>
              <label className="col-span-2 flex flex-col gap-1 text-sm">{t("milestones")}<textarea name="milestones" rows={3} defaultValue={(p?.milestones ?? []).map((m) => `${m.hours}: ${m.label}`).join("\n")} className={input} /><span className="text-xs text-muted">{t("milestonesHint")}</span></label>
              <SubmitButton className={btn}>{p ? t("save") : t("add")}</SubmitButton>
            </form>
          ))}
        </div>
      ))}

      {section("rules", t("rules"), (
        <div className="mt-3 flex flex-col gap-4">
          {(Object.keys(s.rules) as RuleKind[]).map((k) => {
            const r = s.rules[k];
            return (
              <form key={k} action={saveRuleAction} className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
                <input type="hidden" name="kind" value={k} />
                <h3 className="col-span-2 font-medium">{t(`ruleKind.${k}`)}</h3>
                <p className="col-span-2 text-xs text-muted">{t(`ruleHint.${k}`)}</p>
                <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={r.enabled} />{t("ruleEnabled")}</label>
                {k !== "coordinator_digest" && <>
                  {field(t("firstAfterDays"), <input name="firstAfterDays" type="number" min="0" max="365" defaultValue={r.firstAfterDays} className={input} />)}
                  {field(t("maxSends"), <input name="maxSends" type="number" min="1" max="20" defaultValue={r.maxSends} className={input} />)}
                  {field(t("repeatEveryDays"), <input name="repeatEveryDays" type="number" min="1" max="365" defaultValue={r.repeatEveryDays} className={input} />)}
                </>}
                {k === "coordinator_digest" && <><input type="hidden" name="firstAfterDays" value={r.firstAfterDays} /><input type="hidden" name="maxSends" value={r.maxSends} /><input type="hidden" name="repeatEveryDays" value={r.repeatEveryDays} /></>}
                <fieldset className="col-span-2 flex flex-wrap gap-4"><legend className="text-sm">{t("channels")}</legend>
                  {(["email", "sms", "whatsapp"] as const).map((c) => <label key={c} className="flex items-center gap-1 text-sm"><input type="checkbox" name="channels" value={c} defaultChecked={r.channels.includes(c)} />{t(`channel.${c}`)}</label>)}
                </fieldset>
                {k !== "coordinator_digest" && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="copyManager" defaultChecked={r.copyManager} />{t("copyManager")}</label>}
                <SubmitButton className={btn}>{t("save")}</SubmitButton>
              </form>
            );
          })}
        </div>
      ))}

      {section("lookups", t("lookups"), (
        <div className="mt-3 flex flex-col gap-6">
          {LOOKUP_KINDS.map((kind) => (
            <div key={kind}>
              <h3 className="font-medium">{t(`lookupKind.${kind}`)}</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {s.lookups[kind].map((l) => (
                  <li key={l.id}>
                    <form action={saveLookupAction} className="grid grid-cols-2 items-end gap-2 text-sm sm:grid-cols-[1fr_1fr_5rem_auto_auto]">
                      <input type="hidden" name="id" value={l.id} /><input type="hidden" name="kind" value={kind} />
                      <input name="labelHe" aria-label={t("labelHe")} required defaultValue={l.labelHe} className={input} />
                      <input name="labelEn" aria-label={t("labelEn")} defaultValue={l.labelEn ?? ""} className={input} dir="ltr" />
                      <input name="sortOrder" type="number" aria-label={t("sortOrder")} defaultValue={l.sortOrder} className={input} />
                      <label className="flex items-center gap-1"><input type="checkbox" name="isActive" defaultChecked={l.isActive} />{t("active")}</label>
                      <SubmitButton className="rounded-lg border border-border px-3 py-2">{t("save")}</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={saveLookupAction} className="mt-2 grid grid-cols-2 items-end gap-2 text-sm sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="kind" value={kind} />
                <input name="labelHe" aria-label={t("labelHe")} placeholder={t("labelHe")} required className={input} />
                <input name="labelEn" aria-label={t("labelEn")} placeholder={t("labelEn")} className={input} dir="ltr" />
                <SubmitButton className="rounded-lg border border-border px-3 py-2">{t("add")}</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
