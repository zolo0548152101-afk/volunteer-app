import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { buildReport, REPORT_KINDS, type Cell, type Column, type ReportKind } from "@/lib/services/analytics";
import { listUsers } from "@/lib/services/users";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ month?: string; coordinatorId?: string }> }) {
  const [{ kind }, sp, t, actor] = await Promise.all([params, searchParams, getTranslations("analytics"), requireActor()]);
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) notFound();
  let table;
  try { table = await buildReport(db(), actor, kind as ReportKind, { month: sp.month, coordinatorId: sp.coordinatorId }); } catch (e) { if (e instanceof ForbiddenError) redirect("/"); throw e; }
  const isManager = actor.roles.includes("manager");
  const coordinators = isManager ? (await listUsers(db(), actor, { role: "coordinator" })) : [];
  const enumKeys = ["yes", "no", "reserve_duty", "illness", "security_situation", "other", "pending", "approved", "rejected", "needs_correction"];
  const fmt = (c: Column, v: Cell) => {
    if (v === null || v === undefined) return "—";
    if (c.type === "percent") return `${v}%`;
    if (typeof v === "string" && enumKeys.includes(v)) return t(`values.${v}`);
    return String(v);
  };
  const qs = new URLSearchParams(Object.entries({ month: sp.month ?? "", coordinatorId: isManager ? sp.coordinatorId ?? "" : "" }).filter(([, v]) => v)).toString();
  const input = "rounded-lg border border-border bg-background px-3 py-2";
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <p><Link href="/analytics" className="underline">{t("back")}</Link></p>
      <h1 className="mt-2 text-xl font-semibold">{t(`kinds.${kind}`)}</h1>
      {table.yearName && <p className="text-sm text-muted">{t("year", { name: table.yearName })}</p>}
      <form className="mt-3 flex flex-wrap items-end gap-3 text-sm" method="get">
        {kind !== "months" && kind !== "milestones" ? (
          <label className="flex flex-col gap-1">{t("month")}<input name="month" type="month" defaultValue={sp.month ?? ""} className={input} /></label>
        ) : null}
        {isManager && kind !== "coordinators" && (
          <label className="flex flex-col gap-1">{t("coordinator")}
            <select name="coordinatorId" defaultValue={sp.coordinatorId ?? ""} className={input}><option value="">{t("allCoordinators")}</option>{coordinators.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select>
          </label>
        )}
        <button type="submit" className="rounded-lg border border-border px-3 py-2">{t("filter")}</button>
        <a href={`/api/export/${kind}${qs ? `?${qs}` : ""}`} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">{t("exportExcel")}</a>
      </form>
      {table.rows.length === 0 ? <p className="mt-4 text-muted">{t("noRows")}</p> : (
        <div className="mt-4 overflow-x-auto" role="region" aria-label={t(`kinds.${kind}`)} tabIndex={0}>
          <table className="w-full text-sm">
            <thead><tr>{table.columns.map((c) => <th key={c.key} scope="col" className="border-b border-border px-2 py-2 text-start font-medium">{c.key.startsWith("cf:") ? c.key.slice(3) : t(`columns.${c.key}`)}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  {table.columns.map((c, j) => (j === 0
                    ? <th key={c.key} scope="row" className="px-2 py-2 text-start font-normal">{r.studentId && c.key === "student" ? <Link className="underline" href={`/students/${r.studentId}`}>{String(r[c.key])}</Link> : fmt(c, r[c.key])}</th>
                    : <td key={c.key} className="px-2 py-2">{fmt(c, r[c.key])}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
