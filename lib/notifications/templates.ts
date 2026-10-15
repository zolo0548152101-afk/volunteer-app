/**
 * תבניות הודעה (PRD סעיף 8), עברית ואנגלית. טקסט עניני וקצר. משתנים בצורת {name}.
 * קישורים מוזרקים כ-data.link. הספקים (מייל / SMS / וואטסאפ) מקבלים את הנושא והגוף המוכנים.
 */
import type { Locale } from "@/i18n/config";

type Text = { subject: string; body: string };
type Entry = Record<Locale, Text>;

export const TEMPLATES = {
  "auth.invite": {
    he: { subject: "הוזמנת למערכת המלגאים", body: "הוזמנת להצטרף למערכת. כדי לקבוע סיסמה ולהיכנס: {link}" },
    en: { subject: "You're invited to the scholarship system", body: "You were invited to join. To set a password and sign in: {link}" },
  },
  "auth.reset": {
    he: { subject: "איפוס סיסמה", body: "התקבלה בקשה לאיפוס סיסמה. הקישור תקף לזמן קצר: {link}. אם לא ביקשתם, אפשר להתעלם." },
    en: { subject: "Password reset", body: "A password reset was requested. The link is valid for a short time: {link}. If it wasn't you, ignore this." },
  },
  "placement.student": {
    he: { subject: "השיבוץ שלך עודכן", body: "הראיון הסתיים והשיבוץ שלך נקבע. הפרטים והדיווח בחשבון שלך במערכת." },
    en: { subject: "Your placement was updated", body: "The interview is done and your placement is set. Details and reporting are in your account." },
  },
  "placement.coordinator": {
    he: { subject: "סטודנט חדש אצלך", body: "שובץ אליך סטודנט או שהשיבוץ שלו השתנה. הפרטים בכרטיס הסטודנט במערכת." },
    en: { subject: "A student was assigned to you", body: "A student was assigned to you or their placement changed. See the student card." },
  },
  "report.submitted": {
    he: { subject: "דיווח שעות חדש לאישור", body: "{student} הגיש דיווח שעות שממתין לאישורך." },
    en: { subject: "New hour report to approve", body: "{student} submitted an hour report waiting for your approval." },
  },
  "report.approved": {
    he: { subject: "הדיווח שלך אושר", body: "דיווח השעות שלך אושר." },
    en: { subject: "Your report was approved", body: "Your hour report was approved." },
  },
  "report.rejected": {
    he: { subject: "הדיווח שלך נדחה", body: "דיווח השעות שלך נדחה. הערת הרכז: {notes}" },
    en: { subject: "Your report was rejected", body: "Your hour report was rejected. Coordinator's note: {notes}" },
  },
  "report.needs_correction": {
    he: { subject: "נדרש תיקון בדיווח", body: "הרכז ביקש תיקון בדיווח השעות שלך. הערת הרכז: {notes}" },
    en: { subject: "Your report needs a fix", body: "The coordinator asked for a fix to your hour report. Coordinator's note: {notes}" },
  },
  "report.escalation": {
    he: { subject: "דיווח ממתין לאישור כבר {days} ימים", body: "הדיווח של {student} ממתין לאישור כבר {days} ימים. נא לטפל בו בתיבת הדיווחים." },
    en: { subject: "A report has been pending for {days} days", body: "{student}'s report has been waiting for approval for {days} days. Please handle it in the reports inbox." },
  },
  "student.inactivity": {
    he: { subject: "לא דיווחת זמן מה", body: "לא התקבל ממך דיווח שעות כבר {days} ימים. אם יש בעיה, אפשר לדווח היעדרות או לפנות לרכז." },
    en: { subject: "You haven't reported for a while", body: "We haven't received an hour report from you in {days} days. If something's wrong, report an absence or contact your coordinator." },
  },
  "coordinator.digest": {
    he: { subject: "סיכום יומי: {count} דיווחים ממתינים", body: "יש {count} דיווחי שעות שממתינים לאישורך." },
    en: { subject: "Daily summary: {count} reports pending", body: "{count} hour reports are waiting for your approval." },
  },
} satisfies Record<string, Entry>;

export type TemplateId = keyof typeof TEMPLATES;
export const isTemplate = (id: string): id is TemplateId => id in TEMPLATES;

const fill = (s: string, data: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => (data[k] === undefined || data[k] === null ? "" : String(data[k])));

/** מחזיר null לתבנית לא מוכרת, כדי ש-notify יוכל להמשיך ולרשום אזהרה */
export function renderTemplate(id: string, data: Record<string, unknown> = {}, locale: Locale): Text | null {
  if (!isTemplate(id)) return null;
  const t = TEMPLATES[id][locale];
  return { subject: fill(t.subject, data), body: fill(t.body, data) };
}
