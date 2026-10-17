import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { FileError, MAX_FILE_BYTES, saveAttachment, sniffType } from "@/lib/storage";

const pdf = new TextEncoder().encode("%PDF-1.4 hello");
describe("storage", () => {
  it("מזהה סוג לפי תוכן ולא לפי סיומת", () => {
    expect(sniffType(pdf)).toBe("pdf");
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpg");
    expect(sniffType(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });
  it("דוחה קובץ מזויף וקובץ גדול", async () => {
    await expect(saveAttachment(new File(["<html>"], "a.pdf", { type: "application/pdf" }), "o")).rejects.toMatchObject({ code: "bad_file" });
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "a.pdf", { type: "application/pdf" });
    await expect(saveAttachment(big, "o")).rejects.toBeInstanceOf(FileError);
  });
});
