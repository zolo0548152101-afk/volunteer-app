import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";

/** המשתמש המחובר כ-SessionUser, או הפניה לכניסה */
export async function requireActor(): Promise<SessionUser> {
  const s = await auth();
  if (!s) redirect("/login");
  return { id: s.user.id, organizationId: s.user.organizationId, roles: s.user.roles };
}
