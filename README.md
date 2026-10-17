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
