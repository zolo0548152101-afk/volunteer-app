/**
 * ניהול הגדרות שדות מותאמים (PRD 5.13) למנהל: הוספה, עריכה, סידור, הרשאות צפייה ועריכה.
 * סוג השדה והמפתח נקבעים ביצירה ולא משתנים (ערכים קיימים תלויים בהם).
 * "מי עורך" תמיד כולל "מי רואה": אי אפשר לערוך מה שלא רואים. מנהל תמיד רואה ועורך.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { assertCan, type Role, type SessionUser } from "@/lib/permissions";
import { writeAudit } from "@/lib/services/audit";
import { SettingsError } from "@/lib/services/settings";
import type { CustomEntity } from "@/lib/services/custom-fields";
import { slug } from "./_util";

export const ENTITIES: CustomEntity[] = ["student", "place", "placement", "report"];
export const FIELD_TYPES = ["text", "number", "date", "select", "multi_select", "boolean"] as const; // "file" ממתין להעלאת קבצים (Blob)
const ROLES: Role[] = ["student", "coordinator", "interviewer", "manager"];
type Option = { key: string; label_he: string; label_en?: string };

const guard = (actor: SessionUser) => assertCan(actor, "manage", "custom_field", { organizationId: actor.organizationId });

export async function listAllFields(db: Db, actor: SessionUser) {
  guard(actor);
  return db.select().from(customFields).where(eq(customFields.organizationId, actor.organizationId)).orderBy(asc(customFields.entity), asc(customFields.sortOrder), asc(customFields.labelHe));
}

/** "תווית | English" בכל שורה. מפתח קיים נשמר כשהתווית העברית זהה */
export function parseOptions(text: string, existing: Option[] = []): Option[] {
  const used = new Set<string>();
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const [he, en] = line.split("|").map((x) => x.trim());
    if (!he) throw new SettingsError("invalid");
    let key = existing.find((o) => o.label_he === he)?.key ?? (slug(en ?? "") || `o_${i + 1}`);
    for (let n = 2; used.has(key); n++) key = `${key}_${n}`;
    used.add(key);
    return en ? { key, label_he: he, label_en: en } : { key, label_he: he };
  });
}

export async function saveField(db: Db, actor: SessionUser, input: {
  id?: string; entity: string; labelHe: string; labelEn?: string | null; type: string; options?: string;
  required: boolean; visibleToRoles: string[]; editableByRoles: string[]; sortOrder?: number; isActive: boolean;
}) {
  guard(actor);
  const labelHe = input.labelHe.trim();
  if (!labelHe) throw new SettingsError("name_required");
  const roles = (xs: string[]) => [...new Set(xs)].filter((r): r is Role => (ROLES as string[]).includes(r));
  const visible = [...new Set<Role>([...roles(input.visibleToRoles), "manager"])];
  const editable = [...new Set<Role>([...roles(input.editableByRoles), "manager"])].filter((r) => visible.includes(r));
  return db.transaction(async (tx) => {
    const org = actor.organizationId;
    let old = null;
    if (input.id) {
      [old] = await tx.select().from(customFields).where(and(eq(customFields.id, input.id), eq(customFields.organizationId, org))).for("update");
      if (!old) throw new SettingsError("not_found");
    } else if (!(ENTITIES as string[]).includes(input.entity) || !(FIELD_TYPES as readonly string[]).includes(input.type)) throw new SettingsError("invalid");
    const type = old?.type ?? (input.type as (typeof FIELD_TYPES)[number]);
    const options = type === "select" || type === "multi_select" ? parseOptions(input.options ?? "", old?.options ?? []) : [];
    if ((type === "select" || type === "multi_select") && options.length === 0) throw new SettingsError("invalid");
    const vals = {
      labelHe, labelEn: input.labelEn?.trim() || null, options, required: input.required, visibleToRoles: visible, editableByRoles: editable,
      sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder! : 0, isActive: input.isActive,
    };
    let row;
    if (old) [row] = await tx.update(customFields).set(vals).where(eq(customFields.id, old.id)).returning();
    else {
      const base = slug(input.labelEn ?? "") || `f_${Math.random().toString(36).slice(2, 8)}`;
      let key = base;
      for (let n = 2; (await tx.select({ id: customFields.id }).from(customFields).where(and(eq(customFields.organizationId, org), eq(customFields.entity, input.entity as CustomEntity), eq(customFields.key, key))).limit(1)).length > 0; n++) key = `${base}_${n}`;
      [row] = await tx.insert(customFields).values({ organizationId: org, entity: input.entity as CustomEntity, key, type, ...vals }).returning();
    }
    await writeAudit(tx, { organizationId: org, actorId: actor.id }, { entity: "custom_field", entityId: row.id, action: old ? "update" : "create" }, old, row);
    return row.id;
  });
}
