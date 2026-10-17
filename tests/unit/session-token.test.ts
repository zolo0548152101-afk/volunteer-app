import { describe, expect, it, beforeAll } from "vitest";
import { encode } from "next-auth/jwt";
import { isSecureRequest, readSessionToken } from "@/lib/session-token";

const SECRET = "unit-test-secret-unit-test-secret-1234";
beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
  delete process.env.AUTH_URL;
});

describe("isSecureRequest", () => {
  it("לפי x-forwarded-proto", () => {
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https,http" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "http" }))).toBe(false);
    expect(isSecureRequest(new Headers())).toBe(false);
  });
});

describe("readSessionToken", () => {
  it("קורא את העוגייה המאובטחת ב-HTTPS", async () => {
    const name = "__Secure-authjs.session-token";
    const jwt = await encode({ token: { uid: "u1" }, secret: SECRET, salt: name });
    const t = await readSessionToken(new Headers({ cookie: `${name}=${jwt}`, "x-forwarded-proto": "https" }));
    expect(t?.uid).toBe("u1");
  });
  it("קורא את העוגייה הרגילה ב-HTTP", async () => {
    const name = "authjs.session-token";
    const jwt = await encode({ token: { uid: "u2" }, secret: SECRET, salt: name });
    const t = await readSessionToken(new Headers({ cookie: `${name}=${jwt}` }));
    expect(t?.uid).toBe("u2");
  });
  it("עוגייה מאובטחת לא נקראת בבקשת HTTP (ולהפך)", async () => {
    const name = "__Secure-authjs.session-token";
    const jwt = await encode({ token: { uid: "u1" }, secret: SECRET, salt: name });
    expect(await readSessionToken(new Headers({ cookie: `${name}=${jwt}` }))).toBeNull();
  });
});
