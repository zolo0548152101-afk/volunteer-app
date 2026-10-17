import { describe, expect, it } from "vitest";
import { isDate } from "@/lib/services/_util";

describe("isDate", () => {
  it("תאריך אמיתי", () => {
    expect(isDate("2026-02-28")).toBe(true);
    expect(isDate("2028-02-29")).toBe(true);
  });
  it("תאריך שלא קיים נדחה ולא מתגלגל", () => {
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDate("26-1-1")).toBe(false);
  });
});
