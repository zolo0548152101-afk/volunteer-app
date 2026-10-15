import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { runReminders } from "@/lib/services/cron";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runReminders(db()));
}
