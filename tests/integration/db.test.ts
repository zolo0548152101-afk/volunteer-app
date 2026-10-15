import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, notificationLog, notificationRules, placements, settings, users } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { approvedHoursCurrentYearByPlace, loadActivePlacements, loadWindows, windowUsageRows } from "@/lib/db/queries/capacity";
import { audited } from "@/lib/services/audit";
import { evaluateContract, windowUsage } from "@/lib/services/capacity";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `בדיקת אינטגרציה ${Date.now()}` });
});

afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

describe("seed", () => {
  it("יוצר את הנתונים לפי התוכנית: מנהל, 2 רכזים, מראיין, 6 סטודנטים, 4 מקומות", async () => {
    const [{ n }] = await db().execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM users WHERE organization_id = ${s.organizationId}`,
    ).then((r) => r.rows);
    expect(Number(n)).toBe(10);
    expect(Object.keys(s.places)).toHaveLength(4);
    expect(s.students).toHaveLength(6);
    expect(s.coordinators).toHaveLength(2);
  });

  it("כל שיבוץ שנוצר נרשם בלוג", async () => {
    const rows = await db().select().from(auditLog).where(eq(auditLog.organizationId, s.organizationId));
    expect(rows.filter((r) => r.entity === "placement" && r.action === "create")).toHaveLength(6);
  });
});

describe("קיבולת מחושבת, לא שמורה", () => {
  it("אין בסכמה אף עמודה של קיבולת מחושבת", async () => {
    const r = await db().execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('allocated_slots','allocated_hours_weekly','remaining_hours_weekly',
                            'requested_hours_weekly','approved_hours_current_year')`);
    expect(r.rows).toEqual([]);
  });

  it("שיבוץ לא פעיל (היסטוריה) לא תופס מקום; שברים מחושבים נכון", async () => {
    const usage = await windowUsageRows(db(), s.organizationId);
    const by = Object.fromEntries(usage.map((u) => [u.windowId, u]));
    // בוקר בבית האבות: 2 תקנים, שירה 1 פעיל; ההיסטוריה של איתי לא נספרת
    expect(by[s.windows.eldersMorning.id]).toMatchObject({ requestedHours: 8, allocatedSlots: 1, remainingSlots: 1, remainingHours: 4 });
    // ערב ה׳: 1.5 תקנים × 3, עומר 0.5 = 1.5 שעות
    expect(by[s.windows.eldersThu.id]).toMatchObject({ requestedHours: 4.5, allocatedSlots: 0.5, remainingSlots: 1, remainingHours: 3 });
    // חצי תקן במרפאה תפוס במלואו על ידי מאיה
    expect(by[s.windows.clinicHalf.id]).toMatchObject({ requestedHours: 2, allocatedSlots: 0.5, remainingSlots: 0, remainingHours: 0 });
  });

  it("שאילתת ה-SQL נותנת בדיוק אותה תוצאה כשירות הטהור, לכל חלון", async () => {
    const windows = await loadWindows(db(), s.organizationId);
    const active = await loadActivePlacements(db(), s.organizationId, windows.map((w) => w.id));
    const sqlRows = await windowUsageRows(db(), s.organizationId);
    for (const w of windows) {
      const pure = windowUsage(w, active);
      const row = sqlRows.find((r) => r.windowId === w.id)!;
      expect(row).toMatchObject({
        requestedHours: pure.requestedHours,
        allocatedSlots: pure.allocatedSlots,
        allocatedHours: pure.allocatedHours,
        remainingSlots: pure.remainingSlots,
        remainingHours: pure.remainingHours,
      });
    }
  });

  it("חוזה חדש מול נתוני אמת: חריגה מהחלון נחסמת, חוזה חוקי עובר", async () => {
    const windows = await loadWindows(db(), s.organizationId);
    const active = await loadActivePlacements(db(), s.organizationId, windows.map((w) => w.id));
    const student = s.students[4]; // ליאן, ממתינה לראיון
    const tooMuch = evaluateContract({
      studentId: student.id,
      proposed: [{ timeWindowId: s.windows.clinicHalf.id, slots: 0.25, weeklyHours: 1 }],
      windows,
      activePlacements: active,
    });
    expect(tooMuch.blocked).toBe(true); // חצי התקן במרפאה תפוס
    const ok = evaluateContract({
      studentId: student.id,
      proposed: [{ timeWindowId: s.windows.youthTue.id, slots: 1, weeklyHours: 3 }],
      windows,
      activePlacements: active,
    });
    expect(ok.blocked).toBe(false);
  });

  it("שעות מאושרות השנה במקום: רק approved, והיעדרות נספרת רק אם סומנה", async () => {
    const m = await approvedHoursCurrentYearByPlace(db(), s.organizationId);
    expect(m.get(s.places.elders.id)).toBe(8); // 4 דיווח + 4 היעדרות נספרת. הממתין לא נספר
    expect(m.get(s.places.kindergarten.id)).toBe(2.5);
    expect(m.get(s.places.clinic.id)).toBe(0);
  });
});

describe("אילוצים במסד", () => {
  it("אותו חלון פעמיים באותו סטודנט (שיבוצים פעילים) נחסם", async () => {
    const [existing] = await db().select().from(placements).where(eq(placements.studentId, s.students[0].id)).limit(1);
    const { id: _id, createdAt: _c, ...copy } = existing;
    void _id; void _c;
    await expect(db().insert(placements).values({ ...copy, isActive: true })).rejects.toThrow();
  });

  it("שיבוץ בלי תקנים נחסם (check)", async () => {
    const [existing] = await db().select().from(placements).where(eq(placements.studentId, s.students[2].id)).limit(1);
    const { id: _id, createdAt: _c, ...copy } = existing;
    void _id; void _c;
    await expect(
      db().insert(placements).values({ ...copy, slots: 0, isActive: false }),
    ).rejects.toThrow();
  });

  it("אימייל ייחודי בארגון, בלי תלות באותיות גדולות", async () => {
    await expect(
      db().insert(users).values({
        organizationId: s.organizationId,
        email: s.manager.email.toUpperCase(),
        firstName: "כפול",
        lastName: "כפול",
      }),
    ).rejects.toThrow();
  });
});

describe("הגדרות והתראות ניתנות לניהול", () => {
  it("ל-seed יש חוקי ברירת מחדל והגדרת סף, וכולם ניתנים לעדכון", async () => {
    const rules = await db().select().from(notificationRules).where(eq(notificationRules.organizationId, s.organizationId));
    expect(rules.map((r) => r.kind).sort()).toEqual(["coordinator_digest", "report_escalation", "student_inactivity"]);
    const esc = rules.find((r) => r.kind === "report_escalation")!;
    expect(esc).toMatchObject({ enabled: true, firstAfterDays: 7, maxSends: 1 });

    await db().update(notificationRules).set({ enabled: false, firstAfterDays: 3, maxSends: 4, repeatEveryDays: 2 }).where(eq(notificationRules.id, esc.id));
    const [after] = await db().select().from(notificationRules).where(eq(notificationRules.id, esc.id));
    expect(after).toMatchObject({ enabled: false, firstAfterDays: 3, maxSends: 4, repeatEveryDays: 2 });

    const [st] = await db().select().from(settings).where(eq(settings.organizationId, s.organizationId));
    expect(st.capacityToleranceHours).toBe(1);
    await db().update(settings).set({ capacityToleranceHours: 0.5 }).where(eq(settings.organizationId, s.organizationId));
    const [st2] = await db().select().from(settings).where(eq(settings.organizationId, s.organizationId));
    expect(st2.capacityToleranceHours).toBe(0.5);
  });

  it("ערכים לא הגיוניים נדחים במסד (מקסימום 0, ימים שליליים)", async () => {
    await expect(
      db().update(notificationRules).set({ maxSends: 0 }).where(eq(notificationRules.organizationId, s.organizationId)),
    ).rejects.toThrow();
    await expect(
      db().update(notificationRules).set({ firstAfterDays: -1 }).where(eq(notificationRules.organizationId, s.organizationId)),
    ).rejects.toThrow();
  });

  it("יומן שליחות נספר לפי רשומה: אפשר לדעת כמה פעמים נשלח ומתי אחרון", async () => {
    const reportId = s.students[0].id; // כל uuid משמש כמזהה רשומה ביומן
    await db().insert(notificationLog).values([
      { organizationId: s.organizationId, kind: "report_escalation", entity: "hour_report", entityId: reportId, channel: "email", sentAt: new Date("2026-10-08T08:00:00Z") },
      { organizationId: s.organizationId, kind: "report_escalation", entity: "hour_report", entityId: reportId, channel: "email", ok: false, error: "boom", sentAt: new Date("2026-10-09T08:00:00Z") },
    ]);
    const r = await db().execute<{ n: string; last: string }>(sql`
      SELECT count(*) AS n, max(sent_at) AS last FROM notification_log
      WHERE organization_id = ${s.organizationId} AND kind = 'report_escalation' AND entity_id = ${reportId} AND ok`);
    expect(Number(r.rows[0].n)).toBe(1); // רק שליחות שהצליחו נספרות
  });
});

describe("audit + טרנזקציה", () => {
  it("שינוי ולוג נשמרים יחד", async () => {
    const p = (await db().select().from(placements).where(eq(placements.studentId, s.students[3].id)))[0];
    await db().transaction(async (tx) => {
      await audited(
        tx,
        { organizationId: s.organizationId, actorId: s.manager.id },
        { entity: "placement", entityId: p.id, action: "update" },
        async () => ({ weeklyHours: p.weeklyHours }),
        async () => {
          await tx.update(placements).set({ weeklyHours: 1 }).where(eq(placements.id, p.id));
          return { weeklyHours: 1 };
        },
      );
    });
    const log = await db().select().from(auditLog).where(eq(auditLog.entityId, p.id));
    const upd = log.find((l) => l.action === "update")!;
    expect(upd.oldValue).toEqual({ weeklyHours: 1.5 });
    expect(upd.newValue).toEqual({ weeklyHours: 1 });
    expect(upd.actorId).toBe(s.manager.id);
  });

  it("כשל באמצע טרנזקציה: לא השינוי ולא הלוג נשמרים", async () => {
    const p = (await db().select().from(placements).where(eq(placements.studentId, s.students[0].id)))[0];
    const logsBefore = (await db().select().from(auditLog).where(eq(auditLog.entityId, p.id))).length;
    await expect(
      db().transaction(async (tx) => {
        await audited(
          tx,
          { organizationId: s.organizationId, actorId: s.manager.id },
          { entity: "placement", entityId: p.id, action: "deactivate" },
          async () => ({ isActive: true }),
          async () => {
            await tx.update(placements).set({ isActive: false }).where(eq(placements.id, p.id));
            return { isActive: false };
          },
        );
        throw new Error("קרס באמצע");
      }),
    ).rejects.toThrow("קרס באמצע");
    const [after] = await db().select().from(placements).where(eq(placements.id, p.id));
    expect(after.isActive).toBe(true);
    const logsAfter = (await db().select().from(auditLog).where(eq(auditLog.entityId, p.id))).length;
    expect(logsAfter).toBe(logsBefore);
  });
});

describe("טוקנים חד-פעמיים", () => {
  it("קישור: עובד פעם אחת, אחר כך 'used'; הערך לא נשמר ב-DB", async () => {
    const { issueToken, consumeToken } = await import("@/lib/services/tokens");
    const u = s.students[0];
    const raw = await issueToken(db(), { organizationId: s.organizationId, userId: u.id, kind: "password_reset" });
    const rows = await db().execute<{ token_hash: string }>(sql`SELECT token_hash FROM auth_tokens WHERE user_id = ${u.id}`);
    expect(rows.rows.some((r) => r.token_hash === raw)).toBe(false);
    expect(await consumeToken(db(), { kind: "password_reset", raw })).toMatchObject({ ok: true, userId: u.id });
    expect(await consumeToken(db(), { kind: "password_reset", raw })).toEqual({ ok: false, reason: "used" });
    expect(await consumeToken(db(), { kind: "invite", raw })).toEqual({ ok: false, reason: "invalid" });
  });

  it("הנפקה חדשה מבטלת את הקודמת; פג תוקף נדחה", async () => {
    const { issueToken, consumeToken } = await import("@/lib/services/tokens");
    const u = s.students[1];
    const first = await issueToken(db(), { organizationId: s.organizationId, userId: u.id, kind: "invite" });
    const second = await issueToken(db(), { organizationId: s.organizationId, userId: u.id, kind: "invite" });
    expect((await consumeToken(db(), { kind: "invite", raw: first })).ok).toBe(false);
    const later = new Date(Date.now() + 8 * 24 * 3600_000);
    expect(await consumeToken(db(), { kind: "invite", raw: second, now: later })).toEqual({ ok: false, reason: "expired" });
  });

  it("קוד SMS: ניסיונות שגויים נספרים וננעלים, גם לקוד הנכון", async () => {
    const { issueToken, consumeToken } = await import("@/lib/services/tokens");
    const u = s.students[2];
    const code = await issueToken(db(), { organizationId: s.organizationId, userId: u.id, kind: "otp" });
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await consumeToken(db(), { kind: "otp", raw: wrong, userId: u.id })).ok).toBe(false);
    expect(await consumeToken(db(), { kind: "otp", raw: code, userId: u.id })).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("קוד SMS נכון עובד פעם אחת, ורק למשתמש שלו", async () => {
    const { issueToken, consumeToken } = await import("@/lib/services/tokens");
    const u = s.students[3];
    const code = await issueToken(db(), { organizationId: s.organizationId, userId: u.id, kind: "otp" });
    expect((await consumeToken(db(), { kind: "otp", raw: code, userId: s.students[4].id })).ok).toBe(false);
    expect((await consumeToken(db(), { kind: "otp", raw: code, userId: u.id })).ok).toBe(true);
    expect((await consumeToken(db(), { kind: "otp", raw: code, userId: u.id })).ok).toBe(false);
  });
});
