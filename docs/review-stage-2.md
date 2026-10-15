# ביקורת Fable – שלב 2 (וסגירת CHECKPOINT 2)

תאריך: 2026-10-16. נבדק: commit 5d85ba2. השיטה: קריאת הקוד + ניסיונות עקיפה בפועל (שירותים ישירות, ודפדפן מול שרת production build).

## CHECKPOINT 2 – מודל נתונים: ✅ עבר (בדיעבד, עם הערה)
- אין עמודת קיבולת שמורה (בדיקה אוטומטית מול information_schema), SQL ≡ שירות טהור לכל חלון, אילוצי DB נכונים: חלון פעיל פעם אחת לסטודנט, slots>0, weekly_hours>0, שנה אקדמית נוכחית אחת, draft אחד לראיון, `reported_hours`/`approved_hours` נפרדים, `counts_toward_target`.
- RLS ניתן ליישום: `organization_id` בכל טבלה, `users.coordinator_id` לסינון רכז.
- הערה: בדקתי אילוצים ובדיקות, לא עברתי שדה-שדה מול PRD §5. מודל הנתונים שונה אחרי CP2 (`auth_tokens`) – צוין בדוח, תקין לפי כלל 4.

## שלב 2: ❌ לא עבר – שתי פרצות חמורות, הוכחו בפועל

### 🔴 1. סטודנט מקדם את עצמו למנהל
`setRoles` ו-`setStatus` בודקים `assertCan(actor, "update", "user", subjectOf(target))`. לסטודנט יש `update user own` (לעריכת הפרופיל שלו). לכן:
`setRoles(db, student, student.id, ["student","manager"])` → **הצליח** (`roles=student,manager`). גם `setStatus` על עצמו מותר.
Server action הוא endpoint POST; לא צריך לראות את המסך כדי לקרוא לו.
**תיקון:** להפריד "עריכת פרופיל" מ"ניהול משתמש" במטריצה: פעולה חדשה `manage` (או entity `user_admin`) שרק למנהל יש, ולהשתמש בה ב-`setRoles`, `setStatus`, `resendInvite`. להוסיף לבדיקת ה-snapshot. בדיקת רגרסיה: סטודנט/רכז/מראיין על `setRoles` לעצמם → ForbiddenError.

### 🔴 2. השבתה והסרת תפקיד לא תופסות על session קיים (עד 14 יום)
JWT מחזיק id/org/roles ואף בקשה לא בודקת את ה-DB. הוכחה בדפדפן: student1 מחובר → `status=inactive` ב-DB → `/student` עדיין 200. גם שינוי תפקידים לא משתקף עד כניסה מחדש.
**תיקון:** ב-`requireActor` (ובדף/layout) לקרוא `status, roles` מה-DB לפי `id` (שאילתה אחת, אפשר `cache()` לבקשה) ולהשתמש בהם במקום בערכי הטוקן; אם `status != active` → `signOut` והפניה לכניסה. הטוקן נשאר רק מזהה. בדיקה: השבתה → הבקשה הבאה נזרקת.

### 🟠 3. קישור איפוס/הזמנה מחיה משתמש מושבת
`consumeToken` לא בודק סטטוס, ו-`setPasswordAction` תמיד שם `status="active"`. הוכח: טוקן שהונפק לפני השבתה התקבל. הזמנה תקפה 7 ימים.
**תיקון:** ב-`setPasswordAction` לטעון את המשתמש; אם `inactive` → לדחות; `active` רק אם היה `invited`.

### 🟠 4. בדיקות הרשאה מחוץ למטריצה
`resendInviteAction` בודק `actor.roles.includes("manager")` ידנית; `UsersPage` משתמש ב-`create user` כתחליף ל"מורשה לנהל". כלל 6 + "מטריצה אחת" – הכל דרך `can`. נפתר יחד עם 1.

### 🟡 5. פערים מול תוכנית העבודה
- כניסה ב-OTP ב-SMS היא בתכולת שלב 2 בתוכנית; הדוח דחה לשלב 3. מקובל, אבל להעביר במפורש לרשימת שלב 3/4 ב-WORKPLAN.
- אין preview ב-Vercel לשלב (כלל 7) כי אין remote. לחבר repo לפני שלב 3.
- `lastLoginAt` קיים ולא מתעדכן בכניסה.
- `requestResetAction` בלי הגבלת קצב (הפצצת מיילים), בנוסף לכניסה.
- `?error=` ב-`/manager/users` לא מוולדט מול רשימה סגורה (next-intl מחזיר את המפתח, לא קורס, אבל מלוכלך).
- בדיקות e2e משאירות משתמשי `e2e-*` בארגון הדמו – לנקות בתוך הבדיקה.

## מה טוב (לשמור)
- `permissions-matrix.test.ts` עם snapshot – בדיוק מה שצריך; פשוט חסרה בו פעולת הניהול.
- טוקנים: hash בלבד, חד-פעמי, OTP קשור למשתמש ונועל אחרי 5, סימון שימוש אטומי (`returning`).
- אותה תשובה לכתובת קיימת/לא קיימת; `safeNext`; קוד שאינו action הוצא מקבצי `"use server"`.
- `listUsers` מסנן דרך `can` עצמו, לא דרך SQL כפול; מניעת "ארגון בלי מנהל" ו-self-lockout; הכל-או-כלום בשיוך.

## תנאי "עבר" לשלב 2
תיקון 1–4 + בדיקות רגרסיה לכל אחד (יחידה/אינטגרציה, ו-e2e לסעיף 2), ירוק ב-`typecheck && lint && test && test:db`, commit `stage 2 fixes: …`. סעיף 5 יכול להיכנס לשלב 3.
