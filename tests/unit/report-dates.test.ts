import { describe, expect, it } from "vitest";
import { lastContractDay } from "@/lib/services/report-dates";

describe("lastContractDay", () => {
  // 2026-10-16 הוא יום שישי
  it("היום, אם היום הוא יום חוזה", () => {
    expect(lastContractDay(["fri"], "2026-10-16")).toBe("2026-10-16");
  });
  it("יום החוזה הקרוב שעבר (א'-ג' ביום שישי → יום שלישי)", () => {
    expect(lastContractDay(["sun", "mon", "tue"], "2026-10-16")).toBe("2026-10-13");
  });
  it("עובר גבול חודש ושנה", () => {
    expect(lastContractDay(["thu"], "2027-01-01")).toBe("2026-12-31"); // 1.1.2027 הוא שישי
    expect(lastContractDay(["mon"], "2026-11-01")).toBe("2026-10-26"); // 1.11 הוא יום ראשון
  });
  it("בלי ימים בחוזה: היום", () => {
    expect(lastContractDay([], "2026-10-16")).toBe("2026-10-16");
  });
});
