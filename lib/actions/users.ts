"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, ForbiddenError, roles as ALL_ROLES, type Role } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { sendLink } from "@/lib/services/auth-links";
import { assignCoordinator, getUser, inviteUser, NotFoundError, setRoles, subjectOf, setStatus, ValidationError } from "@/lib/services/users";

export type UserActionState = { ok?: true; error?: string };

function toError(e: unknown): UserActionState {
  if (e instanceof ForbiddenError) return { error: "forbidden" };
  if (e instanceof NotFoundError) return { error: "not_found" };
  if (e instanceof ValidationError) return { error: e.code };
  if (e instanceof z.ZodError) return { error: "required" };
  console.error(e);
  return { error: "generic" };
}

const rolesOf = (fd: FormData) => fd.getAll("roles").map(String).filter((r): r is Role => (ALL_ROLES as readonly string[]).includes(r));

const inviteSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
});

export async function inviteUserAction(_: UserActionState, fd: FormData): Promise<UserActionState> {
  try {
    const actor = await requireActor();
    const v = inviteSchema.parse(Object.fromEntries(fd));
    const user = await inviteUser(db(), actor, {
      ...v, phone: v.phone || null, roles: rolesOf(fd), coordinatorId: String(fd.get("coordinatorId") || "") || null,
    });
    await sendLink(user, "invite");
    revalidatePath("/manager/users");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** פעולות מטופס בלי state: שגיאה מוצגת בבאנר דרך ?error= */
async function run(fn: () => Promise<void>) {
  let error: string | undefined;
  try {
    await fn();
  } catch (e) {
    error = toError(e).error;
  }
  redirect(error ? `/manager/users?error=${error}` : "/manager/users");
}

export async function resendInviteAction(fd: FormData) {
  await run(async () => {
    const actor = await requireActor();
    const u = await getUser(db(), actor, String(fd.get("userId")));
    assertCan(actor, "manage", "user", subjectOf(u));
    if (u.status === "inactive") throw new ForbiddenError();
    await sendLink(u, u.status === "invited" ? "invite" : "password_reset");
  });
}

export async function setRolesAction(fd: FormData) {
  await run(async () => {
    await setRoles(db(), await requireActor(), String(fd.get("userId")), rolesOf(fd));
  });
}

export async function setStatusAction(fd: FormData) {
  await run(async () => {
    await setStatus(db(), await requireActor(), String(fd.get("userId")), fd.get("status") === "inactive" ? "inactive" : "active");
  });
}

export async function assignCoordinatorAction(_: UserActionState, fd: FormData): Promise<UserActionState> {
  try {
    const actor = await requireActor();
    await assignCoordinator(db(), actor, fd.getAll("studentIds").map(String), String(fd.get("coordinatorId") || "") || null);
    revalidatePath("/manager/users");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
