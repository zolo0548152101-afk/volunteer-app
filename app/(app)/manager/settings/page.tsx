import { getFormatter, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/date-format";
import { moveLookupAction, saveGeneralAction, saveLookupAction, saveProgramAction, saveRuleAction, saveYearAction } from "@/lib/actions/settings";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { loadAdminSettings, LOOKUP_KINDS } from "@/lib/services/settings";
import type { RuleKind } from "@/lib/services/reminders";
import { SubmitButton } from "@/components/submit-button";
import { EditDialog } from "@/components/edit-dialog";
import { MultiSelect } from "@/components/multi-select";
import { Flash } from "@/components/flash";
import { dt, Th } from "@/components/data-table";

const input = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const btn = "self-end justify-self-start rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground";
const row = "grid items-end gap-x-3 gap-y-2 border-b border-border py-3 last:border-0";
/** שורה בטבלת הגדרות: תקציר + כפתור "עריכה" שפותח חלון עם הטופס. הוספה: כפתור "＋" שפותח חלון עם טופס ריק */
function Disclosure({ summary, editLabel, title, add, children }: { summary: React.ReactNode; editLabel: string; title?: string; add?: boolean; children: React.ReactNode }) {
  if (add) {
    return (
      <div className="pt-3">
        <EditDialog label={`＋ ${String(summary)}`} title={String(summary)} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">{children}</EditDialog>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 text-sm last:border-0">
      <span className="min-w-0 flex-1">{summary}</span>
      <EditDialog label={editLabel} title={title ?? ""}>{children}</EditDialog>
    </div>
  );
}
const KNOWN = ["invalid", "bad_dates", "name_required", "bad_milestones", "not_found", "forbidden", "generic"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [sp, t, actor, format] = await Promise.all([searchParams, getTranslations("settings"), requireRole("manager"), getFormatter()]);
  const s = await loadAdminSettings(db(), actor);
  const current = s.years.find((y) => y.isCurrent);
  const field = (label: string, node: React.ReactNode) => <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">{label}{node}</label>;
  const section = (id: string, title: string, body: React.ReactNode) => (
    <section id={id} className="scroll-mt-16 rounded-xl border border-border p-4"><h2 className="text-base font-semibold">{title}</h2>{sp.saved === id && <Flash tone="status" className="mt-2 rounded-lg border border-ok/50 p-2 text-sm text-ok-fg">{t("saved")}</Flash>}{body}</section>
  );
  return (
    <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <nav aria-label={t("title")} className="sticky top-0 z-10 -mx-4 mt-2 flex gap-1 overflow-x-auto border-b border-border bg-background px-4 py-2 text-sm">
        {(["general", "year", "programs", "rules", "lookups"] as const).map((id) => <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-card">{t(id)}</a>)}
      </nav>
      <div className="mt-4 flex flex-col gap-4">
      {sp.error && KNOWN.includes(sp.error) && <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{t(`errors.${sp.error}`)}</Flash>}

      {section("general", t("general"), (
        <form action={saveGeneralAction} className="mt-2 grid items-end gap-3 sm:grid-cols-[12rem_auto_auto]">
          {field(t("tolerance"), <input name="tolerance" title={t("toleranceHint")} type="number" step="0.25" min="0" max="24" defaultValue={s.tolerance} className={input} />)}
                    <MultiSelect name="languages" label={t("languages")} options={(["he", "en"] as const).map((l) => ({ value: l, label: t(`lang.${l}`) }))} defaultValue={s.languages} />
          <SubmitButton className={btn}>{t("save")}</SubmitButton>
        </form>
      ))}

      {section("year", t("year"), (
        <div className="mt-1 flex flex-col">
          {[...(current ? [current] : []), ...s.years.filter((y) => !y.isCurrent)].map((y) => (
            <Disclosure key={y.id} editLabel={t("edit")} title={y.name} summary={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><b>{y.name}</b><span className="text-muted">{formatDay(format, String(y.startDate))} – {formatDay(format, String(y.endDate))}</span>{y.isCurrent && <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info-fg">{t("currentBadge")}</span>}</span>}>
              <form action={saveYearAction} className={`${row} grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto]`}>
                <input type="hidden" name="id" value={y.id} />
                {field(t("yearName"), <input name="name" required defaultValue={y.name} className={input} />)}
                {field(t("reportDeadline"), <input name="reportDeadline" type="date" defaultValue={y.reportDeadline ?? ""} className={input} />)}
                {field(t("startDate"), <input name="startDate" type="date" required defaultValue={String(y.startDate)} className={input} />)}
                {field(t("endDate"), <input name="endDate" type="date" required defaultValue={String(y.endDate)} className={input} />)}
                <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" name="makeCurrent" defaultChecked={y.isCurrent} />{t("isCurrent")}</label>
                <SubmitButton className={btn}>{t("save")}</SubmitButton>
              </form>
            </Disclosure>
          ))}
          <Disclosure add summary={t("newYear")} editLabel="">
            <form action={saveYearAction} className={`${row} grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto]`}>
              {field(t("yearName"), <input name="name" required className={input} />)}
              {field(t("reportDeadline"), <input name="reportDeadline" type="date" className={input} />)}
              {field(t("startDate"), <input name="startDate" type="date" required className={input} />)}
              {field(t("endDate"), <input name="endDate" type="date" required className={input} />)}
              <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" name="makeCurrent" />{t("isCurrent")}</label>
              <SubmitButton className={btn}>{t("add")}</SubmitButton>
            </form>
          </Disclosure>
        </div>
      ))}

      {section("programs", t("programs"), (
        <div className="mt-1 flex flex-col">
          {s.programs.map((p) => (
            <Disclosure key={p.id} editLabel={t("edit")} title={p.name} summary={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><b>{p.name}</b><span className="text-muted">{Number(p.requiredHours)} {t("hoursUnit")}{p.maxHoursPerDay != null ? ` · ${t("maxHoursPerDay")}: ${Number(p.maxHoursPerDay)}` : ""}</span>{!p.isActive && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{t("inactiveBadge")}</span>}</span>}>
              <form action={saveProgramAction} className={`${row} grid-cols-2 lg:grid-cols-[1.5fr_.8fr_.8fr_auto_1.6fr_auto]`}>
                <input type="hidden" name="id" value={p.id} />
                {field(t("programName"), <input name="name" required defaultValue={p.name} className={input} />)}
                {field(t("requiredHours"), <input name="requiredHours" type="number" step="0.5" min="0" required defaultValue={Number(p.requiredHours)} className={input} />)}
                {field(t("maxHoursPerDay"), <input name="maxHoursPerDay" type="number" step="0.5" min="0" max="24" defaultValue={p.maxHoursPerDay != null ? Number(p.maxHoursPerDay) : ""} className={input} />)}
                <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" name="isActive" defaultChecked={p.isActive} />{t("active")}</label>
                <label className="col-span-2 flex flex-col gap-1 text-xs text-muted lg:col-span-1">{t("milestones")}<textarea name="milestones" rows={2} placeholder="45: פעימה 1" title={t("milestonesHint")} defaultValue={p.milestones.map((m) => `${m.hours}: ${m.label}`).join("\n")} className={input} /></label>
                <SubmitButton className={btn}>{t("save")}</SubmitButton>
              </form>
            </Disclosure>
          ))}
          <Disclosure add summary={t("newProgram")} editLabel="">
              <form action={saveProgramAction} className={`${row} grid-cols-2 lg:grid-cols-[1.5fr_.8fr_.8fr_auto_1.6fr_auto]`}>
                
                {field(t("programName"), <input name="name" required defaultValue={undefined} className={input} />)}
                {field(t("requiredHours"), <input name="requiredHours" type="number" step="0.5" min="0" required defaultValue={""} className={input} />)}
                {field(t("maxHoursPerDay"), <input name="maxHoursPerDay" type="number" step="0.5" min="0" max="24" defaultValue={""} className={input} />)}
                <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" name="isActive" defaultChecked={true} />{t("active")}</label>
                <label className="col-span-2 flex flex-col gap-1 text-xs text-muted lg:col-span-1">{t("milestones")}<textarea name="milestones" rows={2} placeholder="45: פעימה 1" title={t("milestonesHint")} defaultValue={""} className={input} /></label>
                <SubmitButton className={btn}>{t("add")}</SubmitButton>
              </form>
          </Disclosure>
        </div>
      ))}

      {section("rules", t("rules"), (
        <div className="mt-1 flex flex-col">
          {(Object.keys(s.rules) as RuleKind[]).map((k) => {
            const r = s.rules[k];
            const summary = !r.enabled ? t("ruleOff")
              : k === "coordinator_digest" ? t("ruleDigestSummary", { channels: r.channels.map((c) => t(`channel.${c}`)).join(", ") || "—" })
              : t("ruleSummary", { first: r.firstAfterDays, max: r.maxSends, channels: r.channels.map((c) => t(`channel.${c}`)).join(", ") || "—" });
            return (
              <Disclosure key={k} editLabel={t("edit")} title={t(`ruleKind.${k}`)} summary={<span className="flex flex-col gap-0.5"><b>{t(`ruleKind.${k}`)}</b><span className="text-muted">{summary}</span></span>}>
                <form action={saveRuleAction} className="grid grid-cols-3 content-start gap-x-3 gap-y-2">
                  <input type="hidden" name="kind" value={k} />
                  <p className="col-span-3 text-xs text-muted">{t(`ruleHint.${k}`)}</p>
                  <label className="col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={r.enabled} />{t("ruleEnabled")}</label>
                  {k !== "coordinator_digest" && <>
                    {field(t("firstAfterDays"), <input name="firstAfterDays" type="number" min="0" max="365" defaultValue={r.firstAfterDays} className={input} />)}
                    {field(t("maxSends"), <input name="maxSends" type="number" min="1" max="20" defaultValue={r.maxSends} className={input} />)}
                    {field(t("repeatEveryDays"), <input name="repeatEveryDays" type="number" min="1" max="365" defaultValue={r.repeatEveryDays} className={input} />)}
                  </>}
                  {k === "coordinator_digest" && <><input type="hidden" name="firstAfterDays" value={r.firstAfterDays} /><input type="hidden" name="maxSends" value={r.maxSends} /><input type="hidden" name="repeatEveryDays" value={r.repeatEveryDays} /></>}
                  <MultiSelect className="col-span-3" name="channels" label={t("channels")} options={(["email", "sms", "whatsapp"] as const).map((c) => ({ value: c, label: t(`channel.${c}`), hint: c === "email" ? undefined : t("comingSoon"), disabled: c !== "email" }))} defaultValue={r.channels} />
                  {k !== "coordinator_digest" && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="copyManager" defaultChecked={r.copyManager} />{t("copyManager")}</label>}
                  <SubmitButton className={btn}>{t("save")}</SubmitButton>
                </form>
              </Disclosure>
            );
          })}
        </div>
      ))}

      {section("lookups", t("lookups"), (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {LOOKUP_KINDS.map((kind) => {
            const list = s.lookups[kind];
            const lookupForm = (l?: (typeof list)[number]) => (
              <form action={saveLookupAction} className="flex flex-col gap-3">
                {l && <input type="hidden" name="id" value={l.id} />}<input type="hidden" name="kind" value={kind} />
                {field(t("labelHe"), <input name="labelHe" required defaultValue={l?.labelHe ?? ""} className={input} />)}
                {field(t("labelEn"), <input name="labelEn" defaultValue={l?.labelEn ?? ""} className={input} dir="ltr" />)}
                {l && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={l.isActive} />{t("active")}</label>}
                {l && <input type="hidden" name="sortOrder" value={l.sortOrder} />}
                <SubmitButton className={btn}>{l ? t("save") : t("add")}</SubmitButton>
              </form>
            );
            return (
              <div key={kind} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{t(`lookupKind.${kind}`)}</h3>
                  <EditDialog label={`＋ ${t("add")}`} title={`${t("add")}: ${t(`lookupKind.${kind}`)}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground md:min-h-9">{lookupForm()}</EditDialog>
                </div>
                <div className="mt-2 overflow-x-auto rounded-lg border border-hairline">
                  <table className={dt.table}>
                    <thead className={dt.head}><tr><Th>{t("labelHe")}</Th><Th className="hidden sm:table-cell">{t("labelEn")}</Th><Th>{t("statusCol")}</Th><th scope="col" className="px-3 py-2"><span className="sr-only">{t("edit")}</span></th></tr></thead>
                    <tbody className={dt.body}>
                      {list.map((l, i) => (
                        <tr key={l.id} className={l.isActive ? "" : "opacity-70"}>
                          <th scope="row" className={`${dt.td} text-start font-medium`}>{l.labelHe}</th>
                          <td className={`${dt.td} hidden sm:table-cell`} dir="ltr">{l.labelEn ?? "—"}</td>
                          <td className={dt.td}><span className={`rounded-full px-2 py-0.5 text-xs ${l.isActive ? "bg-ok-bg text-ok-fg" : "bg-paper text-ink-3"}`}>{l.isActive ? t("active") : t("inactiveBadge")}</span></td>
                          <td className={`${dt.actions} text-end`}>
                            <span className="inline-flex items-center gap-1">
                              {(["up", "down"] as const).map((dir) => (
                                <form key={dir} action={moveLookupAction}>
                                  <input type="hidden" name="id" value={l.id} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="dir" value={dir} />
                                  <button type="submit" disabled={dir === "up" ? i === 0 : i === list.length - 1} aria-label={`${t(dir === "up" ? "moveUp" : "moveDown")}: ${l.labelHe}`} className="grid size-11 place-items-center rounded-md border border-border hover:bg-paper disabled:opacity-30 md:size-8">{dir === "up" ? "↑" : "↓"}</button>
                                </form>
                              ))}
                              <EditDialog label={t("edit")} title={`${t("edit")}: ${l.labelHe}`}>{lookupForm(l)}</EditDialog>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      </div>
    </main>
  );
}
