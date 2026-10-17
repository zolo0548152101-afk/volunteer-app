/**
 * שדות מותאמים (PRD 5.13): הגדרה אחת, רינדור גנרי. הרשאות צפייה ועריכה לפי תפקיד נאכפות כאן.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { customFields, customFieldValues } from "@/lib/db/schema";
import type { Role, SessionUser } from "@/lib/permissions";

export type CustomEntity = "student" | "place" | "placement" | "report";
/** הדפים שבהם שדות מותאמים מוצגים בפועל. registration = מילוי ראשוני של סטודנט; profile = הפרופיל וכרטיס הסטודנט */
export const PAGES = [
  { key: "registration", entity: "student" },
  { key: "profile", entity: "student" },
  { key: "report_form", entity: "report" },
] as const;
export type PageKey = (typeof PAGES)[number]["key"];
export const defaultPage = (entity: CustomEntity): PageKey | null => PAGES.find((p) => p.entity === entity)?.key ?? null;
export const pagesOf = (entity: string) => PAGES.filter((p) => p.entity === entity).map((p) => p.key);
/** הדף בפועל של שדה: הערך השמור, או ברירת המחדל של הישות */
export const effectivePage = (entity: CustomEntity, page: string | null): PageKey | null =>
  (page && (pagesOf(entity) as string[]).includes(page) ? (page as PageKey) : defaultPage(entity));

export type FieldDef = {
  id: string; key: string; labelHe: string; labelEn: string | null; type: "text" | "number" | "date" | "select" | "multi_select" | "file" | "boolean";
  options: { key: string; label_he: string; label_en?: string }[]; required: boolean; canEdit: boolean; page: PageKey | null;
};
export type FieldValue = string | number | boolean | string[] | null;

const intersects = (a: Role[], b: Role[]) => a.some((r) => b.includes(r));

/** השדות שהמשתמש רשאי לראות (canEdit מציין אם גם לערוך) */
export async function listFields(db: DbOrTx, actor: SessionUser, entity: CustomEntity, page?: PageKey): Promise<FieldDef[]> {
  const rows = await db.select().from(customFields)
    .where(and(eq(customFields.organizationId, actor.organizationId), eq(customFields.entity, entity), eq(customFields.isActive, true)))
    .orderBy(asc(customFields.sortOrder), asc(customFields.labelHe));
  return rows.filter((f) => intersects(f.visibleToRoles, actor.roles) && (!page || effectivePage(entity, f.page) === page)).map((f) => ({
    id: f.id, key: f.key, labelHe: f.labelHe, labelEn: f.labelEn, type: f.type, options: f.options, required: f.required,
    canEdit: intersects(f.editableByRoles, actor.roles), page: effectivePage(entity, f.page),
  }));
}

export async function loadValues(db: DbOrTx, organizationId: string, entityId: string, fields: FieldDef[]): Promise<Record<string, FieldValue>> {
  if (fields.length === 0) return {};
  const rows = await db.select().from(customFieldValues)
    .where(and(eq(customFieldValues.organizationId, organizationId), eq(customFieldValues.entityId, entityId), inArray(customFieldValues.fieldId, fields.map((f) => f.id))));
  const byField = new Map(rows.map((r) => [r.fieldId, r.value as FieldValue]));
  return Object.fromEntries(fields.map((f) => [f.id, byField.get(f.id) ?? null]));
}

/** כמו loadValues לכמה ישויות בשאילתה אחת (מונע שאילתה לכל סטודנט בדוחות וייצוא) */
export async function loadValuesMany(db: DbOrTx, organizationId: string, entityIds: string[], fields: FieldDef[]): Promise<Map<string, Record<string, FieldValue>>> {
  const out = new Map<string, Record<string, FieldValue>>(entityIds.map((id) => [id, Object.fromEntries(fields.map((f) => [f.id, null as FieldValue]))]));
  if (fields.length === 0 || entityIds.length === 0) return out;
  const rows = await db.select().from(customFieldValues)
    .where(and(eq(customFieldValues.organizationId, organizationId), inArray(customFieldValues.entityId, entityIds), inArray(customFieldValues.fieldId, fields.map((f) => f.id))));
  for (const r of rows) { const rec = out.get(r.entityId); if (rec) rec[r.fieldId] = r.value as FieldValue; }
  return out;
}

export class CustomFieldError extends Error {
  constructor(public fieldKey: string, public code: "required" | "invalid") {
    super(`${code}:${fieldKey}`);
    this.name = "CustomFieldError";
  }
}

/** ממיר ערך גולמי מטופס לערך מנורמל לפי סוג השדה */
export function coerce(f: FieldDef, raw: string[]): FieldValue {
  const first = (raw[0] ?? "").trim();
  switch (f.type) {
    case "boolean": return raw.includes("on") || raw.includes("1") || raw.includes("true");
    case "number": {
      if (first === "") return null;
      const n = Number(first);
      if (!Number.isFinite(n)) throw new CustomFieldError(f.key, "invalid");
      return n;
    }
    case "date":
      if (first === "") return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || Number.isNaN(Date.parse(first))) throw new CustomFieldError(f.key, "invalid");
      return first;
    case "select": {
      if (first === "") return null;
      if (!f.options.some((o) => o.key === first)) throw new CustomFieldError(f.key, "invalid");
      return first;
    }
    case "multi_select": {
      const vals = raw.filter((v) => v !== "");
      if (vals.some((v) => !f.options.some((o) => o.key === v))) throw new CustomFieldError(f.key, "invalid");
      return vals;
    }
    case "file": return first === "" ? null : first;
    default: return first === "" ? null : first;
  }
}

/**
 * שומר ערכים לשדות שהמשתמש רשאי לערוך בלבד; כל השאר מתעלמים (גם אם נשלחו).
 * @param input מפתח = fieldId, ערך = ערכי הטופס הגולמיים
 */
export async function saveValues(db: DbOrTx, actor: SessionUser, entity: CustomEntity, entityId: string, input: Record<string, string[]>, opts: { enforceRequired?: boolean } = {}) {
  const fields = (await listFields(db, actor, entity)).filter((f) => f.canEdit);
  for (const f of fields) {
    const raw = input[f.id];
    if (raw === undefined) continue; // לא נשלח בכלל: לא נוגעים (בוליאני נשלח תמיד עם hidden 0)
    const value = coerce(f, raw);
    const empty = value === null || (Array.isArray(value) && value.length === 0) || value === "";
    if (opts.enforceRequired && f.required && f.type !== "boolean" && empty) throw new CustomFieldError(f.key, "required");
    await db.insert(customFieldValues).values({ organizationId: actor.organizationId, fieldId: f.id, entityId, value })
      .onConflictDoUpdate({ target: [customFieldValues.fieldId, customFieldValues.entityId], set: { value } });
  }
}

/** ערכים מ-FormData: שדות בשם cf_<fieldId> */
export function customInputFromForm(fd: FormData): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("cf_")) out[key.slice(3)] = fd.getAll(key).map(String);
  }
  return out;
}

/** שדות חובה שהמשתמש עורך: חייבים להיות מלאים בקלט. נבדק *לפני* הפעולה, כדי לא להשאיר רשומה חצי-מלאה */
export async function assertRequired(db: DbOrTx, actor: SessionUser, entity: CustomEntity, input: Record<string, string[]>, page?: PageKey) {
  const fields = (await listFields(db, actor, entity, page)).filter((f) => f.canEdit && f.required && f.type !== "boolean");
  for (const f of fields) {
    const v = coerce(f, input[f.id] ?? []);
    if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) throw new CustomFieldError(f.key, "required");
  }
}
