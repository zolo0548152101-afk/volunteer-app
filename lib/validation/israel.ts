/** תעודת זהות ישראלית: 5-9 ספרות, ספרת ביקורת (Luhn משוקלל 1,2) */
export function isValidIsraeliId(input: string): boolean {
  const s = input.trim();
  if (!/^\d{5,9}$/.test(s)) return false;
  const id = s.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(id[i]) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** טלפון ישראלי נייד/קווי, עם או בלי מקפים ו-+972. מחזיר ערך מנורמל 0XXXXXXXXX או null */
export function normalizeIsraeliPhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, "");
  if (d.startsWith("+972")) d = "0" + d.slice(4);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  return /^0(5\d|[2-4689]|7\d)\d{7}$/.test(d) ? d : null;
}
