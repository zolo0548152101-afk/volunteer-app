# מלגאים – מערכת ניהול שעות התנדבות

מקור האמת לדרישות: ה-PRD (הקישור בראש `docs/WORKPLAN.md`). סדר העבודה והביקורות: `docs/WORKPLAN.md`.

## הרצה

```bash
pnpm install
cp .env.example .env.local   # למלא DATABASE_URL, AUTH_SECRET
pnpm dev
```

## פקודות

| פקודה | מה עושה |
| --- | --- |
| `pnpm typecheck` | בדיקת טיפוסים |
| `pnpm lint` | ESLint |
| `pnpm test` | בדיקות יחידה (Vitest) |
| `pnpm build && pnpm test:e2e` | בדיקות דפדפן (Playwright), דסקטופ + מובייל |
| `pnpm db:generate` / `pnpm db:migrate` | מיגרציות Drizzle. `db:migrate` דורש `DATABASE_URL` בסביבה (`set -a; . ./.env.local; set +a`) |
| `pnpm db:seed` | נתוני הדגמה על ה-DB שב-`.env.local` (סיסמה `demo1234`; אסור בפרודקשן. מסד שכבר יש בו ארגון דורש `ALLOW_SEED=1`) |
| `pnpm db:bootstrap` | הקמת ארגון אמיתי בסביבה חדשה (בלי נתוני דמו): `ORG_NAME=… MANAGER_EMAIL=… MANAGER_FIRST=… MANAGER_LAST=… APP_URL=… pnpm db:bootstrap`, עם `DATABASE_URL` של הסביבה. מדפיס `REGISTRATION_ORG_ID` וקישור הזמנה למנהל |
| `pnpm test:db` | בדיקות אינטגרציה מול Neon: יוצרות ארגון משלהן ומוחקות אותו |

אם Playwright לא מוצא דפדפן: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e`.

## מבנה

- `app/` – נתיבים (`(public)`, ובהמשך `(student)`, `(coordinator)`, `(interviewer)`, `(manager)`)
- `lib/permissions.ts` – מטריצת הרשאות יחידה, ברירת מחדל חסימה
- `lib/services/notify.ts` – שכבת הודעות אחת (מייל / SMS / וואטסאפ)
- `lib/db/` – Drizzle + Neon (Pool עם WebSocket, בשביל טרנזקציות), `schema.ts`, `queries/`, `seed.ts`
- `lib/services/capacity.ts` – בנק השעות הדו-צדדי (פונקציות טהורות). קיבולת לעולם לא נשמרת בעמודה
- `lib/services/audit.ts` – הכתיבה היחידה ל-`audit_log`, בתוך אותה טרנזקציה של השינוי
- `i18n/`, `messages/he.json`, `messages/en.json` – שפה בעוגייה, עברית ברירת מחדל
- `tests/unit`, `tests/e2e`

## כללים

- כל תווית למשתמש מגיעה מ-`messages/*.json`. אין מחרוזות קשיחות.
- מאפייני CSS לוגיים בלבד (`ms-`, `pe-`, `start`, `end`), לא `ml-`/`left`.
- הרשאות נאכפות בשרת.
- ב-Next 16 ה-middleware נקרא `proxy.ts`. קראו את `node_modules/next/dist/docs/` לפני שימוש ב-API לא מוכר.

## ייצור (Vercel + Neon)

- **ריפו:** `zolo0548152101-afk/volunteer-app` (פרטי). פרויקט Vercel `volunteer-app` **אינו מחובר ל-git**: דחיפה ל-`main` לא מפרסמת. פריסה נעשית ב-`create_deployment` (מקור github, `ref: main`, `target: production`), או מ-CLI.
- **אזור פונקציות:** `fra1` (`vercel.json`), ליד ה-DB ב-Neon `eu-central-1`.
- **מיגרציות ידניות, לפני הפריסה:** מריצים `pnpm db:migrate` מול מסד הייצור (ענף `main` ב-Neon) ורק אחר כך פורסים. ההפך (פריסה ואז מיגרציה) משאיר קוד שמצפה לעמודות שעוד לא קיימות. לא הוגדר `drizzle-kit migrate` בשלב הבנייה בכוונה: מיגרציה הרסנית לא צריכה לרוץ בלי שמישהו אישר אותה.
  - `set -a; . <קובץ env עם DATABASE_URL של הייצור>; set +a; pnpm db:migrate` (ערכים עם `&` בגרשיים).
- **הקמה ראשונה:** `pnpm db:bootstrap` (ראו למעלה). לא מריצים `db:seed` מול ייצור.
- **משתני סביבה (Production):** `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `APP_URL` (הכתובת הציבורית, משמשת בקישורי מייל), `REGISTRATION_ORG_ID` (הדפסה של bootstrap), `RESEND_API_KEY`, `EMAIL_FROM` (דורש דומיין מאומת ב-Resend; עם `onboarding@resend.dev` המייל מגיע רק לבעל החשבון), `BLOB_READ_WRITE_TOKEN`.
- **מייל:** בלי `RESEND_API_KEY` בייצור השליחה נכשלת (`no_provider`) ונרשמת ב-`notification_log`; בפיתוח המייל מודפס לקונסול בלי הקישורים.
- **אימות אחרי פריסה:** `/login` מחזיר 200; כניסה בפועל ב-HTTPS מובילה ל-`/manager` (לא חוזרת ל-`/login`); `/api/cron/escalation` בלי סוד מחזיר 401.

## כניסת הדגמה בלי סיסמה (Preview בלבד)

`/dev-login` מציג את משתמשי ההדגמה (`@demo.test` בארגון "ארגון הדגמה") וכניסה בלחיצה, בלי סיסמה. פועל רק כש-`ENABLE_DEV_LOGIN=1`, ואף פעם לא כש-`VERCEL_ENV=production` (`lib/dev-login.ts`; בייצור הדף 404 והספק מחזיר null). ב-Vercel המשתנה מוגדר רק ל-Preview, שם מחובר ענף `dev` של Neon עם נתוני דמו. **לא מגדירים אותו בייצור.** מקומית: `ENABLE_DEV_LOGIN=1` ב-`.env.local`.

