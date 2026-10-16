/**
 * עבודות רקע (PRD 7.5): הסלמת דיווחים, סטודנט שלא מדווח, וסיכום יומי לרכז.
 * כל ההחלטות מגיעות מ-notification_rules (המנהל עורך) דרך nextSendDecision.
 * הרצה כפולה/מקבילה בטוחה: כל עבודה רצה בטרנזקציה עם נעילת advisory לפי ארגון וסוג,
 * והיומן נכתב מיד אחרי כל שליחה (מחוץ לטרנזקציה, כך שנקלט גם אם ההרצה נופלת אחר כך), כך שהרצה שנייה רואה את מה שכבר נשלח.
 * שליחה שנכשלה בכל הערוצים נרשמת ok=false ולא נספרת, ולכן תנוסה שוב בהרצה הבאה.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { hourReports, notificationLog, notificationRules, organizations, placements, studentProfiles, users } from "@/lib/db/schema";
import { notify, type Channel } from "@/lib/services/notify";
import { DEFAULT_RULES, nextSendDecision, type Rule, type RuleKind } from "@/lib/services/reminders";
import { isLocale } from "@/i18n/config";

const DAY = 86_400_000;
type Person = { id: string; email: string; phone: string | null; locale: string; name: string };

export async function loadRules(tx: Db | Tx, orgId: string): Promise<Record<RuleKind, Rule>> {
  const rows = await tx.select().from(notificationRules).where(eq(notificationRules.organizationId, orgId));
  const out = { ...DEFAULT_RULES };
  for (const r of rows) {
    if (r.kind in out) out[r.kind as RuleKind] = { enabled: r.enabled, firstAfterDays: r.firstAfterDays, maxSends: r.maxSends, repeatEveryDays: r.repeatEveryDays, channels: r.channels as Channel[], copyManager: r.copyManager };
  }
  return out;
}

const lock = (tx: Tx, key: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

async function managersOf(tx: Tx, orgId: string): Promise<Person[]> {
  const rows = await tx.select({ id: users.id, email: users.email, phone: users.phone, locale: users.locale, f: users.firstName, l: users.lastName }).from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.status, "active"), sql`'manager' = ANY(${users.roles})`));
  return rows.map((r) => ({ id: r.id, email: r.email, phone: r.phone, locale: r.locale, name: `${r.f} ${r.l}` }));
}

/** שולח בכל ערוצי הכלל. מחזיר אם לפחות ערוץ אחד הצליח, ואת השגיאה האחרונה */
async function deliver(p: Person, channels: Channel[], template: string, data: Record<string, unknown>) {
  let ok = false;
  let error: string | undefined;
  for (const channel of channels) {
    const to = channel === "email" ? p.email : p.phone;
    if (!to) { error = `no_${channel}_address`; continue; }
    const res = await notify({ channel, to, template, data, locale: isLocale(p.locale) ? p.locale : "he" });
    if (res.ok) ok = true; else error = res.error;
  }
  return { ok, error, channel: channels[0] ?? ("email" as Channel) };
}

async function logSend(tx: Db | Tx, orgId: string, kind: string, entityId: string, recipientId: string, r: { ok: boolean; error?: string; channel: Channel }, now: Date, entity = "hour_report") {
  // הקריאה מעבירה את ה-db (לא את הטרנזקציה): הרישום נקלט מיד, כך שכשל מאוחר בהרצה (אחרי שליחה שכבר יצאה) לא מוחק אותו והשליחה לא תחזור בהרצה הבאה.
  // הנעילה (advisory, ברמת הטרנזקציה) ממשיכה לחסום הרצה מקבילה
  // sentAt = זמן ההרצה (לא שעון המסד), כדי שהרצה מדומה בבדיקות ושעון אמיתי יתנהגו אותו דבר
  await tx.insert(notificationLog).values({ organizationId: orgId, kind, entity, entityId, recipientId, channel: r.channel, ok: r.ok, error: r.error ?? null, sentAt: now });
}

/** כמה שליחות מוצלחות כבר היו לכל רשומה מאז האירוע המפעיל, ומתי האחרונה */
async function sendStats(tx: Tx, orgId: string, kind: string, entityIds: string[], since: Map<string, Date>) {
  const out = new Map<string, { count: number; last: Date | null }>();
  if (entityIds.length === 0) return out;
  const rows = await tx.select({ entityId: notificationLog.entityId, sentAt: notificationLog.sentAt }).from(notificationLog)
    .where(and(eq(notificationLog.organizationId, orgId), eq(notificationLog.kind, kind), eq(notificationLog.ok, true), inArray(notificationLog.entityId, entityIds)));
  for (const r of rows) {
    if (r.sentAt < (since.get(r.entityId) ?? new Date(0))) continue;
    const cur = out.get(r.entityId) ?? { count: 0, last: null };
    cur.count++;
    if (!cur.last || r.sentAt > cur.last) cur.last = r.sentAt;
    out.set(r.entityId, cur);
  }
  return out;
}

export type CronSummary = { organizations: number; sent: number; failed: number };

/** הסלמת דיווחים שממתינים: לרכז של הסטודנט (אם אין, למנהלים), ועותק למנהלים לפי הכלל */
export type CronOpts = { now?: Date; organizationId?: string };

async function orgsOf(db: Db, o: CronOpts) {
  const q = db.select({ id: organizations.id }).from(organizations);
  return o.organizationId ? q.where(eq(organizations.id, o.organizationId)) : q;
}

export async function runEscalation(db: Db, opts: CronOpts = {}): Promise<CronSummary> {
  const now = opts.now ?? new Date();
  const orgs = await orgsOf(db, opts);
  const sum: CronSummary = { organizations: orgs.length, sent: 0, failed: 0 };
  for (const org of orgs) {
    await db.transaction(async (tx) => {
      await lock(tx, `cron:esc:${org.id}`);
      const rule = (await loadRules(tx, org.id)).report_escalation;
      if (!rule.enabled) return;
      const pending = await tx.select({ id: hourReports.id, submittedAt: hourReports.submittedAt, studentId: hourReports.studentId, sf: users.firstName, sl: users.lastName, coord: users.coordinatorId })
        .from(hourReports).innerJoin(users, eq(users.id, hourReports.studentId))
        .where(and(eq(hourReports.organizationId, org.id), eq(hourReports.status, "pending"), sql`${hourReports.submittedAt} <= ${new Date(now.getTime() - rule.firstAfterDays * DAY)}`));
      if (pending.length === 0) return;
      const stats = await sendStats(tx, org.id, "report_escalation", pending.map((p) => p.id), new Map(pending.map((p) => [p.id, p.submittedAt])));
      const managers = await managersOf(tx, org.id);
      const coordIds = [...new Set(pending.map((p) => p.coord).filter((x): x is string => !!x))];
      const coords = coordIds.length ? await tx.select({ id: users.id, email: users.email, phone: users.phone, locale: users.locale, f: users.firstName, l: users.lastName, status: users.status }).from(users).where(inArray(users.id, coordIds)) : [];
      const coordById = new Map(coords.filter((c) => c.status === "active").map((c) => [c.id, { id: c.id, email: c.email, phone: c.phone, locale: c.locale, name: `${c.f} ${c.l}` } satisfies Person]));
      for (const r of pending) {
        const st = stats.get(r.id) ?? { count: 0, last: null };
        if (!nextSendDecision({ rule, triggeredAt: r.submittedAt, sentCount: st.count, lastSentAt: st.last, now }).send) continue;
        const primary = (r.coord && coordById.get(r.coord)) || managers[0];
        if (!primary) continue;
        const data = { student: `${r.sf} ${r.sl}`, days: Math.floor((now.getTime() - r.submittedAt.getTime()) / DAY) };
        const res = await deliver(primary, rule.channels, "report.escalation", data);
        await logSend(db, org.id, "report_escalation", r.id, primary.id, res, now);
        if (res.ok) {
          sum.sent++;
          if (rule.copyManager) for (const m of managers.filter((m) => m.id !== primary.id)) {
            await logSend(db, org.id, "report_escalation_copy", r.id, m.id, await deliver(m, rule.channels, "report.escalation", data), now);
          }
        } else sum.failed++;
      }
    });
  }
  return sum;
}

/** סטודנט שלא דיווח, וסיכום יומי לרכז */
export async function runReminders(db: Db, opts: CronOpts = {}): Promise<CronSummary> {
  const now = opts.now ?? new Date();
  const orgs = await orgsOf(db, opts);
  const sum: CronSummary = { organizations: orgs.length, sent: 0, failed: 0 };
  for (const org of orgs) {
    await db.transaction(async (tx) => {
      await lock(tx, `cron:rem:${org.id}`);
      const rules = await loadRules(tx, org.id);
      const managers = await managersOf(tx, org.id);

      const inact = rules.student_inactivity;
      if (inact.enabled) {
        const rows = await tx.select({
          id: users.id, email: users.email, phone: users.phone, locale: users.locale, f: users.firstName, l: users.lastName,
          lastReport: sql<Date | null>`(SELECT max(submitted_at) FROM hour_reports r WHERE r.student_id = ${users.id})`,
          since: sql<Date>`(SELECT min(coalesce(p.started_at::timestamptz, p.created_at)) FROM placements p WHERE p.student_id = ${users.id} AND p.is_active)`,
        }).from(users).innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
          .where(and(eq(users.organizationId, org.id), eq(users.status, "active"), sql`EXISTS (SELECT 1 FROM ${placements} p WHERE p.student_id = ${users.id} AND p.is_active)`));
        const trig = new Map(rows.map((r) => {
          const a = r.lastReport ? new Date(r.lastReport) : null, b = new Date(r.since);
          return [r.id, a && a > b ? a : b] as const;
        }));
        const stats = await sendStats(tx, org.id, "student_inactivity", rows.map((r) => r.id), trig);
        for (const r of rows) {
          const triggeredAt = trig.get(r.id)!;
          const st = stats.get(r.id) ?? { count: 0, last: null };
          if (!nextSendDecision({ rule: inact, triggeredAt, sentCount: st.count, lastSentAt: st.last, now }).send) continue;
          const p: Person = { id: r.id, email: r.email, phone: r.phone, locale: r.locale, name: `${r.f} ${r.l}` };
          const data = { days: Math.floor((now.getTime() - triggeredAt.getTime()) / DAY) };
          const res = await deliver(p, inact.channels, "student.inactivity", data);
          await logSend(db, org.id, "student_inactivity", r.id, p.id, res, now, "user");
          if (res.ok) {
            sum.sent++;
            if (inact.copyManager) for (const m of managers) {
              await logSend(db, org.id, "student_inactivity_copy", r.id, m.id, await deliver(m, inact.channels, "student.inactivity", data), now, "user");
            }
          } else sum.failed++;
        }
      }

      const dig = rules.coordinator_digest;
      if (dig.enabled) {
        const counts = await tx.execute<{ id: string; email: string; phone: string | null; locale: string; first_name: string; last_name: string; n: number }>(sql`
          SELECT c.id, c.email, c.phone, c.locale, c.first_name, c.last_name, count(r.id)::int AS n
          FROM users c JOIN users s ON s.coordinator_id = c.id JOIN hour_reports r ON r.student_id = s.id AND r.status = 'pending'
          WHERE c.organization_id = ${org.id} AND c.status = 'active' GROUP BY c.id`);
        const recent = await tx.select({ entityId: notificationLog.entityId }).from(notificationLog)
          .where(and(eq(notificationLog.organizationId, org.id), eq(notificationLog.kind, "coordinator_digest"), eq(notificationLog.ok, true), gte(notificationLog.sentAt, new Date(now.getTime() - 20 * 3_600_000))));
        const done = new Set(recent.map((x) => x.entityId));
        for (const c of counts.rows) {
          if (done.has(c.id) || c.n === 0) continue;
          const p: Person = { id: c.id, email: c.email, phone: c.phone, locale: c.locale, name: `${c.first_name} ${c.last_name}` };
          const res = await deliver(p, dig.channels, "coordinator.digest", { count: c.n });
          await logSend(db, org.id, "coordinator_digest", c.id, c.id, res, now, "user");
          if (res.ok) sum.sent++; else sum.failed++;
        }
      }
    });
  }
  return sum;
}
