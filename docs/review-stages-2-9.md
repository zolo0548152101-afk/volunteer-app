# ביקורת Fable – שלבים 2–9 (לסונט)

תאריך: 16.10.2026 · נבדק: commit `b3cbb3e` · שיטה: ארבע סקירות עצמאיות (הרשאות ואימות · לוגיקה עסקית ושלמות נתונים · UX/i18n/RTL מול WORKPLAN · בדיקות ואיכות קוד), כולל ניסויים מול DB הפיתוח (ארגונים זמניים שנמחקו) ודפדפן ב-390px על ~30 מסכים בכל תפקיד. כל ממצא 🔴/🟠 אומת בקוד ולפחות אחת מהסקירות הוכיחה אותו בפועל.

**מצב הרצה:** typecheck ✅ · lint ✅ · unit 85 ✅ · integration 121 ✅ · e2e 72 ✅ (6 מדולגים בכוונה) · `drizzle-kit check` ✅ · כיסוי `lib/services` 89.5% שורות / 75% ענפים.

## שורה תחתונה
היסודות טובים מאוד: מטריצת הרשאות אחת עם ברירת מחדל חסימה, קיבולת תמיד מחושבת, טרנזקציות ונעילות נכונות, מכונת המצבים של הדיווחים שלמה, מספרי הדוחות תואמים SQL ישיר, i18n ו-RTL נקיים כמעט לחלוטין, אין סודות בריפו. **לא עבר קבלה סופית** בגלל 9 פריטי "חובה": שתי פרצות לוגיות אמיתיות (שיבוץ למקום סגור; מראיין מעביר סטודנטים בין רכזים), באג כניסה חוצה-ארגונים, ושלושה מסכי ליבה של הסטודנט/הרכז שלא עומדים בהגדרת WORKPLAN (בית הסטודנט, טופס הדיווח, ביטול אישור). רובם תיקונים של שעות, לא ימים.

---

## 🔴 חובה לתקן (סדר מומלץ)

### 1. סגירת ראיון אל חלון של מקום `closed`/`paused` מתקבלת
`lib/services/interviews.ts:184` (`evaluate`), `lib/services/capacity.ts:215-284`, `saveDraft` 128-129: נבדק רק `window.isActive`, לא `volunteer_places.status`. `listCandidateWindows` מסנן רק בתצוגה.
**הוכחה:** מקום נסגר (`updatePlace status=closed`, עבר כי לא היו שיבוצים) → `startInterview→saveDraft→finalizeInterview` על החלון שלו הצליח, `activated:1`. עוקף את `has_active_placements` ב-`places.ts:141`.
**תיקון:** `loadWindows`/`evaluate` מחזירים גם `place.status`; issue חדש `place_not_active` (block); ב-`finalizeInterview` לנעול גם את שורות `volunteer_places` (`FOR UPDATE`) כדי לסגור את המרוץ מול `updatePlace`. בדיקת אינטגרציה: סגירת מקום ← סגירת ראיון מקבילה, בדיוק אחת מצליחה.

### 2. מראיין משייך מחדש / מנתק רכז של סטודנט שכבר משויך
`lib/services/users.ts:147-175` (`assignCoordinator`) מול ההערה ב-`lib/permissions.ts` "רק אם עוד לא קושר: נאכף בשירות" – לא נאכף. `tests/integration/users.test.ts:131` מקבע את ההתנהגות (על סטודנט לא-משויך).
**הוכחה:** מראיין החליף c1→c2 ואז ל-null. סטודנט בלי רכז = דיווחים לא מגיעים לאף תיבה.
**תיקון:** אם ה-actor אינו manager: `if (t.coordinatorId !== null || coordinatorId === null) throw new ForbiddenError()`. בדיקת רגרסיה לשני המקרים.

### 3. כניסה ואיפוס סיסמה לא מסוננים לפי ארגון
`lib/auth.ts:24-28`, `lib/actions/auth.ts:43-48`: `lower(email)` גלובלי + `limit(1)`, בעוד האינדקס הייחודי הוא `(organization_id, lower(email))`. שני ארגונים עם אותו מייל → משתמש אקראי; וגם סריקה מלאה בכל כניסה (האינדקס לא שמיש).
**תיקון (החלטה):** או מייל ייחודי גלובלית – אינדקס ייחודי על `lower(email)` + מיגרציה; או בחירת ארגון בכניסה. ההמלצה: ייחודי גלובלית (פשוט יותר; מערכת לארגון אחד כרגע). לעדכן `prd-decisions.md`.

### 4. בית הסטודנט ריק
`app/(app)/student/page.tsx`: שורת טקסט וחמישה קישורים. WORKPLAN שלב 6 דורש פס התקדמות (מאושר/ממתין/יעד), אבני דרך, החוזה הפעיל, כפתור דיווח גדול, 5 דיווחים אחרונים. `myProgress` ו-milestones כבר קיימים בשירות – חסר רק הרינדור. צילום: `student1__student.png`.

### 5. טופס הדיווח לא עומד בהגדרה "3 שדות, פחות מ-30 שניות"
`components/student/report-form.tsx`: 6 שדות גלויים; תאריך ברירת מחדל = היום (`:10`) במקום "יום החוזה הקרוב שעבר" (בצילום: שישי, כשהחוזה א'–ג'); החלפת שיבוץ ב-select לא מעדכנת שעות/זמנים (נגזרים מ-`first` בלבד); היעדרות בדף נפרד ובלי קובץ; `input` ב-14px → iOS מבצע זום בפוקוס.
**תיקון:** 3 שדות גלויים (שיבוץ, תאריך, שעות) + "עוד" מתקפל לשעות/הערות; חישוב יום החוזה האחרון לפי `placements.days`; רכיב לקוח קטן שמחליף ברירות מחדל לפי השיבוץ; `text-base` לשדות; מתג היעדרות באותו טופס (קובץ – כש-Blob יחובר, לציין).

### 6. ביטול אישור: `approved_hours` ישן נשאר, והודעה עם תבנית לא קיימת
`lib/services/reports.ts:209` – patch של `unapprove` לא מאפס `approvedHours` (בתיבה "שעות לאישור" ממולא 10 על דיווח של 3.75). `reports.ts:231` שולח `report.${status}` → `report.pending`, שאין ב-`templates.ts`; `notify` מחזיר `ok:true` עם subject/body ריקים → עם ספק אמיתי ייצא מייל ריק.
**תיקון:** `approvedHours: old.reportedHours` ב-unapprove; `template: TemplateId` (טיפוס, לא string) + תבנית `report.unapproved` ("האישור בוטל, הדיווח חזר לבדיקה") או דילוג על הודעה; בנוסף `approvedHours > reportedHours → bad_hours` (כיום מותר עד 24 – הוכח 3.75→10). בדיקות לשלושתם.

### 7. גרף העמודות שבור ב-RTL
`components/bar-chart.tsx:12`: `textAnchor="end"` יורש `direction: rtl` → התווית נמשכת לתוך העמודה ומתנגשת בערך. צילום `manager__analytics.png`.
**תיקון:** `direction="ltr"` על ה-`<svg>` או מראה מלאה (תוויות מימין, עמודות גדלות שמאלה). בדיקה ויזואלית במובייל.

### 8. גלילה אופקית במובייל במסך ההגדרות
`app/(app)/manager/settings/page.tsx:112,123`: `grid-cols-[1fr_1fr_5rem_auto_auto]` בלי breakpoint → רוחב 613px ב-390px. לשבור לשורות ב-`sm:` ומטה. להוסיף את `/manager/settings` לבדיקת "אין גלילה אופקית" ב-`smoke.spec.ts`.

### 9. דפי 404/שגיאה של Next באנגלית
אין `not-found.tsx` / `error.tsx` / `global-error.tsx` באף רמה; כל `notFound()` מציג "404 This page could not be found". הפרה של כלל 5. בנוסף `ForbiddenError` בעמודי `[id]` מגיע ל-500 (רק `NotFoundError` נתפס) – לתפוס גם אותו → `notFound()`.

---

## 🟠 כדאי (לפני עלייה לאוויר)

**לוגיקה**
- **W1** `reports.ts:68` – דיווח/תיקון על שיבוץ שהפך לא-פעיל נחסם (`not_your_placement`): דיווח ב-`needs_correction` נתקע לנצח אחרי שיבוץ מחדש. לאפשר אם `volunteerDate` בין `started_at` ל-`ended_at` של השיבוץ, ולחסום תאריך לפני `started_at` (כיום מותר – הוכח).
- **W2** `reports.ts:78,80` – `day_over_max` ו-`duplicate` הם חסימות; WORKPLAN שלב 6 שורה 150 מגדיר אזהרות. להחזיר `warnings[]` ולהציג, או לתעד במפורש ב-`prd-decisions.md` שהוחלט לחסום (ולעדכן WORKPLAN).
- **W3** `reports.ts:125` – `resubmit` דורס `reported_hours` באותה שורה (הישן רק ב-audit). עומד ב"הרכז לא דורס", לא ב"לא נדרס לעולם". לתעד את ההחלטה ב-`prd-decisions.md`, או שורה חדשה + `superseded`.
- **W4** `cron.ts:92` – הסלמה לא חוזרת אחרי unapprove (סופרת מ-`submittedAt`). ב-unapprove לעדכן `submittedAt` או להוסיף `pending_since`.
- **W5** `cron.ts:103-107` – `deliver` בתוך הטרנזקציה לפני commit (כשל מאוחר = מייל יצא בלי רישום); עותק למנהל לא נרשם ב-`notification_log`.
- **W6** `analytics.ts:91` – דוח "לפי מקום" מציג רק `status='active'`: שעות במקום שנסגר נעלמות. `analytics.ts:164` – `awaiting` לא מסנן `'student' = ANY(roles)`.
- **W7** `places.ts:140-143` – `paused` עם שיבוצים פעילים מותר בלי אזהרה לסטודנט (כנראה מכוון – לתעד).

**הרשאות/אבטחה**
- **W8** אין הגבלת קצב בכניסה (`lib/auth.ts`), שחזור (`actions/auth.ts:38`), הרשמה (`actions/student.ts:16`; גם `email_taken` חושף מיילים). Throttle לפי IP+מייל (טבלת ניסיונות או Upstash).
- **W9** `interviews.ts:256-278` – סטודנט מקבל `evaluation.windows` (קיבולת מוסדית) ב-`getDraft` של שיבוץ-מחדש שלו. לדרוש `read interview` או לא לחשב `evaluate` לסטודנט.
- **W10** אין כותרות אבטחה (`frame-ancestors 'none'`, `Referrer-Policy` – קישורי `?token=` עלולים לדלוף). `headers()` ב-`next.config.ts`.
- **W11** `custom-fields.ts:82` + `students.ts:162` – שדה מותאם "חובה" נעקף בהשמטה מהטופס.
- **W12** `actions/auth.ts:61-64` – `setPasswordAction` בולע כל חריגה כ"קישור לא תקף" (גם נפילת DB).

**ביצועים/נתונים**
- **W13** `reports.ts:181` – תיבת רכז: `limit(500)` על כל הארגון ואז סינון `can` ב-JS → מעל 500 ממתינים הרכז רואה חלקית. לסנן ב-SQL לפי `coordinator_id` ואז limit.
- **W14** `analytics.ts:74-77` – N+1 `loadValues` לכל סטודנט בדוח/ייצוא. `inArray` אחד.
- **W15** אינדקסים חסרים: `hour_reports(organization_id,status)`, `hour_reports(academic_year_id)`, `hour_reports(place_id)`, `placements(place_id) WHERE is_active`, ו-`lower(email)` (ראו #3).

**UX/i18n**
- **W16** פאנל "שני הבנקים" מתעדכן רק אחרי "שמירת טיוטה" (`interviews/[id]/page.tsx:54-83`). לפחות להציג evaluation אחרי כל submit; עדיף מחשבון לקוח על `capacity.ts` (טהור).
- **W17** תיבת רכז: אין אישור מרובה ואין סינון סטודנט/מקום/חודש (`listInbox` כבר מקבל `studentId`).
- **W18** תאריכים גולמיים ISO ו-`toLocaleDateString("he-IL")` קשיח גם באנגלית (`reports/page.tsx:31`, `student/reports/page.tsx:23`, `students/[id]:82,89`, `certificate:24,28`, `interviewer/page.tsx:20`, חודש "2026-10"). להשתמש ב-`getFormatter()` של next-intl.
- **W19** `analytics.ts:76` – "כן"/"לא" קשיח, כותרת עמודה `labelHe` גם ב-EN, ערכי multi_select כמפתחות; `fmt` מתרגם כל מחרוזת שב-`enumKeys` (מקום בשם "other" יתורגם). מגיע ל-Excel. `xlsx.ts:11` תמיד `rightToLeft`.
- **W20** אין מצב pending/טעינה בטפסי server-action (לחיצה כפולה ב-`addLineAction` יוצרת שורה כפולה); אין `loading.tsx`; `common.loading` ההומוריסטי לא מוצג בשום מקום.
- **W21** יעדי מגע < 44px: קישורי הבית, "יציאה", צ'קבוקסים נייטיב בראיון/הגדרות (87–123 אלמנטים למסך).
- **W22** נגישות: multi_select ב-`custom-fields.tsx:24-37` – `<label>` עוטף כמה צ'קבוקסים (צריך `fieldset/legend`); שגיאות `role=alert` בלי `aria-describedby`/`aria-invalid`; הודעות `role=status` ברינדור ראשוני אחרי redirect לא מוכרזות; skip-link יעד `#content` בלי `tabIndex={-1}`.
- **W23** שדות אימייל/טלפון/סיסמה בלי `dir="ltr"` (`components/auth/fields.tsx:9`, `places/[id]:53`); חץ `→` ב-`students/[id]:89` לא מתהפך.
- **W24** `getDraft`/ `students/[id]:25` `canReassign` ו-`reports/page.tsx:51` – בדיקות `roles.includes` ב-UI מחוץ ל-`can` (השירות אוכף; עקביות עם ביקורת שלב 2).

**בדיקות**
- **W25** `tests/e2e/reports.spec.ts:29,38` – תאריך קשיח `2026-10-14`; להשתמש ב"אתמול" לפי Asia/Jerusalem.
- **W26** `playwright.config.ts` – בלי `retries/forbidOnly/trace`, `webServer: pnpm start` בלי build; desktop+mobile במקביל על אותו DB עם `test.skip` ידני ב-5 מקומות.
- **W27** פערי e2e מול WORKPLAN: שינוי תפקידים/סטטוס/שיוך מה-UI, `/invite` ו-reset happy-path, עריכת חלון/`below_allocated`, שיבוץ מחדש וביטול ראיון, היעדרות, needs_correction→תיקון, unapprove, cron 200 עם סוד, דוחות רכזים/חודשים/היעדרויות.
- **W28** אפס כיסוי: `lib/auth-links.ts` (כולל `safeNext` – מגן open-redirect), `lib/lookups.ts`, `customInputFromForm`, `registrationOrgId`, כל `lib/actions/*` (רק דרך e2e). בדיקות טאוטולוגיות: `db.test.ts:23-36,135-150`, `analytics.test.ts:77-85` (עטוף `if (r)`), `:120 toContain("")`.
- **W29** שכפול: `str/num/run/go/code` ב-6 קבצי actions, `login()` ב-7 קבצי e2e, `act()` בכל אינטגרציה, `clean/todayIL/isDate/slug/DAYS` כפולים בשירותים → `lib/actions/_shared.ts`, `lib/services/_util.ts`, `tests/e2e/fixtures.ts`.

## 🟡 הערות
- `setRoles` מנתק N סטודנטים מרכז בלי audit לכל סטודנט; `credentials.ts:18` ו-`completeProfile` כותבים בלי audit/tx; `issueToken` בלי tx; `saveSectionAction` = 3 כתיבות נפרדות.
- מפתחות i18n מתים (`common.*`, `statuses.*`), מרחבי `nav2/nav3/nav4` – לאחד ל-`nav`. גרש לא עקבי (`ש'` מול `א׳`). תבניות מייל ו-`queue.registered` בזכר יחיד בעוד שאר הקופי ניטרלי. `common.loading` בדיחה על LLM, לא על סטודנט.
- מבנה תיקיות שונה מה-WORKPLAN (`(app)/student` במקום `(student)/home`, `/analytics` במקום `/dashboard`, `/manager/custom-fields` במקום `/fields`) – לתעד ב-README (שגם מתאר את המבנה הישן). `.env.example` חסר `REGISTRATION_ORG_ID`, `APP_URL`, `A11Y_CONTACT_EMAIL` ומכיל `BLOB_READ_WRITE_TOKEN` שלא בשימוש. אין `lib/env.ts`.
- `lib/db/seed.ts` עדיף ב-`scripts/`. `await import` מיותר ב-`actions/interviews.ts:72`, `students.ts:31`. `dashboard` מחשב `windowUsageRows` פעמיים. `target: ES2017`.
- `cron.ts:131` `started_at::timestamptz` לפי TZ של ה-DB – הסטה של שעתיים, זניח.

## ✅ עבר (לשמור)
- **הרשאות:** מטריצה אחת, ברירת מחדל חסימה, ארגון זר נחסם לפני כל כלל; כל action → `requireActor` → שירות עם `assertCan`; אין action שסומך על מזהה מהטופס בלי `organization_id` + scope. `getActor` קורא DB בכל בקשה ומכבד `sessions_invalid_before`. ת"ז/בנק רק לסטודנט ולמנהל – לא בדוחות, בייצוא, בתעודה, בראיון, בלוג. היקף רכז נאכף ב-SQL (הוכח: `coordinatorId` זר מתעלם). מראיין בלי דיווחים/ייצוא; אישור חריגה בשרת, מנהל בלבד, עם audit. Cron עם `timingSafeEqual`; ייצוא מחרוזות בלבד (ללא formula injection); טוקנים hash-only חד-פעמיים עם תוקף; `safeNext/safeBack`; proxy מתאים מדויק; zod/רשימות שדות קשיחות נגד mass-assignment. הממצאים מביקורת שלב 2 – אין רגרסיה.
- **קיבולת:** אין עמודת תפוסה בסכמה; חישוב בסנטים, 0.25/0.5 מדויקים; מרוץ finalize↔finalize ו-finalize↔updateWindow נסגר בנעילות בסדר קבוע (הוכח); `below_allocated`, `has_active_placements`.
- **סגירת ראיון:** טרנזקציה אחת, rollback מלא (בדיקה עם `vi.mock`), הודעות אחרי commit, ראיון סגור immutable, היסטוריה נשמרת.
- **דיווחים:** כל המעברים האסורים נחסמים; unapprove למנהל עם סיבה; rejected סופי; רק approved (+ היעדרות עם `counts_toward_target`) נספר – מסנן זהה בבית, אנליטיקס, תעודה, Excel; `volunteer_date` הוא `date` → אין בעיית UTC; `round2` בכל קלט.
- **Cron:** advisory lock, 3 ריצות מקבילות = שליחה אחת, כללים מהגדרות, כשל לא נספר.
- **אנליטיקס מול SQL ישיר:** students 6/6, months, places, milestones – תואמים.
- **i18n/RTL:** אפס מחלקות פיזיות, אפס מחרוזות קשיחות ב-JSX, קודי שגיאה מוולדטים מול רשימה סגורה, בדיקת שוויון מפתחות he/en, אנגלית טבעית, קופי עברי קליל ונכון לקהל.
- **נגישות בסיסית:** 0 שדות בלי תווית ב-30 מסכים, axe נקי בכל המסכים ושני הפרויקטים, `fieldset/legend`, `aria-current`, `focus-visible`, skip link, אין גלילה אופקית פרט להגדרות.
- **היגיינה:** אין סודות בריפו, strict, אפס `any`, סכמה↔מיגרציות מסונכרנות, seed חסום בפרודקשן, אינטגרציה מבודדת לארגון זמני עם ניקוי.

## מה עדיין לא נבנה (ידוע, לא "באג")
OTP ב-SMS · העלאת קבצים (אישור בנק, היעדרות – Vercel Blob) · ספקי מייל/SMS/WhatsApp · פריסה ל-Vercel + ריפו GitHub (כלל 7 לא קוים באף שלב) · RLS · מדידת LCP · 14 תרחישי Tadabase (הטקסט לא זמין) · שדות מותאמים למקום/שיבוץ/דיווח מוצגים ובמסננים · "שפות פעילות" לא אוכף · סכום slots של חלונות מול המקום (הוחלט לא לבנות).

## הנחיות לסונט
1. לתקן 🔴 1–9 בסדר הזה, כל אחד ב-commit משלו (`fix: …`) עם בדיקת רגרסיה (אינטגרציה ל-1,2,3,6; e2e/ויזואלי ל-4,5,7,8,9).
2. בכל החלטת פרשנות (#3 ייחודיות מייל, W2 אזהרה/חסימה, W3 resubmit) – לכתוב שורה ב-`prd-decisions.md` ולא לבחור בשקט.
3. אחר כך 🟠 W1–W15 (לוגיקה, אבטחה, ביצועים) לפני W16–W29.
4. בסיום: `typecheck && lint && test && test:db` + Playwright מלא (desktop+mobile), דוח `docs/fixes-after-review.md` עם טבלה ממצא→commit→בדיקה, ו-`project_write` לפרויקט. ביקורת Fable חוזרת על התיקונים בלבד.
