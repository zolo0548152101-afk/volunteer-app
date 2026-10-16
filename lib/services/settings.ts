/**
 * הגדרות ארגון (PRD 5.9, 5.10, 7.5): שנה אקדמית, מסלולים, כללי התראה, סף פער, שפות, רשימות בחירה.
 * רק מנהל (פעולת manage על setting). כל שינוי נרשם בלוג באותה טרנזקציה.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { academicYears, lookups, notificationRules, programs, settings } from "@/lib/db/schema";
import { assertCan, type SessionUser } from "@/lib/permissions";
import { writeAudit } from "@/lib/services/audit";
import { loadRules } from "@/lib/services/cron";
import { round2 } from "@/lib/services/capacity";
import { DEFAULT_RULES, type Rule, type RuleKind } from "@/lib/services/reminders";
import type { Channel } from "@/lib/services/notify";
import { locales, type Locale } from "@/i18n/config";
import { isDate, slug } from "./_util";

export type SettingsCode = "invalid" | "bad_dates" | "name_required" | "bad_milestones" | "not_found";
export class SettingsError extends Error {
  constructor(public code: SettingsCode) {
    super(code);
    this.name = "SettingsError";
  }
}

export const LOOKUP_KINDS = ["volunteer_type", "institution", "absence_reason"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];
const CHANNELS: Channel[] = ["email", "sms", "whatsapp"];
const guard = (actor: SessionUser) => assertCan(actor, "manage", "setting", { organizationId: actor.organizationId });
const ctx = (a: SessionUser) => ({ organizationId: a.organizationId, actorId: a.id });
const int = (n: number, min: number, max: number) => {
  if (!Number.isInteger(n) || n < min || n > max) throw new SettingsError("invalid");
  return n;
};

export async function loadAdminSettings(db: Db, actor: SessionUser) {
  guard(actor);
  const org = actor.organizationId;
  const [st] = await db.select().from(settings).where(eq(settings.organizationId, org));
  const years = await db.select().from(academicYears).where(eq(academicYears.organizationId, org)).orderBy(desc(academicYears.startDate));
  const progs = await db.select().from(programs).where(eq(programs.organizationId, org)).orderBy(asc(programs.name));
  const rules = await loadRules(db, org);
  const lk = await db.select().from(lookups).where(eq(lookups.organizationId, org)).orderBy(asc(lookups.sortOrder), asc(lookups.labelHe));
  return {
    tolerance: Number(st?.capacityToleranceHours ?? 1),
    languages: (st?.languages ?? ["he", "en"]) as Locale[],
    years, programs: progs, rules,
    lookups: Object.fromEntries(LOOKUP_KINDS.map((k) => [k, lk.filter((x) => x.kind === k)])) as Record<LookupKind, typeof lk>,
  };
}

export async function saveGeneral(db: Db, actor: SessionUser, input: { tolerance: number; languages: string[] }) {
  guard(actor);
  const tol = round2(input.tolerance);
  const langs = [...new Set(input.languages)].filter((l): l is Locale => (locales as readonly string[]).includes(l));
  if (!Number.isFinite(tol) || tol < 0 || tol > 24 || langs.length === 0) throw new SettingsError("invalid");
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(settings).where(eq(settings.organizationId, actor.organizationId)).for("update");
    const [row] = await tx.insert(settings).values({ organizationId: actor.organizationId, capacityToleranceHours: tol, languages: langs })
      .onConflictDoUpdate({ target: settings.organizationId, set: { capacityToleranceHours: tol, languages: langs, updatedAt: new Date() } }).returning();
    await writeAudit(tx, ctx(actor), { entity: "setting", entityId: actor.organizationId, action: "update_general" }, old ?? null, row);
  });
}

export async function saveYear(db: Db, actor: SessionUser, input: { id?: string; name: string; startDate: string; endDate: string; reportDeadline?: string | null; makeCurrent?: boolean }) {
  guard(actor);
  const name = input.name.trim();
  if (!name) throw new SettingsError("name_required");
  const dl = input.reportDeadline?.trim() || null;
  if (!isDate(input.startDate) || !isDate(input.endDate) || input.startDate >= input.endDate || (dl && (!isDate(dl) || dl < input.startDate))) throw new SettingsError("bad_dates");
  return db.transaction(async (tx) => {
    const org = actor.organizationId;
    // נעילה: שינוי "שנה נוכחית" לא יתנגש עם שינוי מקביל (אינדקס ייחודי על שנה נוכחית אחת)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"year:" + org}, 0))`);
    let old = null;
    if (input.id) {
      [old] = await tx.select().from(academicYears).where(and(eq(academicYears.id, input.id), eq(academicYears.organizationId, org))).for("update");
      if (!old) throw new SettingsError("not_found");
    }
    const makeCurrent = input.makeCurrent ?? old?.isCurrent ?? false;
    if (makeCurrent) await tx.update(academicYears).set({ isCurrent: false }).where(and(eq(academicYears.organizationId, org), eq(academicYears.isCurrent, true)));
    const vals = { name, startDate: input.startDate, endDate: input.endDate, reportDeadline: dl, isCurrent: makeCurrent };
    const [row] = old
      ? await tx.update(academicYears).set(vals).where(eq(academicYears.id, old.id)).returning()
      : await tx.insert(academicYears).values({ organizationId: org, ...vals }).returning();
    await writeAudit(tx, ctx(actor), { entity: "setting", entityId: row.id, action: old ? "update_year" : "create_year" }, old, row);
    return row.id;
  });
}

/** "45:פעימה 1" בכל שורה → [{hours, label}], בסדר עולה */
export function parseMilestones(text: string): { hours: number; label: string }[] {
  const out = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d+(?:\.\d+)?)\s*[:\-]\s*(.+)$/.exec(l);
    if (!m) throw new SettingsError("bad_milestones");
    return { hours: Number(m[1]), label: m[2].trim() };
  });
  for (let i = 1; i < out.length; i++) if (out[i].hours <= out[i - 1].hours) throw new SettingsError("bad_milestones");
  return out;
}

export async function saveProgram(db: Db, actor: SessionUser, input: { id?: string; name: string; requiredHours: number; maxHoursPerDay?: number | null; milestones: string; isActive: boolean }) {
  guard(actor);
  const name = input.name.trim();
  if (!name) throw new SettingsError("name_required");
  const required = round2(input.requiredHours);
  const max = input.maxHoursPerDay === null || input.maxHoursPerDay === undefined || Number.isNaN(input.maxHoursPerDay) ? null : round2(input.maxHoursPerDay);
  if (!Number.isFinite(required) || required < 0 || (max !== null && (max <= 0 || max > 24))) throw new SettingsError("invalid");
  const milestones = parseMilestones(input.milestones);
  if (milestones.some((m) => m.hours > required)) throw new SettingsError("bad_milestones");
  return db.transaction(async (tx) => {
    let old = null;
    if (input.id) {
      [old] = await tx.select().from(programs).where(and(eq(programs.id, input.id), eq(programs.organizationId, actor.organizationId))).for("update");
      if (!old) throw new SettingsError("not_found");
    }
    const vals = { name, requiredHours: required, maxHoursPerDay: max, milestones, isActive: input.isActive };
    const [row] = old
      ? await tx.update(programs).set(vals).where(eq(programs.id, old.id)).returning()
      : await tx.insert(programs).values({ organizationId: actor.organizationId, ...vals }).returning();
    await writeAudit(tx, ctx(actor), { entity: "setting", entityId: row.id, action: old ? "update_program" : "create_program" }, old, row);
    return row.id;
  });
}

export async function saveRule(db: Db, actor: SessionUser, kind: string, input: Rule) {
  guard(actor);
  if (!(kind in DEFAULT_RULES)) throw new SettingsError("invalid");
  const channels = [...new Set(input.channels)].filter((c): c is Channel => CHANNELS.includes(c));
  if (channels.length === 0) throw new SettingsError("invalid");
  const vals = {
    enabled: !!input.enabled, firstAfterDays: int(input.firstAfterDays, 0, 365), maxSends: int(input.maxSends, 1, 20),
    repeatEveryDays: int(input.repeatEveryDays, 1, 365), channels, copyManager: !!input.copyManager, updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(notificationRules).where(and(eq(notificationRules.organizationId, actor.organizationId), eq(notificationRules.kind, kind))).for("update");
    const [row] = await tx.insert(notificationRules).values({ organizationId: actor.organizationId, kind: kind as RuleKind, ...vals })
      .onConflictDoUpdate({ target: [notificationRules.organizationId, notificationRules.kind], set: vals }).returning();
    await writeAudit(tx, ctx(actor), { entity: "setting", entityId: row.id, action: "update_rule" }, old ?? null, row);
  });
}


export async function saveLookup(db: Db, actor: SessionUser, input: { id?: string; kind: string; labelHe: string; labelEn?: string | null; sortOrder?: number; isActive: boolean }) {
  guard(actor);
  if (!(LOOKUP_KINDS as readonly string[]).includes(input.kind)) throw new SettingsError("invalid");
  const labelHe = input.labelHe.trim();
  if (!labelHe) throw new SettingsError("name_required");
  const labelEn = input.labelEn?.trim() || null;
  const sortOrder = Number.isInteger(input.sortOrder) ? input.sortOrder! : 0;
  return db.transaction(async (tx) => {
    const org = actor.organizationId;
    let old = null;
    if (input.id) {
      [old] = await tx.select().from(lookups).where(and(eq(lookups.id, input.id), eq(lookups.organizationId, org))).for("update");
      if (!old) throw new SettingsError("not_found");
    }
    // המפתח נקבע ביצירה ואינו משתנה: סטודנטים ומקומות שומרים אותו
    let key = old?.key;
    if (!old) {
      const base = slug(labelEn ?? "") || `k_${Math.random().toString(36).slice(2, 8)}`;
      key = base;
      for (let i = 2; (await tx.select({ id: lookups.id }).from(lookups).where(and(eq(lookups.organizationId, org), eq(lookups.kind, input.kind), eq(lookups.key, key!))).limit(1)).length > 0; i++) key = `${base}_${i}`;
    }
    const vals = { labelHe, labelEn, sortOrder, isActive: input.isActive };
    const [row] = old
      ? await tx.update(lookups).set(vals).where(eq(lookups.id, old.id)).returning()
      : await tx.insert(lookups).values({ organizationId: org, kind: input.kind, key: key!, ...vals }).returning();
    await writeAudit(tx, ctx(actor), { entity: "setting", entityId: row.id, action: old ? "update_lookup" : "create_lookup" }, old, row);
    return row.id;
  });
}
