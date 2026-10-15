import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { interviews, placements, users } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";

// כשל באמצע הטרנזקציה: הרישום האחרון (finalize) זורק, אחרי שכבר הושבתו שיבוצים והופעלו חדשים
vi.mock("@/lib/services/audit", async (orig) => {
  const real = await orig<typeof import("@/lib/services/audit")>();
  return {
    ...real,
    writeAudit: async (...args: Parameters<typeof real.writeAudit>) => {
      if (args[2].entity === "interview" && args[2].action === "finalize") throw new Error("קרס באמצע");
      return real.writeAudit(...args);
    },
  };
});

const { finalizeInterview, saveDraft, startInterview } = await import("@/lib/services/interviews");

let s: Awaited<ReturnType<typeof seedDemo>>;
beforeAll(async () => { s = await seedDemo(db(), { orgName: `rollback ${Date.now()}` }); });
afterAll(async () => { await deleteOrganization(db(), s.organizationId); await closeDb(); });

it("כשל באמצע סגירה: שום דבר לא משתנה (שיבוצים, רכז, סטטוס ראיון, לוג)", async () => {
  const manager = { id: s.manager.id, organizationId: s.organizationId, roles: ["manager" as const] };
  const lian = s.students[4].id;
  const id = await startInterview(db(), manager, lian, "interview");
  await saveDraft(db(), manager, id, { lines: [{ timeWindowId: s.windows.youthTue.id, slots: 0.5, weeklyHours: 1, assignedDays: ["tue"] }] });
  await expect(finalizeInterview(db(), manager, id, { coordinatorId: s.coordinators[0].id, overrideReason: "בדיקה" })).rejects.toThrow("קרס באמצע");

  expect(await db().select().from(placements).where(and(eq(placements.studentId, lian), eq(placements.isActive, true)))).toHaveLength(0);
  const [u] = await db().select().from(users).where(eq(users.id, lian));
  expect(u.coordinatorId).toBeNull();
  const [iv] = await db().select().from(interviews).where(eq(interviews.id, id));
  expect(iv.status).toBe("draft");
  // הטיוטה שלמה וניתנת לסגירה אחרי התיקון
  expect(await db().select().from(placements).where(eq(placements.interviewId, id))).toHaveLength(1);
});

it("כשל באמצע סגירה של סטודנט משובץ: השיבוץ הישן נשאר פעיל", async () => {
  const manager = { id: s.manager.id, organizationId: s.organizationId, roles: ["manager" as const] };
  const shira = s.students[0].id;
  const id = await startInterview(db(), manager, shira, "reassignment");
  await saveDraft(db(), manager, id, { lines: [{ timeWindowId: s.windows.youthTue.id, slots: 1, weeklyHours: 3, assignedDays: ["tue"] }] });
  await expect(finalizeInterview(db(), manager, id, { overrideReason: "בדיקה" })).rejects.toThrow("קרס באמצע");
  const active = await db().select().from(placements).where(and(eq(placements.studentId, shira), eq(placements.isActive, true)));
  expect(active).toHaveLength(1);
  expect(active[0].timeWindowId).toBe(s.windows.eldersMorning.id);
});
