import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { buildReport, REPORT_KINDS, type Cell, type Column, type ReportKind } from "@/lib/services/analytics";
import { listUsers } from "@/lib/services/users";
import { ListView } from "@/components/list-view";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { dt, Th } from "@/components/data-table";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ month?: string; coordinatorId?: string }> }) {
  const [{ kind }, sp, t, actor, format] = await Promise.all([params, searchParams, getTranslations("analytics"), requireActor(), getFormatter()]);
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
  const monthOptions = (() => {
    const now = new Date(); const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 18; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); out.push({ value: d.toISOString().slice(0, 7), label: format.dateTime(d, { month: "long", year: "numeric", timeZone: "UTC" }) }); }
    if (sp.month && !out.some((o) => o.value === sp.month)) out.push({ value: sp.month, label: sp.month });
    return out;
  })();
  const fields = [
    ...(kind !== "months" && kind !== "milestones" ? [{ name: "month", label: t("month"), value: sp.month, options: monthOptions }] : []),
    ...(isManager && kind !== "coordinators" ? [{ name: "coordinatorId", label: t("coordinator"), value: sp.coordinatorId, options: coordinators.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })) }] : []),
  ];
  const sortKind = (c: Column) => (c.type === "text" || c.type === "date" ? "text" : "num");
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <PageHeader crumbs={[{ label: t("dashboardTitle"), href: "/analytics" }]} current={t(`kinds.${kind}`)} />
      <h1 className="text-xl font-semibold">{t(`kinds.${kind}`)}</h1>
      {table.yearName && <p className="text-sm text-muted">{t("year", { name: table.yearName })}</p>}
      <p className="mt-3"><a href={`/api/export/${kind}${qs ? `?${qs}` : ""}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground md:min-h-10">{t("exportExcel")}</a></p>
      {table.rows.length === 0 ? <p className="mt-4 text-muted">{t("noRows")}</p> : (
        <ListView storageKey={`report-${kind}`} placeholder={t("searchPlaceholder")}
          toolbar={fields.length > 0 ? <FilterBar action={`/analytics/${kind}`} keep={{}} fields={fields} labels={{ filter: t("filter"), title: t("filterTitle"), all: t("allValues"), apply: t("apply"), clear: t("clearFilters"), remove: t("removeFilter") }} /> : undefined}
          table={(
          <table className={dt.table}>
            <thead className={dt.head}><tr>{table.columns.map((c) => <Th key={c.key} sort={sortKind(c)} num={sortKind(c) === "num"}>{c.key.startsWith("cf:") ? c.key.slice(3) : t(`columns.${c.key}`)}</Th>)}</tr></thead>
            <tbody className={dt.body}>
              {table.rows.map((r, i) => (
                <tr key={i} data-search={table.columns.map((c) => fmt(c, r[c.key])).join(" ")}>
                  {table.columns.map((c, j) => (j === 0
                    ? <th key={c.key} scope="row" className={`${dt.td} text-start font-normal`}>{r.studentId && c.key === "student" ? <Link className="underline" href={`/students/${r.studentId}`}>{String(r[c.key])}</Link> : fmt(c, r[c.key])}</th>
                    : <td key={c.key} data-v={r[c.key] ?? ""} className={sortKind(c) === "num" ? dt.num : dt.td}>{fmt(c, r[c.key])}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        )} />
      )}
    </main>
  );
}
