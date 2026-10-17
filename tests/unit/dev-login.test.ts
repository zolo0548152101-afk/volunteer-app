import { afterEach, describe, expect, it, vi } from "vitest";
import { devLoginEnabled } from "@/lib/dev-login";

afterEach(() => vi.unstubAllEnvs());

describe("devLoginEnabled", () => {
  it("כבויה כברירת מחדל", () => {
    vi.stubEnv("ENABLE_DEV_LOGIN", "");
    expect(devLoginEnabled()).toBe(false);
  });
  it("פועלת עם הדגל בסביבת Preview ובפיתוח", () => {
    vi.stubEnv("ENABLE_DEV_LOGIN", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(devLoginEnabled()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    expect(devLoginEnabled()).toBe(true);
  });
  it("לעולם לא בייצור, גם אם הדגל הוגדר בטעות", () => {
    vi.stubEnv("ENABLE_DEV_LOGIN", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(devLoginEnabled()).toBe(false);
  });
});
