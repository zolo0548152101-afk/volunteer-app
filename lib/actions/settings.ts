"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { saveGeneral, saveLookup, saveProgram, saveRule, saveYear, SettingsError } from "@/lib/services/settings";
import { saveField } from "@/lib/services/custom-field-admin";
import type { Channel } from "@/lib/services/notify";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => (str(fd, k) === "" ? NaN : Number(str(fd, k)));

async function run(section: string, fn: () => Promise<void>) {
  let error: string | undefined;
  try { await fn(); } catch (e) {
    if (e instanceof SettingsError) error = e.code;
    else if (e instanceof ForbiddenError) error = "forbidden";
    else { console.error(e); error = "generic"; }
  }
  redirect(error ? `/manager/settings?error=${error}#${section}` : `/manager/settings?saved=${section}#${section}`);
}

export async function saveGeneralAction(fd: FormData) {
  await run("general", async () => { await saveGeneral(db(), await requireActor(), { tolerance: num(fd, "tolerance"), languages: fd.getAll("languages").map(String) }); });
}

export async function saveYearAction(fd: FormData) {
  await run("year", async () => {
    await saveYear(db(), await requireActor(), { id: str(fd, "id") || undefined, name: str(fd, "name"), startDate: str(fd, "startDate"), endDate: str(fd, "endDate"), reportDeadline: str(fd, "reportDeadline") || null, makeCurrent: fd.has("makeCurrent") ? true : undefined });
  });
}

export async function saveProgramAction(fd: FormData) {
  await run("programs", async () => {
    await saveProgram(db(), await requireActor(), { id: str(fd, "id") || undefined, name: str(fd, "name"), requiredHours: num(fd, "requiredHours"), maxHoursPerDay: str(fd, "maxHoursPerDay") === "" ? null : num(fd, "maxHoursPerDay"), milestones: String(fd.get("milestones") ?? ""), isActive: fd.has("isActive") });
  });
}

export async function saveRuleAction(fd: FormData) {
  await run("rules", async () => {
    await saveRule(db(), await requireActor(), str(fd, "kind"), {
      enabled: fd.has("enabled"), firstAfterDays: num(fd, "firstAfterDays"), maxSends: num(fd, "maxSends"), repeatEveryDays: num(fd, "repeatEveryDays"),
      channels: fd.getAll("channels").map(String) as Channel[], copyManager: fd.has("copyManager"),
    });
  });
}

export async function saveLookupAction(fd: FormData) {
  await run("lookups", async () => {
    await saveLookup(db(), await requireActor(), { id: str(fd, "id") || undefined, kind: str(fd, "kind"), labelHe: str(fd, "labelHe"), labelEn: str(fd, "labelEn"), sortOrder: Number(str(fd, "sortOrder") || 0), isActive: !fd.has("id") || fd.has("isActive") });
  });
}

export async function saveFieldAction(fd: FormData) {
  let error: string | undefined;
  try {
    await saveField(db(), await requireActor(), {
      id: str(fd, "id") || undefined, entity: str(fd, "entity"), labelHe: str(fd, "labelHe"), labelEn: str(fd, "labelEn"), type: str(fd, "type"), options: String(fd.get("options") ?? ""),
      required: fd.has("required"), visibleToRoles: fd.getAll("visibleToRoles").map(String), editableByRoles: fd.getAll("editableByRoles").map(String),
      sortOrder: Number(str(fd, "sortOrder") || 0), isActive: !fd.has("id") || fd.has("isActive"),
    });
  } catch (e) {
    if (e instanceof SettingsError) error = e.code;
    else if (e instanceof ForbiddenError) error = "forbidden";
    else { console.error(e); error = "generic"; }
  }
  redirect(error ? `/manager/custom-fields?error=${error}` : "/manager/custom-fields?saved=1");
}
