import { closeDb, db } from "@/lib/db";
import { DEMO_EMAILS, DEMO_PASSWORD, seedDemo } from "@/lib/db/seed";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("seed אסור בפרודקשן");
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
