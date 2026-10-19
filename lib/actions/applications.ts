"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { decideApplication } from "@/lib/services/applications";
import { NotFoundError } from "@/lib/services/users";
import { str } from "./_form";

export async function decideApplicationAction(fd: FormData) {
  const userId = str(fd, "userId");
  const decision = str(fd, "decision") === "rejected" ? "rejected" : "approved";
  const back = ["pending", "approved", "rejected"].includes(str(fd, "tab")) ? str(fd, "tab") : "pending";
  let error: string | undefined;
  try { await decideApplication(db(), await requireActor(), userId, decision); } catch (e) {
    error = e instanceof ForbiddenError ? "forbidden" : e instanceof NotFoundError ? "not_found" : (console.error(e), "generic");
  }
  redirect(error ? `/manager/applicants?status=${back}&error=${error}` : `/manager/applicants?status=${back}&done=${decision}`);
}
