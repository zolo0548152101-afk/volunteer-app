import { describe, expect, it } from "vitest";
import { isValidIsraeliId, normalizeIsraeliPhone } from "@/lib/validation/israel";

describe("תעודת זהות", () => {
  it("תקינות לפי ספרת ביקורת", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("12345")).toBe(false); // 000012345 לא תקין
  });
  it("תווים לא ספרתיים וגודל", () => {
    expect(isValidIsraeliId("12345678a")).toBe(false);
    expect(isValidIsraeliId("1234567890")).toBe(false);
    expect(isValidIsraeliId("")).toBe(false);
  });
});

describe("טלפון", () => {
  it("מנרמל פורמטים נפוצים", () => {
    expect(normalizeIsraeliPhone("050-123 4567")).toBe("0501234567");
    expect(normalizeIsraeliPhone("+972501234567")).toBe("0501234567");
    expect(normalizeIsraeliPhone("972-52-1234567")).toBe("0521234567");
    expect(normalizeIsraeliPhone("03-1234567")).toBe("031234567");
  });
  it("דוחה לא תקין", () => {
    expect(normalizeIsraeliPhone("12345")).toBeNull();
    expect(normalizeIsraeliPhone("abc")).toBeNull();
    expect(normalizeIsraeliPhone("0501234")).toBeNull();
  });
});
