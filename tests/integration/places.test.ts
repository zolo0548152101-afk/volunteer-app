import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, placeTimeWindows } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { createPlace, createWindow, getPlace, listPlaces, PlaceError, setWindowActive, updatePlace, updateWindow, type StaffPlace } from "@/lib/services/places";
import { NotFoundError } from "@/lib/services/users";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
let other: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, coord: SessionUser, interviewer: SessionUser, student: SessionUser;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `מקומות ${Date.now()}` });
  other = await seedDemo(db(), { orgName: `מקומות אחר ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  coord = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  interviewer = act(s.interviewer, s.organizationId, ["interviewer"]);
  student = act(s.students[0], s.organizationId, ["student"]);
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  if (other) await deleteOrganization(db(), other.organizationId);
  await closeDb();
});

const staff = (p: unknown) => p as StaffPlace;

describe("תצוגות לפי תפקיד", () => {
  it("סטודנט: רק פרטים ציבוריים של מקומות פעילים, בלי קשר ובלי קיבולת", async () => {
    const list = await listPlaces(db(), student);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      for (const k of ["contactName", "contactPhone", "contactEmail", "notes", "requestedHours", "remainingHours", "activeStudents", "status"]) {
        expect(Object.keys(p)).not.toContain(k);
      }
    }
    const { windows } = await getPlace(db(), student, s.places.elders.id);
    expect(windows).toEqual([]);
  });

  it("רכז ומראיין רואים תפוסה מחושבת; מנהל גם", async () => {
    for (const a of [coord, interviewer, manager]) {
      const p = staff((await listPlaces(db(), a)).find((x) => x.id === s.places.elders.id));
      expect(p.requestedHours).toBeGreaterThan(0);
      expect(p.approvedHoursThisYear).toBe(8);
      expect(p.activeStudents).toBeGreaterThan(0);
    }
  });

  it("כרטיס מקום: חלונות עם תפוסה כמו בחישוב הקיבולת", async () => {
    const { windows } = await getPlace(db(), manager, s.places.elders.id);
    const morning = windows.find((w) => w.id === s.windows.eldersMorning.id)!;
    expect(morning).toMatchObject({ requestedHours: 8, allocatedSlots: 1, remainingSlots: 1, remainingHours: 4 });
  });

  it("מקום מארגון אחר: לא נמצא", async () => {
    await expect(getPlace(db(), manager, other.places.elders.id)).rejects.toBeInstanceOf(NotFoundError);
    const list = await listPlaces(db(), manager);
    expect(list.every((p) => ![...Object.values(other.places)].some((o) => o.id === p.id))).toBe(true);
  });
});

describe("ניהול (מנהל בלבד)", () => {
  it("רכז, מראיין וסטודנט נחסמים מכל כתיבה", async () => {
    for (const a of [coord, interviewer, student]) {
      await expect(createPlace(db(), a, { name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updatePlace(db(), a, s.places.elders.id, { name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createWindow(db(), a, s.places.elders.id, { label: "x", days: [], hoursPerSlot: 1, slots: 1 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateWindow(db(), a, s.windows.eldersMorning.id, { label: "x", days: [], hoursPerSlot: 4, slots: 2 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setWindowActive(db(), a, s.windows.eldersMorning.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("יצירת מקום וחלון, ולוג", async () => {
    const id = await createPlace(db(), manager, { name: "  גן חדש  ", city: "חיפה", contactPhone: "050-0000000" });
    const wid = await createWindow(db(), manager, id, { label: "ראשון בוקר", days: ["sun"], startTime: "08:00", endTime: "12:00", hoursPerSlot: 4, slots: 1.5 });
    const { place, windows } = await getPlace(db(), manager, id);
    expect(place.name).toBe("גן חדש");
    expect(windows[0]).toMatchObject({ id: wid, requestedHours: 6, remainingSlots: 1.5, allocatedSlots: 0 });
    const log = await db().select().from(auditLog).where(eq(auditLog.entityId, wid));
    expect(log.map((l) => l.action)).toContain("create");
  });

  it("נתונים לא תקינים נדחים", async () => {
    await expect(createPlace(db(), manager, { name: "   " })).rejects.toMatchObject({ code: "name_required" });
    for (const bad of [{ hoursPerSlot: 0, slots: 1 }, { hoursPerSlot: 3, slots: -1 }, { hoursPerSlot: NaN, slots: 1 }]) {
      await expect(createWindow(db(), manager, s.places.elders.id, { label: "x", days: [], ...bad })).rejects.toBeInstanceOf(PlaceError);
    }
  });

  it("אי אפשר להוריד תקנים או שעות מתחת למשובץ", async () => {
    // בוקר בבית האבות: שירה משובצת (1 תקן, 4 ש')
    const w = s.windows.eldersMorning;
    await expect(updateWindow(db(), manager, w.id, { label: "בוקר", days: ["sun"], hoursPerSlot: 4, slots: 0.5 })).rejects.toMatchObject({ code: "below_allocated" });
    await expect(updateWindow(db(), manager, w.id, { label: "בוקר", days: ["sun"], hoursPerSlot: 1, slots: 2 })).rejects.toMatchObject({ code: "below_allocated" });
    await updateWindow(db(), manager, w.id, { label: "בוקר", days: ["sun"], hoursPerSlot: 4, slots: 3 });
    const [row] = await db().select().from(placeTimeWindows).where(eq(placeTimeWindows.id, w.id));
    expect(row.slots).toBe(3);
  });

  it("חלון עם שיבוצים פעילים לא יוצא משימוש; חלון ריק כן, וההיסטוריה נשמרת", async () => {
    await expect(setWindowActive(db(), manager, s.windows.eldersMorning.id, false)).rejects.toMatchObject({ code: "has_active_placements" });
    const id = await createPlace(db(), manager, { name: "זמני" });
    const wid = await createWindow(db(), manager, id, { label: "א", days: [], hoursPerSlot: 1, slots: 1 });
    await setWindowActive(db(), manager, wid, false);
    const [row] = await db().select().from(placeTimeWindows).where(eq(placeTimeWindows.id, wid));
    expect(row.isActive).toBe(false);
    await setWindowActive(db(), manager, wid, true);
  });

  it("סגירת מקום עם שיבוצים פעילים נחסמת", async () => {
    await expect(updatePlace(db(), manager, s.places.elders.id, { name: "בית אבות", status: "closed" })).rejects.toMatchObject({ code: "has_active_placements" });
    await updatePlace(db(), manager, s.places.elders.id, { name: "בית אבות", status: "paused" });
  });

  it("מקום שהושהה נעלם לסטודנט", async () => {
    const list = await listPlaces(db(), student);
    expect(list.find((p) => p.id === s.places.elders.id)).toBeUndefined();
    await expect(getPlace(db(), student, s.places.elders.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
