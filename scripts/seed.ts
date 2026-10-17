import { closeDb, db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { DEMO_EMAILS, DEMO_PASSWORD, seedDemo } from "@/lib/db/seed";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("seed אסור בפרודקשן");
  }
  // NODE_ENV לא מוגדר כשמריצים מהמחשב מול מסד ייצור, לכן בודקים גם שהמסד ריק מארגונים
  const existing = await db().select({ id: organizations.id }).from(organizations).limit(1);
  if (existing.length > 0 && process.env.ALLOW_SEED !== "1") {
    throw new Error("יש כבר ארגון במסד. אם זה מסד פיתוח, הריצו עם ALLOW_SEED=1 (לעולם לא מול ייצור)");
  }
  const s = await seedDemo(db());
  console.log("נוצר ארגון הדגמה:", s.organizationId);
  console.log("סיסמה לכולם:", DEMO_PASSWORD);
  console.log("מנהל:", DEMO_EMAILS.manager);
  console.log("רכזים:", DEMO_EMAILS.coordinator1, DEMO_EMAILS.coordinator2);
  console.log("מראיין:", DEMO_EMAILS.interviewer);
  console.log("סטודנטים:", DEMO_EMAILS.students.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
