import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { notificationLog } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { sendLink } from "@/lib/services/auth-links";
import { registerProvider, resetProviders } from "@/lib/services/notify";

let s: Awaited<ReturnType<typeof seedDemo>>;
beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `קישורים ${Date.now()}` });
});
afterEach(() => resetProviders());
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

const u = () => ({ id: s.students[0].id, organizationId: s.organizationId, email: "x@example.test", locale: "he" });
const logs = (kind: string) => db().select().from(notificationLog).where(and(eq(notificationLog.entityId, s.students[0].id), eq(notificationLog.kind, kind)));

describe("sendLink", () => {
  it("כשל בשליחה מוחזר כ-ok:false ונרשם ביומן", async () => {
    registerProvider("email", { send: async () => { throw new Error("resend_403: only own address"); } });
    const r = await sendLink(u(), "invite");
    expect(r.ok).toBe(false);
    const rows = await logs("auth.invite");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ok: false, channel: "email" });
    expect(rows[0].error).toContain("resend_403");
  });
  it("הצלחה נרשמת עם ok:true", async () => {
    registerProvider("email", { send: async () => {} });
    const r = await sendLink(u(), "password_reset");
    expect(r.ok).toBe(true);
    expect((await logs("auth.reset"))[0]).toMatchObject({ ok: true });
  });
});
