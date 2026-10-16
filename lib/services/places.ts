/**
 * מקומות התנדבות וחלונות זמן (PRD 5.5, 5.6).
 * תפוסה, יתרה ושעות מאושרות מחושבות משיבוצים פעילים, אף פעם לא נשמרות.
 * הגבלות שדה: סטודנט רואה רק פרטי מקום ציבוריים, בלי קיבולת ובלי אנשי קשר.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { placeTimeWindows, placements, volunteerPlaces } from "@/lib/db/schema";
import { approvedHoursCurrentYearByPlace, windowUsageRows, type WindowUsageRow } from "@/lib/db/queries/capacity";
import { assertCan, can, type SessionUser } from "@/lib/permissions";
import { audited } from "@/lib/services/audit";
import { NotFoundError } from "@/lib/services/users";
import { round2 } from "@/lib/services/capacity";
import { clean } from "./_util";

export class PlaceError extends Error {
  constructor(public code: "name_required" | "bad_numbers" | "below_allocated" | "has_active_placements") {
    super(code);
    this.name = "PlaceError";
  }
}

export type PlaceStatus = "active" | "paused" | "closed";
export type Day = "sun" | "mon" | "tue" | "wed" | "thu" | "fri";
export const DAYS: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri"];

/** מה סטודנט רואה: אין איש קשר, הערות פנימיות או קיבולת */
export type PublicPlace = { id: string; name: string; description: string | null; address: string | null; city: string | null; category: string | null };

export type WindowView = {
  id: string; label: string; days: Day[]; startTime: string | null; endTime: string | null;
  hoursPerSlot: number; slots: number; taskDescription: string | null; isActive: boolean;
} & Pick<WindowUsageRow, "requestedHours" | "allocatedSlots" | "allocatedHours" | "remainingSlots" | "remainingHours">;

export type StaffPlace = PublicPlace & {
  contactName: string | null; contactPhone: string | null; contactEmail: string | null; status: PlaceStatus; notes: string | null;
  requestedHours: number; allocatedHours: number; remainingHours: number; activeStudents: number; approvedHoursThisYear: number;
};

const placeCols = {
  id: volunteerPlaces.id, name: volunteerPlaces.name, description: volunteerPlaces.description, address: volunteerPlaces.address,
  city: volunteerPlaces.city, category: volunteerPlaces.category, contactName: volunteerPlaces.contactName,
  contactPhone: volunteerPlaces.contactPhone, contactEmail: volunteerPlaces.contactEmail, status: volunteerPlaces.status, notes: volunteerPlaces.notes,
};

const canSeeCapacity = (a: SessionUser) => can(a, "read", "time_window");

/** רשימת מקומות. סטודנט: ציבורי בלבד ורק פעילים. צוות: הכל כולל תפוסה. */
export async function listPlaces(db: Db, actor: SessionUser): Promise<(PublicPlace | StaffPlace)[]> {
  assertCan(actor, "read", "place");
  const rows = await db.select(placeCols).from(volunteerPlaces)
    .where(eq(volunteerPlaces.organizationId, actor.organizationId)).orderBy(asc(volunteerPlaces.name));
  if (!canSeeCapacity(actor)) {
    return rows.filter((r) => r.status === "active")
      .map(({ id, name, description, address, city, category }) => ({ id, name, description, address, city, category }));
  }
  const [usage, approved, students] = await Promise.all([
    windowUsageRows(db, actor.organizationId),
    approvedHoursCurrentYearByPlace(db, actor.organizationId),
    activeStudentsByPlace(db, actor.organizationId),
  ]);
  return rows.map((r) => {
    const u = usage.filter((x) => x.placeId === r.id);
    const sum = (k: "requestedHours" | "allocatedHours" | "remainingHours") => round2(u.reduce((s, x) => s + x[k], 0));
    return { ...r, requestedHours: sum("requestedHours"), allocatedHours: sum("allocatedHours"), remainingHours: sum("remainingHours"),
      activeStudents: students.get(r.id) ?? 0, approvedHoursThisYear: approved.get(r.id) ?? 0 };
  });
}

async function activeStudentsByPlace(db: Db, organizationId: string) {
  const rows = await db.select({ placeId: placements.placeId, n: sql<number>`count(distinct ${placements.studentId})::int` })
    .from(placements).where(and(eq(placements.organizationId, organizationId), eq(placements.isActive, true))).groupBy(placements.placeId);
  return new Map(rows.map((r) => [r.placeId, r.n]));
}

/** כרטיס מקום. סטודנט מקבל רק את הציבורי (ופעיל). */
export async function getPlace(db: Db, actor: SessionUser, id: string): Promise<{ place: PublicPlace | StaffPlace; windows: WindowView[] }> {
  assertCan(actor, "read", "place");
  const [r] = await db.select(placeCols).from(volunteerPlaces)
    .where(and(eq(volunteerPlaces.id, id), eq(volunteerPlaces.organizationId, actor.organizationId))).limit(1);
  if (!r) throw new NotFoundError();
  if (!canSeeCapacity(actor)) {
    if (r.status !== "active") throw new NotFoundError();
    const { id: pid, name, description, address, city, category } = r;
    return { place: { id: pid, name, description, address, city, category }, windows: [] };
  }
  const [wins, usage, approved, students] = await Promise.all([
    db.select().from(placeTimeWindows).where(and(eq(placeTimeWindows.placeId, id), eq(placeTimeWindows.organizationId, actor.organizationId)))
      .orderBy(asc(placeTimeWindows.label)),
    windowUsageRows(db, actor.organizationId, id),
    approvedHoursCurrentYearByPlace(db, actor.organizationId),
    activeStudentsByPlace(db, actor.organizationId),
  ]);
  const byId = new Map(usage.map((u) => [u.windowId, u]));
  const windows: WindowView[] = wins.map((w) => {
    const u = byId.get(w.id);
    return { id: w.id, label: w.label, days: w.days as Day[], startTime: w.startTime, endTime: w.endTime, hoursPerSlot: w.hoursPerSlot,
      slots: w.slots, taskDescription: w.taskDescription, isActive: w.isActive,
      requestedHours: u?.requestedHours ?? round2(w.slots * w.hoursPerSlot), allocatedSlots: u?.allocatedSlots ?? 0,
      allocatedHours: u?.allocatedHours ?? 0, remainingSlots: u?.remainingSlots ?? w.slots, remainingHours: u?.remainingHours ?? round2(w.slots * w.hoursPerSlot) };
  });
  const act = windows.filter((w) => w.isActive);
  const sum = (k: "requestedHours" | "allocatedHours" | "remainingHours") => round2(act.reduce((s, x) => s + x[k], 0));
  return { place: { ...r, requestedHours: sum("requestedHours"), allocatedHours: sum("allocatedHours"), remainingHours: sum("remainingHours"),
    activeStudents: students.get(id) ?? 0, approvedHoursThisYear: approved.get(id) ?? 0 }, windows };
}

export type PlaceInput = {
  name: string; description?: string | null; address?: string | null; city?: string | null; contactName?: string | null;
  contactPhone?: string | null; contactEmail?: string | null; category?: string | null; status?: PlaceStatus; notes?: string | null;
};

export async function createPlace(db: Db, actor: SessionUser, input: PlaceInput): Promise<string> {
  assertCan(actor, "create", "place", { organizationId: actor.organizationId });
  if (!input.name.trim()) throw new PlaceError("name_required");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(volunteerPlaces).values({
      organizationId: actor.organizationId, name: input.name.trim(), description: clean(input.description), address: clean(input.address),
      city: clean(input.city), contactName: clean(input.contactName), contactPhone: clean(input.contactPhone), contactEmail: clean(input.contactEmail),
      category: clean(input.category), status: input.status ?? "active", notes: clean(input.notes),
    }).returning({ id: volunteerPlaces.id });
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "volunteer_place", entityId: row.id, action: "create" },
      async () => null, async () => ({ name: input.name.trim() }));
    return row.id;
  });
}

async function hasActivePlacements(tx: Pick<Db, "select">, where: ReturnType<typeof eq>) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(placements).where(and(eq(placements.isActive, true), where));
  return n > 0;
}

export async function updatePlace(db: Db, actor: SessionUser, id: string, input: PlaceInput): Promise<void> {
  assertCan(actor, "update", "place", { organizationId: actor.organizationId });
  if (!input.name.trim()) throw new PlaceError("name_required");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(volunteerPlaces)
      .where(and(eq(volunteerPlaces.id, id), eq(volunteerPlaces.organizationId, actor.organizationId))).for("update").limit(1);
    if (!before) throw new NotFoundError();
    const status = input.status ?? before.status;
    if (status === "closed" && before.status !== "closed" && (await hasActivePlacements(tx, eq(placements.placeId, id)))) {
      throw new PlaceError("has_active_placements");
    }
    const values = { name: input.name.trim(), description: clean(input.description), address: clean(input.address), city: clean(input.city),
      contactName: clean(input.contactName), contactPhone: clean(input.contactPhone), contactEmail: clean(input.contactEmail),
      category: clean(input.category), status, notes: clean(input.notes) };
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "volunteer_place", entityId: id, action: "update" },
      async () => ({ name: before.name, status: before.status, city: before.city, category: before.category }),
      async () => {
        await tx.update(volunteerPlaces).set(values).where(eq(volunteerPlaces.id, id));
        return { name: values.name, status, city: values.city, category: values.category };
      });
  });
}

export type WindowInput = {
  label: string; days: Day[]; startTime?: string | null; endTime?: string | null; hoursPerSlot: number; slots: number; taskDescription?: string | null;
};

function validWindow(i: WindowInput) {
  if (!i.label.trim()) throw new PlaceError("name_required");
  if (!Number.isFinite(i.hoursPerSlot) || !Number.isFinite(i.slots) || i.hoursPerSlot <= 0 || i.slots < 0 || i.hoursPerSlot > 168 || i.slots > 1000) {
    throw new PlaceError("bad_numbers");
  }
}
const windowValues = (i: WindowInput) => ({
  label: i.label.trim(), days: i.days.filter((d) => DAYS.includes(d)), startTime: clean(i.startTime), endTime: clean(i.endTime),
  hoursPerSlot: round2(i.hoursPerSlot), slots: round2(i.slots), taskDescription: clean(i.taskDescription),
});

export async function createWindow(db: Db, actor: SessionUser, placeId: string, input: WindowInput): Promise<string> {
  assertCan(actor, "create", "time_window", { organizationId: actor.organizationId });
  validWindow(input);
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: volunteerPlaces.id }).from(volunteerPlaces)
      .where(and(eq(volunteerPlaces.id, placeId), eq(volunteerPlaces.organizationId, actor.organizationId))).limit(1);
    if (!p) throw new NotFoundError();
    const [row] = await tx.insert(placeTimeWindows).values({ organizationId: actor.organizationId, placeId, ...windowValues(input) })
      .returning({ id: placeTimeWindows.id });
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "place_time_window", entityId: row.id, action: "create" },
      async () => null, async () => ({ placeId, ...windowValues(input) }));
    return row.id;
  });
}

/** עדכון חלון. אי אפשר להוריד תקנים מתחת למה שכבר משובץ. */
export async function updateWindow(db: Db, actor: SessionUser, windowId: string, input: WindowInput): Promise<void> {
  assertCan(actor, "update", "time_window", { organizationId: actor.organizationId });
  validWindow(input);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(placeTimeWindows)
      .where(and(eq(placeTimeWindows.id, windowId), eq(placeTimeWindows.organizationId, actor.organizationId))).for("update").limit(1);
    if (!before) throw new NotFoundError();
    const v = windowValues(input);
    const [alloc] = await tx.select({ slots: sql<number>`coalesce(sum(${placements.slots}), 0)::float`, hours: sql<number>`coalesce(sum(${placements.weeklyHours}), 0)::float` })
      .from(placements).where(and(eq(placements.timeWindowId, windowId), eq(placements.isActive, true)));
    if (v.slots < alloc.slots - 1e-9 || round2(v.slots * v.hoursPerSlot) < alloc.hours - 1e-9) throw new PlaceError("below_allocated");
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "place_time_window", entityId: windowId, action: "update" },
      async () => ({ label: before.label, days: before.days, slots: before.slots, hoursPerSlot: before.hoursPerSlot }),
      async () => {
        await tx.update(placeTimeWindows).set(v).where(eq(placeTimeWindows.id, windowId));
        return { label: v.label, days: v.days, slots: v.slots, hoursPerSlot: v.hoursPerSlot };
      });
  });
}

/** "מחיקת" חלון = הוצאה משימוש. נחסמת כל עוד יש שיבוצים פעילים; ההיסטוריה נשמרת. */
export async function setWindowActive(db: Db, actor: SessionUser, windowId: string, isActive: boolean): Promise<void> {
  assertCan(actor, "delete", "time_window", { organizationId: actor.organizationId });
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(placeTimeWindows)
      .where(and(eq(placeTimeWindows.id, windowId), eq(placeTimeWindows.organizationId, actor.organizationId))).for("update").limit(1);
    if (!before) throw new NotFoundError();
    if (!isActive && (await hasActivePlacements(tx, eq(placements.timeWindowId, windowId)))) throw new PlaceError("has_active_placements");
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "place_time_window", entityId: windowId, action: isActive ? "activate" : "deactivate" },
      async () => ({ isActive: before.isActive }),
      async () => {
        await tx.update(placeTimeWindows).set({ isActive }).where(eq(placeTimeWindows.id, windowId));
        return { isActive };
      });
  });
}
