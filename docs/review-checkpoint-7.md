# ביקורת Fable – CHECKPOINT 7 (קבלה סופית) – לסונט

תאריך: 17.10.2026 (מוצ"ש) · נבדק: commit `d0d5aaa` על `main` · ייצור: `https://volunteer.yaminwin26.app` (deployment `dpl_8goCKtmFJQ21gnJAynkZaP2atN6P`).

שיטה: שלוש סקירות עצמאיות (אבטחה והרשאות · לוגיקה עסקית ואינווריאנטים · UI/i18n/RTL/נגישות/e2e, עם דגש על שלב 10 שלא נסקר מעולם), סקירת תפעול וייצור שלי (Vercel, Neon, Resend, דומיין, סודות), וריצה מלאה של כל הבדיקות. כל ממצא 🔴/🟠 אומת בקוד; הממצא החמור ביותר שוחזר בפועל מול פריסת HTTPS. מה שלא אומת מסומן.

**מצב הרצה (main, ריצה מלאה):** typecheck ✅ · lint ✅ · unit 96 ✅ · integration 145 ✅ · e2e 97 ✅ / 11 דולגו (desktop+mobile, 8.1 דק').

## שורה תחתונה

הקוד עצמו במצב טוב: כל ממצאי ה-🔴 מהביקורת הקודמת תוקנו נכון, האינווריאנטים של ה-PRD מתקיימים (reported_hours, רק approved נספר, קיבולת מחושבת, מכונת מצבים, cron פעם אחת), ההרשאות אחידות (כולל `reassign` החדש), ואין סודות בריפו. שלב 10 (לוח בקרה וניווט) בנוי טוב מבחינת i18n, נגישות ו-RTL.

**לא עבר קבלה סופית**, בגלל ממצא חוסם אחד שלא יכול היה להתגלות בבדיקות המקומיות: **בייצור (HTTPS) אי אפשר להיכנס.** Auth.js שומר את העוגייה בשם `__Secure-authjs.session-token`, אבל `getActor()` קורא `getToken` בלי `secureCookie`, מחפש `authjs.session-token`, ומחזיר null. שוחזר בפועל על פריסת preview (ראו 🔴 1). בלי התיקון הזה הקישור שנשלח למנהל יוביל ללולאת כניסה.

מלבדו: שני פערים תפעוליים שחייבים להיסגר לפני הזמנת משתמשים אמיתיים (כתובת שולח לבדיקות בלבד + הזמנה שנכשלת מוצגת כהצלחה), חור קטן בלוגיקה (אישור מרובה של היעדרות), ותפריט מנהל חסר במובייל. הכול תיקונים של שעות.

---

## 🔴 חובה לתקן (לפני שמישהו נכנס לייצור)

### 1. כניסה בייצור שבורה: `getToken` בלי `secureCookie`
`lib/session.ts:18` (`getActor`) ו-`lib/actions/auth.ts:43` (`logoutAction`) קוראים `getToken({ req: { headers }, secret })`. ב-`@auth/core@0.41.3` ברירת המחדל היא `secureCookie ?? false` → שם עוגייה `authjs.session-token` (`jwt.js:86`). ב-HTTPS Auth.js כותב `__Secure-authjs.session-token` (`lib/init.js:69`, `utils/cookie.js:45`) ומצפין עם salt של השם הזה.
**הוכחה (preview `volunteer-192p1y9vx…vercel.app`, מסד dev):** POST ל-`/api/auth/callback/credentials` עם `manager@demo.test` → 302, העוגייה `__Secure-authjs.session-token` נשמרה, `/api/auth/session` מחזיר את המשתמש; `GET /manager` עם אותה עוגייה → **307 ל-`/login`**. ה-proxy (שמשתמש ב-`auth()`) מזהה את הסשן, האפליקציה לא. ב-e2e (http://localhost:3100) זה לא מתגלה. גם היציאה לא מעדכנת `sessionsInvalidBefore` בייצור.
**תיקון:** עוזר אחד `readSessionToken(headers)` ב-`lib/session.ts` שמחשב `secure = h.get("x-forwarded-proto") === "https"` (או `process.env.VERCEL`/`AUTH_URL` מתחיל ב-https) ומעביר `secureCookie: secure` (`cookieName`/`salt` נגזרים אוטומטית). להשתמש בו בשני המקומות. **בדיקה:** e2e שמרים את ה-webServer מאחורי `x-forwarded-proto: https`? קשה; במקום זה: בדיקת יחידה ל-`readSessionToken` עם שני ה-headers, ובדיקה ידנית חובה על preview אחרי התיקון (`/api/auth/session` ו-`/manager` עם אותה עוגייה).

### 2. הזמנה שנכשלת בשליחה מוצגת למנהל כהצלחה
`lib/services/auth-links.ts:18-26` (`sendLink`) מתעלם מתוצאת `notify` (`{ok:false}`); `lib/actions/users.ts:39,64` מחזירים `ok:true` / redirect בלי שגיאה. היום בייצור `EMAIL_FROM = onboarding@resend.dev`, ו-Resend מסרב (403) לכל נמען שאינו בעל החשבון → כל הזמנה לרכז/מראיין ולכל איפוס סיסמה של סטודנט "מצליחים" בלי מייל. הטוקן נוצר, המשתמש נשאר `invited`, ואף אחד לא יודע.
**תיקון:** `sendLink` מחזיר את `NotifyResult`; `inviteUserAction`/`resendInviteAction`/`requestResetAction` (לאיפוס: להישאר עם תשובה אחידה למשתמש אבל לרשום) מציגים `email_failed` ("ההזמנה נוצרה אבל המייל לא נשלח, נסו 'שליחה מחדש'") ורושמים ל-`notification_log` (`ok=false`, kind `auth.invite`). **בדיקה:** אינטגרציה עם `registerProvider` שזורק → הפעולה מחזירה שגיאה ורשומת יומן.

### 3. תפעול: כתובת השולח מאפשרת מייל רק לבעל החשבון
`EMAIL_FROM` בייצור = `Volunteers <onboarding@resend.dev>`. עובד רק ל-`zolo0548152101@gmail.com` (אומת: מייל איפוס הגיע, סטטוס Delivered). לפני הזמנת כל משתמש אחר: לאמת דומיין ב-Resend (אפשר `yaminwin26.app`, הוא מנוהל ב-Vercel אז רשומות ה-DNS נכנסות אוטומטית; או הדומיין הקבוע כשייקנה) ולהחליף `EMAIL_FROM`. זה לא קוד, אבל חוסם שימוש אמיתי; ממצא 2 הוא מה שהופך אותו למסוכן (כשל שקט).

---

## 🟠 כדאי לפני עלייה לאוויר

### לוגיקה
- **O1. אישור מרובה של היעדרות סופר אותה ליעד בלי החלטת רכז.** `lib/services/reports.ts:224-241` (`approveMany`) קורא `applyDecision({kind:"approve"})` בלי `countsTowardTarget`; ברירת המחדל בסכמה `true` (`schema.ts:380`). `app/(app)/reports/page.tsx:73` מציג את צ'קבוקס `ids` גם לשורות `absence`. PRD: "הרכז מחליט אם נספר". תיקון: לא להציג `ids` להיעדרויות (או ב-`approveMany` לדלג על `reportType==="absence"` ולהחזיר `skipped`). בדיקת אינטגרציה.
- **O2. בדיקות האינטגרציה ישלחו מיילים אמיתיים ברגע ש-`RESEND_API_KEY` יהיה ב-`.env.local`.** `vitest.integration.config.mts` טוען `.env.local`; `defaultEmail` (`notify.ts:40-46`) בודק את המפתח בכל שליחה; רוב בדיקות reports/interviews/students לא רושמות ספק. היום המפתח לא ב-`.env.local`, אז זו מלכודת עתידית. תיקון: ב-config של האינטגרציה `process.env.RESEND_API_KEY = ""`, או `if (process.env.VITEST) → console`.
- **O3. ספק הקונסול מדפיס טוקנים גולמיים.** `notify.ts:31-37` מדפיס `input.data`, שבהזמנה/איפוס מכיל `link` עם הטוקן. בסביבת preview של Vercel (אין שם `RESEND_API_KEY`) כל קישור איפוס/הזמנה נכתב ללוגים. תיקון: לרדקט מפתחות `link`/`token` בקונסול; בייצור בלי מפתח להחזיר `{ok:false, error:"no_provider"}`.
- **O4. `scripts/seed.ts:5`** חוסם ייצור לפי `NODE_ENV`/`VERCEL_ENV`, שלא מוגדרים כשמריצים `DATABASE_URL=<prod> pnpm db:seed` ממחשב. תיקון: לסרב אם כבר יש ארגון במסד (כמו `bootstrap.ts:20`) אלא אם `ALLOW_SEED=1`.

### UI/נגישות (שלב 10)
- **O5. במובייל (<1024px) למנהל אין דרך להגיע להגדרות / משתמשים / שדות מותאמים.** `components/nav/app-nav.tsx:104-116`: הסרגל `hidden lg:flex`, ה-BottomNav מקבל רק `groups[0]`, ובכותרת אין תפריט. המפתח `nav.more` ("עוד") קיים ולא בשימוש; `dashboard-design.md §3` דרש אותו. תיקון: פריט חמישי "עוד" שפותח את שאר הקבוצות + יציאה + שפה. בדיקת e2e במובייל: מנהל מגיע ל-`/manager/settings`.
- **O6. תג המונה בניווט התחתון** (`app-nav.tsx:111`): `text-white` על `bg-warn` = ניגודיות **2.64:1** בבהיר, 2.24 בכהה (נדרש 4.5). תיקון: `bg-warn-bg text-warn-fg` כמו בסרגל הצד.
- **O7. W23 לא תוקן:** `components/auth/fields.tsx:10` – שדות email/tel/password בלי `dir="ltr"`; גם `components/users/invite-form.tsx:21`, `components/places/window-form.tsx:23-24` (time). תיקון: `dir="ltr"` לפי `type`.

### תפעול
- **O8. אזור הפונקציות:** הפריסה רצה ב-`iad1` (וירג'יניה) מול Neon ב-`eu-central-1` (פרנקפורט). כל שאילתה חוצה אוקיינוס (~90ms), ודפי שרת מריצים כמה שאילתות. תיקון: `vercel.json` → `"regions": ["fra1"]` (או הגדרת הפרויקט). מדידה לפני/אחרי על `/manager`.
- **O9. מיגרציות ייצור ידניות.** (תיקון: הפרויקט לא מחובר ל-git ופריסה היא ידנית, ראו README) כל push ל-`main` נפרס אוטומטית לייצור, אבל `drizzle-kit migrate` רץ ידנית (והפעם רק אחרי שינוי מצב ההרשאות). קומיט עתידי עם מיגרציה ייפרס לפני שהסכמה עודכנה. תיקון: `buildCommand` = `pnpm exec drizzle-kit migrate && pnpm build` (Neon תומך; drizzle מדלג על מה שכבר רץ), או נוהל כתוב ב-README. לתעד בכל מקרה (README לא מזכיר ייצור כלל: ריפו, פריסה אוטומטית, רשימת משתני הסביבה).
- **O10. סודות שנחשפו בסשן הזה:** סיסמת `volunteer_owner` של Neon (ענף `main`) ומפתח Resend `volunteer-app production` הופיעו בפלטי כלים בתמלול. לפני משתמשים אמיתיים: להחליף את סיסמת ה-role ב-Neon ולעדכן `DATABASE_URL` ב-Vercel; למחוק את מפתח Resend וליצור חדש. (`BLOB_READ_WRITE_TOKEN` מסומן ב-Vercel `readable-secret`: ליצור מחדש כ-sensitive.)

---

## 🟡 הערות (לא חוסמות)

**לוגיקה**
- `lib/services/_util.ts:45` `isDate`: `Date.parse("2026-02-30…")` מתגלגל ל-2.3 → ה-INSERT ל-`date` נופל ב-500 ולא `bad_date`. תיקון: השוואת `toISOString().slice(0,10) === s`.
- `reports.ts:81` כפילות לפי `placementId` ולא יום+מקום: ביום שיבוץ מחדש אפשר שני דיווחים על אותו מקום (ישן+חדש).
- `users.ts:332-339` `setRoles` מנתק סטודנטים מרכז בלי audit לכל סטודנט.
- `analytics.ts:170,179`, `cron.ts:135`: "חדשים החודש", "30 יום", `started_at::timestamptz` לפי UTC של המסד, לא Asia/Jerusalem (סטייה של 2–3 שעות בגבולות).
- `cron.ts:106,110` `logSend` בתוך הלולאה: אם ה-INSERT ליומן עצמו נכשל, כל ריצת הארגון נופלת ומה שנשלח ולא נרשם יישלח שוב. לעטוף ב-try/catch ולהמשיך.
- `reports.ts:227` `approveMany` חותך ל-200 בשקט; שגיאת DB באמצע זורקת אחרי שחלק אושרו ולפני ההודעות.
- שליחות עסקיות (אישור, שיבוץ, הזמנה) לא נרשמות ב-`notification_log` (רק cron). ראו גם 🔴 2.
- `bootstrap.ts:90` מייל המנהל לא מנורמל ל-lowercase (בניגוד ל-`registerStudent`/`inviteUser`).
- `email-resend.ts:10,15` `esc` לא בורח `"` והרגקס של הקישור כולל `"` → `https://x/"onmouseover=…` נכנס ל-`href`. להוסיף `&quot;` ולהגביל ל-`[^\s<"']+`.
- `rate-limit.ts:11` `DISABLE_RATE_LIMIT=1` פועל בכל סביבה; לכבד רק כש-`NODE_ENV!=="production"`.
- סיסמה: רק `≥8`, בלי תקרה (`actions/auth.ts:23,73`, `students.ts:43`): scrypt על מאות KB = DoS זול. `max(128)`.
- `interviews/[id]/page.tsx:24`: מראיין רואה טיוטת שיבוץ-מחדש של רכז עם טפסי עריכה (`editable` לפי סטטוס בלבד); הפעולות נחסמות ב-`authorize`, אז רק UX מבלבל. `editable = … && can(actor, kind==="interview" ? "update" : "reassign", …)`.

**UI/i18n**
- `app-nav.tsx:86,111`: השם הנגיש "תיבת אישורים 7"; `nav.pendingCount` קיים ולא בשימוש (`sr-only`).
- `nav-link.tsx:9`: `/analytics` ו-`/analytics/<kind>` לא מדליקים `aria-current`; ריבוי תפקידים (מנהל+מראיין) לא מקבל "ממתינים לראיון" כי `navFor` בוחר תפקיד אחד.
- `oldest-pending.tsx:25`, `place-occupancy.tsx:17`: קישורי שם ב-13px בלי `min-h-11`.
- `he.json` `dashboard.kpi.hours30` ("+0 ב-30 הימים"), `kpi.stale` ("מעל 1 ימים"): חסר `=0`/plural על `days`.
- מפתחות מתים: `nav2`, `nav3`, `statuses`, `nav4` (רק `student/page.tsx:92`), `common.loading`, `common.comingSoon`, `nav.more`, `nav.pendingCount`, `dashboard.exportExcel`, `analytics.{awaitingInterview,staleReports,slotsLine,…}` (~16 עלים). בדיקת ה-parity לא תופסת מפתחות מתים ולא תקינות ICU.
- `analytics/[kind]/page.tsx:25,31`, `reports/page.tsx:14,39`, `manager/settings/page.tsx:10,114`, `manager/custom-fields/page.tsx:9`: `input/select` ב-14px → זום iOS (D2 תיקן רק את טופס הדיווח).
- `globals.css`: אין `color-scheme: light dark` (שדות נייטיב בהירים בכהה), אין `prefers-reduced-motion`.
- `analytics/page.tsx:17`: `hour12:false` בלי `hourCycle:"h23"`.
- פנייה לא עקבית ביחיד/רבים ב-`he.json` ("עוד לא דיווחת" מול "נסו שוב").
- `A11Y_CONTACT_EMAIL` לא מוגדר בייצור → דף הנגישות בלי כתובת פנייה.

**בדיקות**
- `analytics.test.ts:137-161` (לוח הבקרה): כמעט רק אי-שוויונים (`≤`, `≥0`). לא נבדקים: `staleReports`, `newStudentsThisMonth`, `awaitingThisWeek`, ערך `hoursLast30Days`, `placeOccupancy` מול `windowUsageRows`, `milestone1`, `approvedAbsences`; הרכז נבדק רק `≤` המנהל (עובר גם בלי סינון היקף).
- `cron.test.ts`: אין בדיקה ישירה ל-W5 (שליחה מצליחה → כשל טרנזקציה → אין שליחה חוזרת), ולא לכישלון עותק מנהל שנרשם `ok=false`.
- `bootstrap.test.ts:16`: `length===3` במקום ערכי הכללים מול PRD; לא בודק `settings`.
- `reports.test.ts:116`: לא מאמת שה-audit של `resubmit` מכיל את `reported_hours` הקודם; חסר `needs_correction→approve` ישיר נחסם; חסר `approveMany` על היעדרות (O1).
- `tests/e2e/workflows.spec.ts:20-23`: `cleanup` מוחק **כל** `notification_log` מהשעה האחרונה ורץ ב-`beforeAll/afterAll` גם ב-mobile (ה-skip ב-`beforeEach` לא מונע). לסנן לפי משתמשי `e2e-wf`.
- `dashboard.spec.ts:40-44`: שם הבדיקה "מראיין וסטודנט" אבל נבדק רק סטודנט.
- 9 `test.skip`: 7 עם הערה, 2 בלי (`a11y.spec.ts:35`, `reports.spec.ts:66`).

---

## ✅ עבר (לשמור)

- **הרשאות:** `reassign` במטריצה נכון: מנהל דרך `allActions` (`permissions.ts:68`), רכז `assigned` (`:131`), מראיין וסטודנט לא; `interviews.ts:49-56 authorize` דורש גם `reassign` וגם `create/update placement`; כל `startInterview/loadDraft/saveDraft/cancel/finalize` עוברים דרכו; `students/[id]/page.tsx:29` משתמש ב-`can` עם ה-subject הנכון; `permissions-matrix.test.ts:33,119-123`. **שני פריטי הצ'קליסט של Sonnet:** (א) שינוי המטריצה – מאושר. (ב) `unapprove` חוזר ל-`/reports` (ממתינים) – מאושר כהתנהגות רצויה: הדיווח עבר לממתינים, והמנהל רואה אותו שם מיד.
- **כניסה/טוקנים:** מגבלת קצב בתוך `authorize` (`auth.ts:30-40`, תופסת POST ישיר); `resolveLogin` מבצע verify אחד תמיד; sha256 בלבד במסד, חד-פעמי עם `UPDATE…WHERE used_at IS NULL RETURNING`, TTL invite 7d / reset 1h; `setPasswordFromToken` בטרנזקציה, משתמש `inactive` → rollback; `safe-next.ts` חוסם `//`, `/\`, תווי בקרה.
- **Actions:** כל פעולה → `requireActor` → שירות עם `assertCan`; הרפקטור bea52f6 זהה תו-בתו למה שהחליף (`git show`); `saveSection` whitelist לפי section; `saveValues` מסנן `canEdit`.
- **Proxy/headers בייצור (נמדד):** `frame-ancestors 'none'`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`, nosniff, Permissions-Policy, HSTS; `/api/*` לא מאומת → 401; `/api/cron/*` 401 בלי/עם סוד שגוי; דפים מוגנים → 307 ל-`/login?next=`.
- **חשיפה לפי תפקיד:** סטודנט רואה מקומות בלי חלונות/קיבולת, לא רואה טיוטת שיבוץ-מחדש גם של עצמו, `/students/<אחר>` → 404; ת"ז/בנק רק עם `read bank_details`; תיבת רכז מסוננת ב-SQL + `can` לשורה; export: מראיין 403, רכז נעול ל-`coordinatorId=actor.id`.
- **reported_hours:** משתנה רק ב-`submitReport`/`resubmitReport` עם audit; `applyDecision` לא נוגע; `approved ≤ reported`; unapprove מאפס ל-reported ומעדכן `submitted_at`. פילטר אחיד `status='approved' AND (volunteering OR counts_toward_target)` בבית, בכל ששת הדוחות, בלוח הבקרה, בתעודה, ב-Excel, ובבנק הסטודנט.
- **מכונת מצבים, ולידציה, קיבולת, נעילות:** כמו בביקורת הקודמת, בלי רגרסיה; סדר הנעילות interview→user→windows (FOR UPDATE)→places (FOR SHARE) ללא מעגל; `finalize-rollback.test.ts`.
- **Cron:** advisory lock; כללים מהגדרות; dedupe `ok=true` בלבד ו-`sentAt ≥ submittedAt`; `logSend` מיד אחרי שליחה (W5) – כשל טרנזקציה מאוחר לא גורר שליחה כפולה; עותקי מנהל `*_copy` לא נספרים.
- **Bootstrap וייצור (נבדק במסד `main`):** ארגון 1, משתמש 1 (`invited:manager`), 0 מקומות/שנים/מסלולים, 3 כללי התראה **בדיוק** כברירות ה-PRD (הסלמה 7 ימים ×1 עם עותק למנהל; חוסר פעילות 21 ×1; digest), 12 lookups, 7 מיגרציות, 2 טוקנים חיים (הזמנה + האיפוס שהפעלתי לבדיקה). ארגון ריק לא מפיל כלום: הרשמה עובדת, דיווח מחזיר `no_year`, לוח הבקרה מוגן מחלוקה באפס; שנה/מסלול נוצרים בהגדרות.
- **שלב 10:** אפס מחרוזות קשיחות, he/en 708=708 מפתחות, ICU תקין ב-1416 מחרוזות, ברכה לפי Asia/Jerusalem, `format.number`, גרף `dir=ltr` + טבלת `sr-only`, צבע לא לבד (טקסט בכל תג, `progressbar` עם `aria-valuenow`), h1 יחיד + `section aria-labelledby`, skip-link עם `tabIndex=-1`, `aria-current`, `min-h-11` בפריטי ניווט, יציאה בכל מסך מחובר (כולל אשף ההרשמה), 0 מחלקות פיזיות, 0 צבעים קשיחים, כל הטוקנים מוגדרים גם לכהה, ניגודיות: כל הזוגות הסמנטיים ≥4.74 (למעט תג המונה, O6).
- **קופי:** טון קליל ונכון לקהל; אין בדיחות על AI; שגיאות ענייניות.
- **e2e:** W25 תוקן (אין תאריכים קשיחים), סלקטורים `getByRole`, axe על כל דפי התפקידים בשני הפרויקטים, אין בדיקה בלי `expect`, `toHaveCount(0)` תמיד אחרי אסרט חיובי.
- **היגיינה:** אין סודות בקבצים tracked ובהיסטוריה; `.gitignore` חוסם `.env*`; strict; אפס `any`.

## מה עדיין לא נבנה (ידוע)
OTP ב-SMS · העלאת קבצים (אישור בנק, היעדרות; Blob ו-token כבר קיימים) · ספקי SMS/WhatsApp (הונחו בצד) · RLS · מדידת LCP · 14 תרחישי Tadabase · שדות מותאמים למקום/שיבוץ/דיווח בתצוגה ובמסננים · "שפות פעילות" לא אוכף.

## הנחיות לסונט
1. **🔴 1 קודם**, ב-commit משלו, ואחרי הפריסה בדיקה ידנית על preview (curl: csrf → callback → `/manager` עם העוגייה חייב להחזיר 200). עד אז לא לשלוח למשתמש את קישור ההזמנה.
2. 🔴 2 ו-O1–O4 (לוגיקה/אבטחה), כל אחד ב-commit עם בדיקת רגרסיה.
3. O5–O7 (שלב 10 במובייל), עם e2e במובייל למנהל.
4. O8–O9 הם שינויי הגדרות/תיעוד; O10 וסעיף 🔴 3 הם פעולות של המשתמש (החלפת סודות, אימות דומיין ב-Resend) – לרשום בצ'קליסט ולהזכיר.
5. 🟡 לפי הזמן, קודם הבדיקות החסרות ב-`analytics.test.ts` ו-`cron.test.ts` (הן מה שהיה תופס רגרסיות בלוח הבקרה).
6. בסיום: ריצה מלאה + `docs/fixes-after-review.md` עם שורה לכל ממצא → commit → בדיקה, ו-`project_write`. הביקורת הבאה של Fable: 🔴 1–3 ו-O1–O7 בלבד.

## פלט בדיקות
- `tsc --noEmit`: נקי · `eslint .`: נקי
- `vitest run`: 13 קבצים, 96 בדיקות עברו
- `pnpm test:db`: 12 קבצים, 145 בדיקות עברו (320 שנ')
- `playwright test` (desktop+mobile, `pnpm build && pnpm start -p 3100`): 97 עברו, 11 דולגו (הדילוגים: תרחישים שמשנים נתוני דמו ורצים פעם אחת, ו-`workflows.spec` ב-desktop בלבד), 0 נכשלו, 8.1 דק'
- ייצור: `/login`, `/register`, `/invite` 200; `/manager`, `/student` → 307 ל-`/login?next=`; `/api/cron/*` 401; כותרות אבטחה קיימות; מסד `main`: ארגון 1, מנהל מוזמן 1, 7 מיגרציות
- preview `d0d5aaa` (מסד dev): כניסה → `__Secure-authjs.session-token` נשמרה, `/api/auth/session` מזהה, `/manager` → 307 `/login` (🔴 1)
