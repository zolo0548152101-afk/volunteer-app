import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Pool עם WebSocket ולא neon-http: רק כך יש טרנזקציות אינטראקטיביות (db.transaction),
 * ואלה חובה לסגירת ראיון (PRD 7.2: הכל בטרנזקציה אחת).
 * חיבור עצל: לא נכשל בזמן build אם אין DATABASE_URL.
 */
let _pool: Pool | undefined;
let _db: ReturnType<typeof create> | undefined;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({ connectionString: url });
  return drizzle(_pool, { schema });
}

export function db() {
  return (_db ??= create());
}

export type Db = ReturnType<typeof db>;
/** הארגומנט של db.transaction(async (tx) => …) */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** מקבל גם חיבור רגיל וגם טרנזקציה */
export type DbOrTx = Db | Tx;

/** לסקריפטים ובדיקות: סוגר את החיבורים כדי שהתהליך יסתיים */
export async function closeDb() {
  await _pool?.end();
  _pool = undefined;
  _db = undefined;
}
