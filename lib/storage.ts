import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

/**
 * אחסון קבצים מצורפים (מסמך להיעדרות). פרטי: כל קריאה עוברת דרך נתיב עם בדיקת הרשאה, אין כתובת ציבורית.
 * ב-Vercel: Blob פרטי (BLOB_READ_WRITE_TOKEN). בפיתוח/בדיקות בלי הטוקן: קבצים בתיקיית .data (לא בייצור).
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const TYPES = {
  pdf: { mime: "application/pdf", magic: (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  jpg: { mime: "image/jpeg", magic: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: "image/png", magic: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { mime: "image/webp", magic: (b: Uint8Array) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
} as const;
type Ext = keyof typeof TYPES;

export class FileError extends Error {
  constructor(public code: "bad_file" | "file_too_large" | "storage_unavailable") {
    super(code);
    this.name = "FileError";
  }
}

/** סוג הקובץ נקבע לפי התוכן (magic bytes), לא לפי השם או ה-Content-Type שהלקוח שלח */
export function sniffType(bytes: Uint8Array): Ext | null {
  return (Object.keys(TYPES) as Ext[]).find((e) => TYPES[e].magic(bytes)) ?? null;
}

export const mimeOfKey = (key: string) => TYPES[(key.split(".").pop() as Ext) in TYPES ? (key.split(".").pop() as Ext) : "pdf"].mime;

const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const localPath = (key: string) => path.join(process.cwd(), ".data", "uploads", ...key.split("/"));

/** שומר קובץ מצורף ומחזיר את המפתח. זורק FileError אם הקובץ לא תקין */
export async function saveAttachment(file: File, orgId: string): Promise<string> {
  if (file.size === 0) throw new FileError("bad_file");
  if (file.size > MAX_FILE_BYTES) throw new FileError("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffType(bytes);
  if (!ext) throw new FileError("bad_file");
  const key = `attachments/${orgId}/${randomUUID()}.${ext}`;
  if (blobEnabled()) {
    await put(key, Buffer.from(bytes), { access: "private", contentType: TYPES[ext].mime, addRandomSuffix: false });
  } else if (process.env.VERCEL_ENV === "production") {
    throw new FileError("storage_unavailable");
  } else {
    await mkdir(path.dirname(localPath(key)), { recursive: true });
    await writeFile(localPath(key), bytes);
  }
  return key;
}

export async function readAttachment(key: string): Promise<{ stream: ReadableStream<Uint8Array> | Uint8Array; mime: string } | null> {
  if (blobEnabled()) {
    const r = await get(key, { access: "private" });
    return r && r.statusCode === 200 ? { stream: r.stream, mime: mimeOfKey(key) } : null;
  }
  try {
    return { stream: new Uint8Array(await readFile(localPath(key))), mime: mimeOfKey(key) };
  } catch {
    return null;
  }
}

/** מחיקה בכוונה לא קריטית: קובץ יתום עדיף על כשל בפעולה עסקית */
export async function deleteAttachment(key: string | null | undefined) {
  if (!key) return;
  try {
    if (blobEnabled()) await del(key);
    else await unlink(localPath(key));
  } catch (e) {
    console.error("[storage] delete failed", e instanceof Error ? e.message : e);
  }
}
