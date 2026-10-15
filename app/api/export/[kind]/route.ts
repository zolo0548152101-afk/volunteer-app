import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { reportToXlsx } from "@/lib/export/xlsx";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { getActor } from "@/lib/session";
import { buildReport, REPORT_KINDS, type ReportKind } from "@/lib/services/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  try {
    const table = await buildReport(db(), actor, kind as ReportKind, { month: url.searchParams.get("month") ?? undefined, coordinatorId: url.searchParams.get("coordinatorId") ?? undefined });
    const t = await getTranslations("analytics");
    const enumKeys = ["yes", "no", "reserve_duty", "illness", "security_situation", "other", "pending", "approved", "rejected", "needs_correction"];
    const buf = await reportToXlsx(table, {
      title: t(`kinds.${kind}`),
      header: (k) => (k.startsWith("cf:") ? k.slice(3) : t(`columns.${k}`)),
      cell: (_k, v) => (typeof v === "string" && enumKeys.includes(v) ? t(`values.${v}`) : v),
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
