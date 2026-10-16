/** רק נתיבים פנימיים; מונע הפניה לאתר זר דרך ?next= */
export function safeNext(next: string | null | undefined): string {
  // גם "/\\evil.com" נחשב על ידי דפדפנים כ-"//evil.com", ותווי בקרה מוסרים בפענוח הכתובת
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
