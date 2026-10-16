"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { createPlace, createWindow, DAYS, PlaceError, setWindowActive, updatePlace, updateWindow, type Day, type PlaceInput, type PlaceStatus, type WindowInput } from "@/lib/services/places";
import { NotFoundError } from "@/lib/services/users";
import { num, str } from "./_form";

function errorCode(e: unknown): string {
  if (e instanceof ForbiddenError) return "forbidden";
  if (e instanceof NotFoundError) return "not_found";
  if (e instanceof PlaceError) return e.code;
  if (e instanceof z.ZodError) return "bad_numbers";
  console.error(e);
  return "generic";
}

/** מריץ פעולה; בהצלחה/כישלון מפנה חזרה עם ?error= (אפשר לאחד עם הצלחה דרך ?ok=1) */
async function run(back: string, fn: () => Promise<string | void>) {
  let error: string | undefined;
  let to: string | void = undefined;
  try {
    to = await fn();
  } catch (e) {
    error = errorCode(e);
  }
  const base = to || back;
  redirect(error ? `${back}?error=${error}` : base);
}

const placeOf = (fd: FormData): PlaceInput => ({
  name: str(fd, "name"), description: str(fd, "description"), address: str(fd, "address"), city: str(fd, "city"),
  contactName: str(fd, "contactName"), contactPhone: str(fd, "contactPhone"), contactEmail: str(fd, "contactEmail"),
  category: str(fd, "category"), notes: str(fd, "notes"),
  status: (["active", "paused", "closed"].includes(str(fd, "status")) ? str(fd, "status") : undefined) as PlaceStatus | undefined,
});
const windowOf = (fd: FormData): WindowInput => ({
  label: str(fd, "label"), days: fd.getAll("days").map(String).filter((d): d is Day => (DAYS as string[]).includes(d)),
  startTime: str(fd, "startTime"), endTime: str(fd, "endTime"), hoursPerSlot: num(fd, "hoursPerSlot"), slots: num(fd, "slots"),
  taskDescription: str(fd, "taskDescription"),
});

export async function createPlaceAction(fd: FormData) {
  await run("/places", async () => `/places/${await createPlace(db(), await requireActor(), placeOf(fd))}`);
}
export async function updatePlaceAction(fd: FormData) {
  const id = str(fd, "placeId");
  await run(`/places/${id}`, async () => { await updatePlace(db(), await requireActor(), id, placeOf(fd)); });
}
export async function createWindowAction(fd: FormData) {
  const id = str(fd, "placeId");
  await run(`/places/${id}`, async () => { await createWindow(db(), await requireActor(), id, windowOf(fd)); });
}
export async function updateWindowAction(fd: FormData) {
  const id = str(fd, "placeId");
  await run(`/places/${id}`, async () => { await updateWindow(db(), await requireActor(), str(fd, "windowId"), windowOf(fd)); });
}
export async function toggleWindowAction(fd: FormData) {
  const id = str(fd, "placeId");
  await run(`/places/${id}`, async () => { await setWindowActive(db(), await requireActor(), str(fd, "windowId"), str(fd, "active") === "1"); });
}
