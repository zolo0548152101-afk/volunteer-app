import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, placements, users } from "@/lib/db/schema";
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
