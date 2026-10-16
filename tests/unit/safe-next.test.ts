import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (מניעת open-redirect)", () => {
  it("משאיר נתיבים פנימיים, כולל שאילתה", () => {
    expect(safeNext("/student")).toBe("/student");
    expect(safeNext("/reports?status=pending")).toBe("/reports?status=pending");
  });
  it("חוסם כתובות זרות ופורמטים עוקפים", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "javascript:alert(1)", "/\t/evil.com", "/\n/evil.com", "", null, undefined]) {
      expect(safeNext(bad as string | null | undefined), String(bad)).toBe("/");
    }
  });
});
