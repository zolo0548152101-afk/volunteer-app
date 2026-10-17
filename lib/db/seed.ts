/**
 * נתוני הדגמה (WORKPLAN שלב 1): ארגון אחד, מנהל, 2 רכזים, מראיין, 6 סטודנטים,
 * 4 מקומות עם חלונות זמן שונים (כולל חצי תקן ושברים), שנה אקדמית נוכחית.
 * לסביבת פיתוח בלבד: כל המשתמשים מקבלים את אותה סיסמת הדגמה.
 */
import type { Db } from "@/lib/db";
import {
  academicYears,
  hourReports,
  interviews,
  lookups,
  notificationRules,
  organizations,
  placements,
  placeTimeWindows,
  programs,
  settings,
  studentProfiles,
  users,
  volunteerPlaces,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { writeAudit } from "@/lib/services/audit";
import { DEFAULT_RULES, type RuleKind } from "@/lib/services/reminders";

export const DEMO_PASSWORD = "demo1234";

export const DEMO_EMAILS = {
  manager: "manager@demo.test",
  coordinator1: "coord1@demo.test",
  coordinator2: "coord2@demo.test",
  interviewer: "interviewer@demo.test",
  students: [1, 2, 3, 4, 5, 6].map((n) => `student${n}@demo.test`),
} as const;

export const volunteerTypes: [string, string, string][] = [
  ["education", "חינוך", "Education"],
  ["elderly", "קשישים", "Elderly"],
  ["health", "בריאות", "Health"],
  ["at_risk_youth", "נוער בסיכון", "At-risk youth"],
  ["animals", "בעלי חיים", "Animals"],
  ["environment", "סביבה", "Environment"],
  ["community", "קהילה", "Community"],
  ["other", "אחר", "Other"],
];

export const absenceReasons: [string, string, string][] = [
  ["reserve_duty", "מילואים", "Reserve duty"],
  ["illness", "מחלה", "Illness"],
  ["security_situation", "מצב ביטחוני", "Security situation"],
  ["other", "אחר", "Other"],
];

export async function seedDemo(db: Db, opts: { orgName?: string } = {}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: opts.orgName ?? "ארגון הדגמה" })
      .returning();
    const organizationId = org.id;
    const base = { organizationId };

    await tx.insert(settings).values({ organizationId });
    await tx.insert(notificationRules).values(
      (Object.entries(DEFAULT_RULES) as [RuleKind, (typeof DEFAULT_RULES)[RuleKind]][]).map(([kind, rule]) => ({
        ...base,
        kind,
        ...rule,
      })),
    );
    await tx.insert(lookups).values([
      ...volunteerTypes.map(([key, he, en], i) => ({
        ...base,
        kind: "volunteer_type",
        key,
        labelHe: he,
        labelEn: en,
        sortOrder: i,
      })),
      ...absenceReasons.map(([key, he, en], i) => ({
        ...base,
        kind: "absence_reason",
        key,
        labelHe: he,
        labelEn: en,
        sortOrder: i,
      })),
    ]);

    const [year] = await tx
      .insert(academicYears)
      .values({
        ...base,
        name: 'תשפ"ז 2026–27',
        startDate: "2026-10-01",
        endDate: "2027-06-30",
        reportDeadline: "2027-07-15",
        isCurrent: true,
      })
      .returning();

    const [program] = await tx
      .insert(programs)
      .values({
        ...base,
        name: "מלגת 10,000",
        requiredHours: 140,
        milestones: [
          { hours: 45, label: "פעימה 1" },
          { hours: 90, label: "פעימה 2" },
          { hours: 140, label: "פעימה 3" },
        ],
        maxHoursPerDay: 8,
      })
      .returning();

    const mkUser = (
      email: string,
      firstName: string,
      lastName: string,
      roles: ("student" | "coordinator" | "interviewer" | "manager")[],
      extra: { coordinatorId?: string; phone?: string } = {},
    ) => ({
      ...base,
      email,
      passwordHash,
      firstName,
      lastName,
      roles,
      status: "active" as const,
      ...extra,
    });

    const [manager] = await tx.insert(users).values(mkUser(DEMO_EMAILS.manager, "מירב", "כהן", ["manager"])).returning();
    const [coord1, coord2] = await tx
      .insert(users)
      .values([
        mkUser(DEMO_EMAILS.coordinator1, "דנה", "לוי", ["coordinator"], { phone: "0501111111" }),
        mkUser(DEMO_EMAILS.coordinator2, "יוסי", "מזרחי", ["coordinator"], { phone: "0502222222" }),
      ])
      .returning();
    const [interviewer] = await tx
      .insert(users)
      .values(mkUser(DEMO_EMAILS.interviewer, "נועה", "ברק", ["interviewer"]))
      .returning();

    const studentSeed: [string, string, string | undefined][] = [
      ["שירה", "אביב", coord1.id],
      ["איתי", "גולן", coord1.id],
      ["מאיה", "דגן", coord2.id],
      ["עומר", "הרשקוביץ", coord2.id],
      ["ליאן", "וקנין", undefined], // ממתינה לראיון
      ["תומר", "זוהר", undefined], // ממתין לראיון
    ];
    const students = await tx
      .insert(users)
      .values(
        studentSeed.map(([first, last, coordinatorId], i) =>
          mkUser(DEMO_EMAILS.students[i], first, last, ["student"], {
            coordinatorId,
            phone: `05033333${String(i).padStart(2, "0")}`,
          }),
        ),
      )
      .returning();

    await tx.insert(studentProfiles).values(
      students.map((s, i) => ({
        userId: s.id,
        ...base,
        city: ["תל אביב", "חיפה", "באר שבע", "ירושלים", "חיפה", "רחובות"][i],
        institution: "אוניברסיטת הדגמה",
        degreeType: "bachelor" as const,
        degreeYear: (["a", "b", "b", "c", "a", "d_plus"] as const)[i],
        fieldOfStudy: ["פסיכולוגיה", "חינוך", "סיעוד", "עבודה סוציאלית", "משפטים", "הנדסה"][i],
        trackId: program.id,
        academicYearId: year.id,
        preferredTypes: [["education"], ["elderly", "health"], ["health"], ["at_risk_youth"], ["education", "community"], ["environment"]][i],
        availableDays: [["sun", "tue"], ["mon", "wed"], ["tue", "thu"], ["tue"], ["sun", "mon", "tue"], ["fri"]][i] as ("sun" | "mon" | "tue" | "wed" | "thu" | "fri")[],
        availableHours: "אחה״צ, אחרי 14:00",
        profileCompletedAt: new Date(),
      })),
    );

    const [elders, youth, kindergarten, clinic] = await tx
      .insert(volunteerPlaces)
      .values([
        { ...base, name: "בית אבות שלווה", city: "תל אביב", category: "elderly", contactName: "רונית", contactPhone: "0541234567", description: "ליווי ופעילות חברתית לדיירים" },
        { ...base, name: "מועדון נוער הדר", city: "חיפה", category: "at_risk_youth", contactName: "אבי", contactPhone: "0547654321", description: "סיוע בשיעורי בית ופעילות ערב" },
        { ...base, name: "גן ילדים פלורה", city: "באר שבע", category: "education", contactName: "מיכל", contactPhone: "0542345678", description: "סייעת בגן" },
        { ...base, name: "מרפאה קהילתית", city: "ירושלים", category: "health", contactName: "ד״ר שני", contactPhone: "0543456789", description: "קבלת קהל וליווי מטופלים" },
      ])
      .returning();

    const days = (...d: ("sun" | "mon" | "tue" | "wed" | "thu" | "fri")[]) => d;
    const [eldersMorning, eldersThu, youthTue, kgMorning, clinicHalf] = await tx
      .insert(placeTimeWindows)
      .values([
        { ...base, placeId: elders.id, label: "בוקר א׳–ג׳", days: days("sun", "mon", "tue"), startTime: "08:00", endTime: "12:00", hoursPerSlot: 4, slots: 2, taskDescription: "ליווי דיירים בפעילות בוקר" },
        { ...base, placeId: elders.id, label: "ערב ה׳", days: days("thu"), startTime: "16:00", endTime: "19:00", hoursPerSlot: 3, slots: 1.5, taskDescription: "ערב משחקים וקריאה" },
        { ...base, placeId: youth.id, label: "ג׳ אחה״צ", days: days("tue"), startTime: "16:00", endTime: "19:00", hoursPerSlot: 3, slots: 3, taskDescription: "הכנה לבגרויות" },
        { ...base, placeId: kindergarten.id, label: "בוקר א׳–ה׳", days: days("sun", "mon", "tue", "wed", "thu"), startTime: "08:00", endTime: "13:00", hoursPerSlot: 5, slots: 1, taskDescription: "עזרה בפעילות הגן" },
        { ...base, placeId: clinic.id, label: "חצי תקן ד׳", days: days("wed"), startTime: "09:00", endTime: "13:00", hoursPerSlot: 4, slots: 0.5, taskDescription: "קבלת קהל" },
      ])
      .returning();

    // ראיונות סגורים + שיבוצים
    const mkInterview = (studentId: string) => ({
      ...base,
      studentId,
      interviewerId: interviewer.id,
      status: "finalized" as const,
      interviewDate: "2026-10-05",
      generalImpression: "suitable" as const,
      finalizedAt: new Date("2026-10-05T12:00:00Z"),
    });
    const [i1, i2old, i2, i3, i4] = await tx
      .insert(interviews)
      .values([
        mkInterview(students[0].id),
        mkInterview(students[1].id),
        { ...mkInterview(students[1].id), kind: "reassignment" as const, interviewDate: "2026-10-12" },
        mkInterview(students[2].id),
        mkInterview(students[3].id),
      ])
      .returning();

    const contract = (
      interviewId: string,
      studentId: string,
      place: { id: string },
      window: { id: string },
      slots: number,
      weeklyHours: number,
      active: boolean,
      extra: Partial<typeof placements.$inferInsert> = {},
    ): typeof placements.$inferInsert => ({
      ...base,
      interviewId,
      studentId,
      placeId: place.id,
      timeWindowId: window.id,
      slots,
      weeklyHours,
      defaultReportHours: weeklyHours,
      isActive: active,
      startedAt: "2026-10-05",
      createdBy: interviewer.id,
      ...extra,
    });

    const placed = await tx
      .insert(placements)
      .values([
        // שירה: תקן אחד בבוקר בבית האבות (4 שעות)
        contract(i1.id, students[0].id, elders, eldersMorning, 1, 4, true, { assignedDays: ["sun"], assignedHours: "08:00–12:00" }),
        // איתי: היסטוריה (לא פעיל) ושיבוץ פעיל חדש אחרי שיבוץ מחדש
        contract(i2old.id, students[1].id, elders, eldersMorning, 1, 4, false, { endedAt: "2026-10-12", assignedDays: ["mon"] }),
        contract(i2.id, students[1].id, youth, youthTue, 1, 3, true, { assignedDays: ["tue"], assignedHours: "16:00–19:00", startedAt: "2026-10-12" }),
        // מאיה: חצי תקן בגן (2.5 שעות) + חצי תקן במרפאה (2 שעות). שני מקומות
        contract(i3.id, students[2].id, kindergarten, kgMorning, 0.5, 2.5, true, { assignedDays: ["sun"], assignedHours: "08:00–10:30" }),
        contract(i3.id, students[2].id, clinic, clinicHalf, 0.5, 2, true, { assignedDays: ["wed"], assignedHours: "09:00–11:00" }),
        // עומר: חצי תקן בערב ה׳
        contract(i4.id, students[3].id, elders, eldersThu, 0.5, 1.5, true, { assignedDays: ["thu"], assignedHours: "16:00–17:30" }),
      ])
      .returning();

    for (const p of placed) {
      await writeAudit(tx, { organizationId, actorId: interviewer.id }, { entity: "placement", entityId: p.id, action: "create" }, null, p);
    }

    // דיווחים: מאושר, ממתין, והיעדרות מאושרת שנספרת
    const rep = (
      studentIdx: number,
      placementIdx: number,
      date: string,
      reported: number,
      status: "pending" | "approved" | "rejected" | "needs_correction",
      extra: Partial<typeof hourReports.$inferInsert> = {},
    ): typeof hourReports.$inferInsert => ({
      ...base,
      studentId: students[studentIdx].id,
      placementId: placed[placementIdx].id,
      placeId: placed[placementIdx].placeId,
      coordinatorId: students[studentIdx].coordinatorId,
      academicYearId: year.id,
      volunteerDate: date,
      reportedHours: reported,
      approvedHours: reported,
      status,
      ...extra,
    });
    await tx.insert(hourReports).values([
      rep(0, 0, "2026-10-11", 4, "approved", { approvedAt: new Date("2026-10-12T08:00:00Z"), approvedBy: coord1.id }),
      rep(0, 0, "2026-10-18", 4, "pending"),
      rep(2, 3, "2026-10-11", 2.5, "approved", { approvedAt: new Date("2026-10-12T08:00:00Z"), approvedBy: coord2.id }),
      rep(3, 5, "2026-10-08", 1.5, "pending", { submittedAt: new Date("2026-10-08T10:00:00Z") }),
      {
        ...rep(0, 0, "2026-10-04", 4, "approved", {
          approvedAt: new Date("2026-10-05T08:00:00Z"),
          approvedBy: coord1.id,
        }),
        reportType: "absence",
        absenceReason: "reserve_duty",
        countsTowardTarget: true,
        approvedHours: 4,
      },
    ]);

    return {
      organizationId,
      yearId: year.id,
      programId: program.id,
      manager,
      coordinators: [coord1, coord2],
      interviewer,
      students,
      places: { elders, youth, kindergarten, clinic },
      windows: { eldersMorning, eldersThu, youthTue, kgMorning, clinicHalf },
    };
  });
}

/** מחיקת ארגון הדגמה וכל מה שתלוי בו (לבדיקות; סדר לפי תלויות מפתחות זרים) */
export async function deleteOrganization(db: Db, organizationId: string) {
  const { sql } = await import("drizzle-orm");
  await db.transaction(async (tx) => {
    // users מצביע על עצמו (coordinator_id): מנתקים לפני מחיקה
    await tx.execute(sql`UPDATE users SET coordinator_id = NULL WHERE organization_id = ${organizationId}`);
    for (const t of [
      "notification_log",
      "notification_rules",
      "audit_log",
      "custom_field_values",
      "custom_fields",
      "hour_reports",
      "placements",
      "interviews",
      "place_time_windows",
      "volunteer_places",
      "student_profiles",
      "lookups",
      "settings",
      "users",
      "programs",
      "academic_years",
    ]) {
      await tx.execute(sql`DELETE FROM ${sql.raw(t)} WHERE organization_id = ${organizationId}`);
    }
    await tx.execute(sql`DELETE FROM organizations WHERE id = ${organizationId}`);
  });
}
