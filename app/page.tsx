import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { homeFor } from "@/lib/home";
import { devLoginEnabled } from "@/lib/dev-login";

export default async function Home() {
  const actor = await getActor();
  // בסביבת בדיקה (ENABLE_DEV_LOGIN, אף פעם לא בייצור) דף הפתיחה הוא בחירת משתמש, בלי סיסמה
  redirect(actor ? homeFor(actor.roles) : devLoginEnabled() ? "/dev-login" : "/login");
}
