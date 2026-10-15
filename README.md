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
| `pnpm db:generate` / `pnpm db:migrate` | מיגרציות Drizzle (מהשלב 1) |

אם Playwright לא מוצא דפדפן: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e`.

## מבנה

- `app/` – נתיבים (`(public)`, ובהמשך `(student)`, `(coordinator)`, `(interviewer)`, `(manager)`)
- `lib/permissions.ts` – מטריצת הרשאות יחידה, ברירת מחדל חסימה
- `lib/services/notify.ts` – שכבת הודעות אחת (מייל / SMS / וואטסאפ)
- `lib/db/` – Drizzle + Neon
- `i18n/`, `messages/he.json`, `messages/en.json` – שפה בעוגייה, עברית ברירת מחדל
- `tests/unit`, `tests/e2e`

## כללים

- כל תווית למשתמש מגיעה מ-`messages/*.json`. אין מחרוזות קשיחות.
- מאפייני CSS לוגיים בלבד (`ms-`, `pe-`, `start`, `end`), לא `ml-`/`left`.
- הרשאות נאכפות בשרת.
- ב-Next 16 ה-middleware נקרא `proxy.ts`. קראו את `node_modules/next/dist/docs/` לפני שימוש ב-API לא מוכר.
