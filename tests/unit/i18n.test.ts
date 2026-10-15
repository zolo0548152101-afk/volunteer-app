import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";
import { dirOf, isLocale } from "@/i18n/config";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("i18n", () => {
  it("he.json ו-en.json חולקים בדיוק אותם מפתחות", () => {
    expect(keys(en).sort()).toEqual(keys(he).sort());
  });

  it("אין ערך ריק באף שפה", () => {
    const empty = (o: Record<string, unknown>) =>
      keys(o).filter((k) => {
        const v = k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)[p], o);
        return typeof v !== "string" || v.trim() === "";
      });
    expect(empty(he)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });

  it("עברית RTL, אנגלית LTR", () => {
    expect(dirOf("he")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(isLocale("he")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
