/**
 * שאילתות קיבולת. כל המספרים כאן מחושבים משיבוצים פעילים, אף אחד לא נשמר בעמודה.
 * שדות מחושבים לפי PRD 5.5 / 5.6: requested, allocated, remaining (ברמת חלון ומקום),
 * approved_hours_current_year (ברמת מקום).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { hourReports, placements, placeTimeWindows, academicYears, volunteerPlaces } from "@/lib/db/schema";
import type { PlacementLike, WindowInfo } from "@/lib/services/capacity";

/** חלונות עם הנתונים שהשירות צריך. אפשר לצמצם למקום אחד */
export async function loadWindows(
  db: DbOrTx,
  organizationId: string,
  filter: { placeId?: string; windowIds?: string[] } = {},
): Promise<WindowInfo[]> {
  const rows = await db
    .select({
      id: placeTimeWindows.id,
      placeId: placeTimeWindows.placeId,
      slots: placeTimeWindows.slots,
      hoursPerSlot: placeTimeWindows.hoursPerSlot,
      // חלון במקום שאינו פעיל (מושהה/סגור) נחשב לא פעיל: אי אפשר לשבץ אליו
      isActive: sql<boolean>`(${placeTimeWindows.isActive} AND ${volunteerPlaces.status} = 'active')`,
    })
    .from(placeTimeWindows)
    .innerJoin(volunteerPlaces, eq(volunteerPlaces.id, placeTimeWindows.placeId))
    .where(
      and(
        eq(placeTimeWindows.organizationId, organizationId),
        filter.placeId ? eq(placeTimeWindows.placeId, filter.placeId) : undefined,
        filter.windowIds?.length ? inArray(placeTimeWindows.id, filter.windowIds) : undefined,
      ),
    );
  return rows;
}

/** שיבוצים פעילים בלבד, לחלונות הנתונים */
export async function loadActivePlacements(
  db: DbOrTx,
  organizationId: string,
  windowIds: string[],
): Promise<PlacementLike[]> {
  if (windowIds.length === 0) return [];
  return db
    .select({
      studentId: placements.studentId,
      timeWindowId: placements.timeWindowId,
      slots: placements.slots,
      weeklyHours: placements.weeklyHours,
      isActive: placements.isActive,
    })
    .from(placements)
    .where(
      and(
        eq(placements.organizationId, organizationId),
        eq(placements.isActive, true),
        inArray(placements.timeWindowId, windowIds),
      ),
    );
}

export type WindowUsageRow = {
  windowId: string;
  placeId: string;
  requestedHours: number;
  allocatedSlots: number;
  allocatedHours: number;
  remainingSlots: number;
  remainingHours: number;
};

/**
 * תפוסה לכל חלון, בשאילתה אחת (לרשימות ולכרטיס מקום).
 * חייב להיות זהה בתוצאה ל-windowUsage() ב-lib/services/capacity.ts; בדיקת האינטגרציה בודקת זאת.
 */
export async function windowUsageRows(
  db: DbOrTx,
  organizationId: string,
  placeId?: string,
): Promise<WindowUsageRow[]> {
  const result = await db.execute<{
    window_id: string;
    place_id: string;
    requested_hours: string;
    allocated_slots: string;
    allocated_hours: string;
    remaining_slots: string;
    remaining_hours: string;
  }>(sql`
    SELECT w.id AS window_id,
           w.place_id,
           round(w.slots * w.hours_per_slot, 2) AS requested_hours,
           coalesce(sum(p.slots), 0) AS allocated_slots,
           coalesce(sum(p.weekly_hours), 0) AS allocated_hours,
           round(w.slots - coalesce(sum(p.slots), 0), 2) AS remaining_slots,
           round(w.slots * w.hours_per_slot - coalesce(sum(p.weekly_hours), 0), 2) AS remaining_hours
    FROM place_time_windows w
    LEFT JOIN placements p ON p.time_window_id = w.id AND p.is_active
    WHERE w.organization_id = ${organizationId}
      AND w.is_active
      ${placeId ? sql`AND w.place_id = ${placeId}` : sql``}
    GROUP BY w.id
    ORDER BY w.place_id, w.label
  `);
  return result.rows.map((r) => ({
    windowId: r.window_id,
    placeId: r.place_id,
    requestedHours: Number(r.requested_hours),
    allocatedSlots: Number(r.allocated_slots),
    allocatedHours: Number(r.allocated_hours),
    remainingSlots: Number(r.remaining_slots),
    remainingHours: Number(r.remaining_hours),
  }));
}

/** שעות מאושרות במקום בשנה האקדמית הנוכחית (רק approved; היעדרות רק אם נספרת) */
export async function approvedHoursCurrentYearByPlace(db: DbOrTx, organizationId: string) {
  const rows = await db
    .select({
      placeId: volunteerPlaces.id,
      hours: sql<string>`coalesce(sum(${hourReports.approvedHours}), 0)`,
    })
    .from(volunteerPlaces)
    .leftJoin(
      hourReports,
      and(
        eq(hourReports.placeId, volunteerPlaces.id),
        eq(hourReports.status, "approved"),
        sql`(${hourReports.reportType} = 'volunteering' OR ${hourReports.countsTowardTarget})`,
        sql`${hourReports.academicYearId} IN (SELECT ${academicYears.id} FROM ${academicYears} WHERE ${academicYears.organizationId} = ${organizationId} AND ${academicYears.isCurrent})`,
      ),
    )
    .where(eq(volunteerPlaces.organizationId, organizationId))
    .groupBy(volunteerPlaces.id);
  return new Map(rows.map((r) => [r.placeId, Number(r.hours)]));
}
