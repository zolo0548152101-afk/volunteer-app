# תיקונים אחרי ביקורת Fable (שלבים 2–9)

מקור: `docs/review-stages-2-9.md`. כל תיקון עם בדיקת רגרסיה. מצב אחרי התיקונים: lint ו-typecheck נקיים · unit 91 · integration 139 · e2e ירוק (desktop+mobile).
ביקורת Fable חוזרת על התיקונים עדיין לא רצה.

## 🔴 חובה: הכול תוקן

| # | ממצא | תיקון | בדיקה |
|---|---|---|---|
| 1 | שיבוץ למקום סגור/מושהה | `loadWindows` מחשיב חלון במקום לא-פעיל כלא פעיל (`window_inactive`); `finalizeInterview` נועל את שורות המקומות (`FOR SHARE`) מול `updatePlace` | `interviews.test.ts` "אי אפשר לסגור ראיון אל חלון של מקום שאינו פעיל" |
| 2 | מראיין מחליף/מנתק רכז | `assignCoordinator`: מי שאינו מנהל משייך רק סטודנט בלי רכז, ולא מנתק | `users.test.ts` "מראיין לא מחליף ולא מנתק…" |
| 3 | כניסה/איפוס חוצי-ארגון | `resolveLogin` (service): הסיסמה מכריעה בין חשבונות באותו מייל; איפוס שולח לכל חשבון תואם; אינדקס `lower(email)` (מיגרציה 0004, הורצה) | `users.test.ts` "כניסה כשאותו מייל קיים בכמה ארגונים" |
| 4 | בית סטודנט ריק | `studentHome` + דף חדש: כפתור דיווח גדול, פס התקדמות עם אבני דרך והפעימה הבאה, חוזה פעיל, 5 דיווחים אחרונים | e2e "בית הסטודנט…" + צילום מובייל |
| 5 | טופס דיווח | קומפוננטת לקוח: 3 שדות גלויים (שיבוץ, תאריך, שעות), שעות/הערות מקופלות, תאריך = יום החוזה האחרון (`lastContractDay`), החלפת שיבוץ מעדכנת ברירות מחדל, מתג היעדרות בתוך הטופס, שדות 16px/44px | `report-dates.test.ts` (4) + e2e "טופס הדיווח…" ו"סטודנט מדווח…" |
| 6 | ביטול אישור | `approved_hours` חוזר ל-`reported_hours`; תבנית `report.unapproved` (עברית/אנגלית); `TemplateId` כטיפוס; `notify` מחזיר `unknown_template` ולא שולח ריק; רכז לא מאשר יותר ממה שדווח | `reports.test.ts` (2 חדשות/מורחבות), `notify.test.ts`, `templates.test.ts` |
| 7 | גרף שבור ב-RTL | `direction: ltr` על ה-SVG + `unicode-bidi: plaintext` לתוויות | e2e (בדיקת direction) + צילום |
| 8 | גלילה אופקית בהגדרות | `grid-cols-2` במובייל, העמודות רק מ-`sm:` | e2e "אין גלילה אופקית בהגדרות ובלוח הבקרה" |
| 9 | 404/שגיאה באנגלית | `app/not-found.tsx`, `app/error.tsx` עם i18n (he/en); `ForbiddenError` בעמודי `[id]` → 404 | e2e "דף לא קיים מציג 404 בעברית" |

## החלטות שנרשמו
- מייל כפול בין ארגונים (#3): `prd-decisions.md`.

## 🟠 "כדאי": סבבים שבוצעו

| סבב | מה | commit |
|---|---|---|
| A | דיווח על שיבוץ שהסתיים; בדיקת תקופה לפי `startedAt/endedAt`; הסלמה מתחילה מחדש אחרי ביטול אישור; דוח מקומות שומר מקומות לא-פעילים עם שעות | "reports on ended placements…" |
| B | הגבלת קצב (כניסה לפי מייל/IP, איפוס, הרשמה; טבלת `auth_attempts`, מיגרציה 0005); כותרות אבטחה; שדות חובה מותאמים בהרשמה; טיוטת שיבוץ מחדש לצוות בלבד | "rate limiting…" |
| C | תיבת רכז: סינון ב-SQL לפי הרכז לפני `limit`, מסננים (סטודנט/מקום/חודש), אישור מרובה (`approveMany`), תאריכים מעוצבים; `loadValuesMany` (בלי N+1); אינדקסים (מיגרציה 0006) | `8a25609` |
| D (חלקי) | `SubmitButton` (נעילה ו"שולחים…" בזמן שליחה, נגד לחיצה כפולה) בכל טפסי ה-server-action | `8a25609` |

הערה: `loading.tsx` ברמת קבוצת `(app)` נבדק והוסר: הוא מסמן סטרימינג והופך 404 ל-200, וזה שבר בדיקת אבטחה.

| D2 | תאריכים מעוצבים לפי השפה בכל הדפים (`lib/date-format.ts`: תעודה, תור מראיין, דיווחים שלי, כרטיס סטודנט); טווחי שעות ב-`dir="ltr"` עם מקף ארוך; `max` בשדה השעות המאושרות = מה שדווח; multi_select כ-`fieldset`/`legend`; צ'קבוקסים 20px ושדות 44px; יעד דילוג (`#content`) ניתן למיקוד | `ebdff22` |
| D3 | שגיאות מחוברות לשדות (`aria-invalid` + `aria-describedby` בטפסי כניסה/הרשמה/איפוס/הזמנה, לפי קוד השגיאה); הודעות אחרי redirect (`?error`, `?saved`) מקבלות פוקוס (`components/flash.tsx`) כדי שקורא מסך יקריא אותן | `7d120ae` |
| D4 | פאנל "שני הבנקים" חי (W16): `components/interview/live-banks.tsx` מחשב מחדש בזמן הקלדה עם אותה `evaluateContract` של השרת. שיבוצי אחרים מגיעים ללקוח מסוכמים לשורה לכל חלון, בלי מזהי סטודנטים. השרת ממשיך להחליט בשמירה ובסגירה | `ebdff22` |

הערת עיצוב: `loading.tsx` ברמת קבוצת `(app)` נבדק והוסר: הוא מסמן סטרימינג והופך 404 ל-200, וזה שבר בדיקת אבטחה. אקסל כבר RTL (`rightToLeft` ב-`lib/export/xlsx.ts`); "כן/לא" בדוחות נשאר בעברית במכוון (הדוחות ללא locale; ברירת המחדל עברית).

## מה נשאר
- `run`/`code` ב-actions שונים בפועל ולכן לא אוחדו, `test.skip` ידניים (8), העלאת קבצים וספקי הודעות אמיתיים (מחכים למפתחות).
- העלאת קובץ (Vercel Blob), ספקי הודעות אמיתיים.

| E1 | `app/global-error.tsx` (גיבוי כשהמעטפת קורסת, דו-לשוני, בלי תלות ב-i18n); `error.tsx` עבר ל-`retry()` (ב-Next הזה `reset` לא טוען מחדש); מכסת הרשמה 30/שעה לכתובת (NAT סלולרי); כשל ולידציה בהרשמה לא נספר במכסה | הקומיט הנוכחי |
| E2 | אישור מרובה שולח הודעה אחת לסטודנט (`report.approved_many`, או הרגילה אם דיווח יחיד); `decide` פוצל ל-`applyDecision` (בלי הודעה) + הודעה. בדיקת אינטגרציה עם ספק לכידה | `feat(reports)` |
| E3 | W28: `safeNext` הועבר ל-`lib/safe-next.ts` עם בדיקת יחידה (כולל `/\\evil.com` ותווי בקרה, שהגרסה הקודמת לא חסמה). W28 טאוטולוגיות: בדיקת ההיעדרות באנליטיקה **לא רצה בכלל** (`if (r)` על נתון שאין ב-seed); נכתבה מחדש ויוצרת היעדרות בעצמה. בדיקת הפעימות נוקתה מ-`toContain("")` | הקומיט הנוכחי |
| E4 | W5: `logSend` מקבל `db` ולא טרנזקציה, ונקרא מיד אחרי כל שליחה, כך שכשל מאוחד בהרצה לא מוחק רישום של מייל שכבר יצא. עותקי מנהל נרשמים ביומן (`report_escalation_copy`, `student_inactivity_copy`) ולא נספרים כשליחה לנמען הראשי. בדיקה חדשה ב-`cron.test.ts` | `fix(cron)` |
| E5 | ✅ **בוצע (17.10, באישור המשתמש).** פעולה חדשה `reassign` ב-`permissions.ts` (מנהל אוטומטית; רכז `assigned`); `interviews.ts authorize` ו-`canReassign` בכרטיס הסטודנט משתמשים בה במקום `roles.includes`; snapshot המטריצה עודכן ובדיקות ל-reassign לפי תפקיד. *היסטוריה:* **W24 לא בוצע בסבב הקודם.** בדיקת התפקיד ב-`interviews.ts:54` (`manager`/`coordinator` בלבד) היא שמוציאה מראיין משיבוץ מחדש; `can` לבדו לא עושה זאת כי ל-interviewer יש `create placement`. תיקון נקי = פעולת `reassign` חדשה ב-`permissions.ts`, וזה שינוי הרשאות שדורש אישור (WORKPLAN כלל 2). **שאלה למשתמש/Fable** | – |
| E6 | W26 כבר היה מטופל (`forbidOnly`, `retries`, `trace`, `pnpm build` ב-webServer); נשארו `test.skip` ידניים (8), לא מטופלים. W29: `login()` של 7 קבצי e2e הוחלף בעוזר אחד `tests/e2e/helpers.ts` | הקומיט הנוכחי |
| E7 | W27: `tests/e2e/workflows.spec.ts` (desktop): הזמנה → קביעת סיסמה (חד-פעמי) → כניסה → איפוס סיסמה; דיווח → החזרה לתיקון (בלי הערה נחסם) → תיקון → אישור → ביטול אישור של מנהל (רכז לא רואה את הכפתור); cron עם הסוד הנכון מחזיר סיכום (ה-webServer קיבל `CRON_SECRET` לבדיקות); דוחות מנהל רכזים/חודשים/היעדרויות. האסימון נוצר בבדיקה ישירות ב-SQL כי הגולמי נשלח רק במייל | `11910e4` |
| E8 | W29: `lib/actions/_form.ts` (`str`, `trimmed`, `num`, `numOrNull`) ו-`lib/services/_util.ts` (`clean`, `todayIL`, `isDate`, `slug`) במקום עותקים ב-4 קבצי actions ו-6 שירותים; `DAYS` של students מיובא מ-places | `refactor` |
| E9 | מצב כהה נבדק בצילומי מסך (לוח בקרה, ניווט, תיבת אישורים; מחשב וטלפון): תקין. צבעים קשיחים ישנים (`text-red-700`, `border-green-300` וכו', 31 מופעים) הוחלפו בטוקנים הסמנטיים (`text-bad-fg`, `border-ok/50`...), כי "דחייה" כמעט לא נראתה בכהה | `style` |

### לבדיקת Fable (מוצ"ש) – נבדק 17.10, שני הפריטים אושרו (ראו `docs/review-checkpoint-7.md` ✅ הרשאות)
- ~~**W24 פתוח:** ניסיון להוסיף פעולה `reassign` ל-`lib/permissions.ts` נחסם על ידי ה-classifier של הסביבה (שינוי הרשאות). לא עקפתי. התכנון: `Action` חדש `reassign`; מנהל מקבל אוטומטית (`allActions`); רכז `reassign placement assigned`; ב-`interviews.ts` `authorize` להחליף את `roles.includes` ב-`assertCan(actor, "reassign", "placement", subject)`; ב-`students/[id]/page.tsx` `canReassign = can(actor, "reassign", "placement", {...})`; לעדכן את `permissions-matrix.test.ts`. אחרי שמאשרים, 20 דקות עבודה.~~ בוצע, ראו E5. לבדיקתך: שינוי המטריצה (`lib/permissions.ts`, 4 שורות) והבדיקות ב-`permissions-matrix.test.ts`.
- בעת בדיקת E7: ב-`reports` פעולת `unapprove` חוזרת ל-`/reports` (ממתינים) ולא ל-`status=approved` שממנה נלחצה. כנראה כמתוכנן (הדיווח עבר לממתינים), אבל כדאי לאשר כהתנהגות רצויה.
| E10 | **הקמת ייצור:** נוצר Blob פרטי `volunteer-app-files` (fra1) ו-`BLOB_READ_WRITE_TOKEN` חובר ל-Vercel (production/preview/development). `DATABASE_URL` של production הוגדר (Neon `main`, בסיס `volunteer`). `lib/db/bootstrap.ts` + `scripts/bootstrap.ts` (`pnpm db:bootstrap`) מקימים ארגון אמיתי בלי נתוני דמו: הגדרות, כללי התראה, רשימות בחירה, מנהל במצב "מוזמן" וקישור הזמנה חד-פעמי; מסרב לרוץ על מסד שיש בו ארגון. בדיקת אינטגרציה. **מיגרציות על `main` לא הורצו:** ה-classifier של הסביבה חסם הרצה על הייצור, ולא עקפתי | הקומיט הנוכחי |

## ביקורת Fable על התיקונים (16.10.2026)

נסקרו 11 הקומיטים מאז דוח הביקורת: הדיפים של כל השירותים הרגישים (reports, credentials, auth, rate-limit, interviews, users, capacity, analytics, students), הפעולות, טופס הדיווח ובית הסטודנט, והבדיקות שנוספו. ריצה מלאה: lint/typecheck נקיים · integration 139 · e2e 84 עברו, 6 דולגו (desktop+mobile).

**מה טוב:** תשעת תיקוני ה-🔴 נכונים ומכוסים בבדיקות אמיתיות. היקף תיבת הרכז באמת ב-SQL לפני ה-limit. נעילת המקומות ב-finalize (FOR SHARE) מול `updatePlace` (FOR UPDATE) בלי מעגל deadlock. `resolveLogin` מבצע לפחות בדיקת סיסמה אחת גם כשאין מועמד.

### ממצא לתיקון
| # | ממצא | למה | תיקון מוצע |
|---|---|---|---|
| 🟠 F1 ✅ תוקן (`lib/auth.ts`: המגבלה ב-`authorize`, שגיאת `RateLimited` עם `code=rate_limited`; e2e חדש ב-`auth.spec.ts` מרים שרת שני עם המגבלה פועלת ומוודא שה-POST הישיר נחסם אחרי 8 כשלונות) | **הגבלת הקצב של הכניסה ניתנה לעקיפה.** היא ב-`loginAction` בלבד, אבל Auth.js חושף `POST /api/auth/callback/credentials` ישירות (ו-`/api/auth` ציבורי ב-proxy). עם CSRF token מ-`/api/auth/csrf` אפשר לנסות סיסמאות בלי מגבלה | ההגנה היחידה נגד brute-force לא חלה על המסלול הישיר | להעביר את `isLimited`/`recordAttempt`/`clearAttempts` לתוך `authorize(credentials, request)` ב-`lib/auth.ts` (יש שם גישה לכותרות); להשאיר ב-action רק את הודעת `rate_limited` למשתמש. בדיקת e2e: POST ישיר ל-callback אחרי המכסה מחזיר כישלון |

### הערות (🟡)
- מכסות per-IP: הסטודנטים נרשמים מהבית, כל אחד מכתובת משלו, אז 10 הרשמות/שעה לכתובת בסדר. חריג: NAT סלולרי (לקוחות של אותו מפעיל חולקים כתובת); להעלות הרשמה ל-~30/שעה כפשרה. המכסה לפי מייל נשארת ההגנה העיקרית.
- `recordAttempt` בהרשמה נרשם גם על כשל ולידציה (סיסמאות לא תואמות) — לרשום רק אחרי שהטופס תקין.
- `approveMany` שולח הודעה לסטודנט על כל דיווח (עד 200) — עדיף הודעה מאוחדת לכל סטודנט.
- תיבת הרכז: שדה "שעות מאושרות" עדיין `max="24"`, בזמן שהשרת חוסם מעל השעות שדווחו → `max={r.reportedHours}`.
- "כן/לא" ו-`labelHe` באנליטיקה ובאקסל קשיחים (ברשימת D).

## ביקורת Fable על E1–E3 (16.10.2026, אחה"צ)

נסקרו שלושת הקומיטים `dfcc27b`, `c3b7281`, `a5c29a7` (דיף מלא של `lib/`, `app/error*.tsx`, הבדיקות). **עבר, בלי "חובה לתקן".**

- `approveMany`: הפיצול ל-`applyDecision` נכון; ההודעה המאוחדת נשלחת אחרי כל ההחלטות, לכל סטודנט פעם אחת, ודיווח יחיד מקבל את התבנית הרגילה. הבדיקה לוכדת את השליחה דרך `registerProvider` ומנקה אחריה. `decide` שמר על ההתנהגות הקודמת.
- `safeNext`: המעבר ל-`lib/safe-next.ts` (בלי `server-only`) נכון, וחסימת `/\` ותווי בקרה היא שיפור אמיתי. הגנה שנייה קיימת ממילא: ה-`redirect` callback של Auth.js מקבל רק כתובות באותו origin. `%5C` כבר מפוענח על ידי Next לפני שהערך מגיע לטופס, אז מכוסה.
- `global-error.tsx`: תקין (`retry` קיים בגרסת Next הזו, `<title>` מורם ל-head ב-React 19). טקסט קשיח במכוון, כי אין i18n מתחת ל-layout שקרס.
- בדיקת ההיעדרות באנליטיקה: הממצא ש-`if (r)` הסתיר בדיקה שלא רצה כלל הוא החשוב בסבב הזה. הכתיבה מחדש בודקת את הדבר הנכון (הפרש של 4 שעות בדיוק).
- כדאי (לא חוסם): `notifyUser` שנכשל ב-`approveMany` זורק אחרי שהאישורים כבר נשמרו; זה היה כך גם קודם ב-`decide`. כשיחובר ספק אמיתי, לעטוף שליחות ב-try/catch עם רישום ל-`notification_log` במקום לזרוק.

שלב 10 (לוח הבקרה והניווט) נבנה על ידי Fable ולא נסקר על ידי מודל אחר; נשאר לקבלה הסופית.

## תיקונים אחרי CHECKPOINT 7 (17.10.2026, ערב) – Sonnet

מקור: `docs/review-checkpoint-7.md`, לפי "הנחיות לסונט". כל שורה: ממצא → קומיט → בדיקה.

| ממצא | תיקון | קומיט | בדיקה |
|---|---|---|---|
| 🔴 1 כניסה בייצור (HTTPS) שבורה | `lib/session-token.ts`: `readSessionToken` מעביר `secureCookie` לפי `x-forwarded-proto`; בשימוש ב-`getActor` וב-`logoutAction` | `d13c924` | `session-token.test.ts` (4). **אומת ידנית על preview אמיתי:** csrf → callback → עוגיית `__Secure-authjs.session-token` → `/manager` 200; בלי עוגייה 307 ל-`/login` |
| 🔴 2 כשל שליחת הזמנה/איפוס מוצג כהצלחה | `sendLink` מחזיר `NotifyResult` ורושם ל-`notification_log` (`auth.invite`/`auth.reset`); הזמנה/שליחה מחדש מציגות `email_failed`; איפוס סיסמה ממשיך להחזיר תשובה אחידה (ובלבד שנרשם) | `ac5201b` | `auth-links.test.ts` (אינטגרציה: ספק שזורק → `ok=false` ביומן) |
| O1 אישור מרובה סופר היעדרות | `approveMany` מדלג על היעדרויות (`skipped`), בטופס אין צ'קבוקס להיעדרות | `43c311c` | `reports.test.ts` "אישור מרובה מדלג על היעדרות" |
| O2 בדיקות אינטגרציה עלולות לשלוח מייל אמיתי | `RESEND_API_KEY=""` ב-`vitest.integration.config.mts` | `9852b7e` | – (קונפיג) |
| O3 קונסול מדפיס טוקנים | `redactData` ללינק/טוקן; בייצור בלי מפתח Resend → `no_provider` | `3dbfea9` | `notify.test.ts` (2 חדשות) |
| O4 seed על מסד ייצור | `scripts/seed.ts` מסרב אם יש ארגון, אלא אם `ALLOW_SEED=1` | `639d09d` | – (סקריפט) |
| O5 מנהל בטלפון בלי הגדרות/משתמשים | פריט "עוד" בניווט התחתון (`more-menu.tsx`): נפתח, נסגר במעבר עמוד וב-Esc | `a88a376` | e2e "מנהל בטלפון מגיע להגדרות ולמשתמשים דרך 'עוד'" (mobile) |
| O6 ניגודיות תג המונה | `bg-warn-bg text-warn-fg` | `a88a376` | axe ב-a11y/dashboard e2e |
| O7 dir=ltr (W23) | email/tel/password/time | `6b39070` | axe + e2e קיימים |
| O8 אזור פונקציות | `vercel.json` → `regions: ["fra1"]` | `523d74e` | נבדק אחרי פריסה (ראו למטה) |
| O9 מיגרציות ייצור | **נוהל כתוב** ב-README ("ייצור"), לא בשלב הבנייה: מיגרציה הרסנית לא צריכה לרוץ בלי אישור. תוקנה גם הטענה השגויה "push = פריסה": הפרויקט לא מחובר ל-git | `523d74e` | – |
| 🟡 (חלק) | `isDate` לא מתגלגל (30.2); `esc` + regex הקישור במייל; `DISABLE_RATE_LIMIT` לא פועל בייצור; סיסמה ≤128; מייל המנהל ב-bootstrap באותיות קטנות; `logSend` לא מפיל הרצה | `17a2915` | `util.test.ts`, `email-resend.test.ts` |
| 🟡 בדיקות | לוח בקרה: ערכים מדויקים (תקועים, 30 יום, חדשים החודש, תפוסה, היקף רכז); cron: כשל בעותק מנהל נרשם `ok=false` | `fc89968` + הבא | `analytics.test.ts` (+3), `cron.test.ts` (+1) |

### פעולות של המשתמש (לא קוד)
- [ ] **O10:** להחליף את סיסמת ה-role `volunteer_owner` ב-Neon (ענף `main`) ולעדכן `DATABASE_URL` ב-Vercel (production); למחוק את מפתח Resend `volunteer-app production` וליצור חדש (sending-only) ולעדכן `RESEND_API_KEY`; ליצור מחדש את `BLOB_READ_WRITE_TOKEN` כ-sensitive.
- [ ] **🔴 3:** לאמת דומיין שולח ב-Resend (DNS ב-Vercel עבור `yaminwin26.app`), ואז לשנות `EMAIL_FROM` לכתובת בדומיין. עד אז מייל יוצא רק לבעל חשבון Resend, וכל הזמנה לאחרים תיכשל (עכשיו מוצג למנהל כ-`email_failed`).
- [ ] להגדיר `A11Y_CONTACT_EMAIL` בייצור.

### נשאר מה-🟡 (לא נעשה בסבב הזה)
סטיית אזור זמן בגבולות "החודש/30 יום" ב-SQL; כפילות לפי `placementId`; audit לניתוק סטודנטים ב-`setRoles`; `editable` במראיין בטיוטת שיבוץ-מחדש; `aria` של מונה התיבה; `aria-current` ב-analytics; מפתחות i18n מתים ו-plural ל-0; גודל 16px בשדות נוספים; `color-scheme`/`prefers-reduced-motion`; `bootstrap.test.ts`, `workflows.spec.ts` cleanup, 2 `test.skip` בלי הערה.

