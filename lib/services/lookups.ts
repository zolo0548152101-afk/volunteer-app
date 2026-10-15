import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { lookups } from "@/lib/db/schema";

/** סוגי התנדבות (kind = volunteer_type), בעברית */
export async function loadCategories(db: Db, organizationId: string): Promise<{ key: string; label: string }[]> {
  const rows = await db.select({ key: lookups.key, label: lookups.labelHe }).from(lookups)
    .where(and(eq(lookups.organizationId, organizationId), eq(lookups.kind, "volunteer_type"))).orderBy(asc(lookups.labelHe));
  return rows;
}
