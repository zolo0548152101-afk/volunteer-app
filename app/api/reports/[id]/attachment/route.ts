import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hourReports, users } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { getActor } from "@/lib/session";
import { readAttachment } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** המסמך המצורף לדיווח: רק הסטודנט עצמו, הרכז שלו והמנהל. אין כתובת ציבורית לקובץ */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [r] = await db().select({ attachment: hourReports.attachment, studentId: hourReports.studentId, coordinatorId: users.coordinatorId })
    .from(hourReports).innerJoin(users, eq(users.id, hourReports.studentId))
    .where(and(eq(hourReports.id, id), eq(hourReports.organizationId, actor.organizationId))).limit(1);
  const subject = r && { organizationId: actor.organizationId, ownerId: r.studentId, coordinatorIds: r.coordinatorId ? [r.coordinatorId] : [] };
  if (!r || !r.attachment || !subject || !can(actor, "read", "hour_report", subject)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = await readAttachment(r.attachment);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ext = r.attachment.split(".").pop();
  return new NextResponse(file.stream as BodyInit, {
    headers: {
      "content-type": file.mime,
      "content-disposition": `inline; filename="absence-document.${ext}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      // מסמך מצורף לא מריץ סקריפטים גם אם הוטמע בדף
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
