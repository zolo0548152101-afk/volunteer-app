/**
 * שכבת השירות היחידה שכותבת ל-audit_log (PRD סעיף 3: מי, מה, מתי, ערך קודם וחדש).
 * כל שינוי ב-placements / hour_reports / users עובר דרך `audited` בתוך טרנזקציה,
 * כך שהשינוי והלוג נשמרים יחד או לא נשמרים בכלל.
 */
import type { Tx } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type AuditEntity =
  | "user"
  | "student_profile"
  | "placement"
  | "interview"
  | "hour_report"
  | "volunteer_place"
  | "place_time_window"
  | "setting"
  | "custom_field";

export type AuditContext = {
  organizationId: string;
  /** null = פעולת מערכת (cron, seed) */
  actorId: string | null;
};

export type AuditSpec = {
  entity: AuditEntity;
  entityId: string;
  /** למשל: create, update, approve, reject, unapprove, deactivate, delete, override */
  action: string;
  /** סיבה, חובה בביטול אישור ובאישור חריגה */
  reason?: string;
};

export async function writeAudit(
  tx: Tx,
  ctx: AuditContext,
  spec: AuditSpec,
  oldValue: unknown,
  newValue: unknown,
) {
  await tx.insert(auditLog).values({
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    entity: spec.entity,
    entityId: spec.entityId,
    action: spec.action,
    reason: spec.reason ?? null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
  });
}

/**
 * מריץ שינוי ורושם אותו. חייב לרוץ בתוך db.transaction.
 * @param before קורא את המצב הקודם (או undefined ביצירה)
 * @param change מבצע את השינוי ומחזיר את המצב החדש
 */
export async function audited<T>(
  tx: Tx,
  ctx: AuditContext,
  spec: AuditSpec,
  before: () => Promise<unknown>,
  change: () => Promise<T>,
): Promise<T> {
  const oldValue = await before();
  const result = await change();
  await writeAudit(tx, ctx, spec, oldValue, result);
  return result;
}
