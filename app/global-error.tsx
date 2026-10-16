"use client";

/**
 * גיבוי אחרון כשהמעטפת עצמה קורסת. מחליף את ה-layout, ולכן אין כאן i18n וגם לא סגנונות גלובליים:
 * טקסט דו-לשוני קבוע וסגנון inline בלבד.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f4f0", color: "#1c1b19" }}>
        <main style={{ maxWidth: 440, margin: "0 auto", padding: 24, minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
          <title>משהו השתבש</title>
          <h1 style={{ fontSize: 24, margin: 0 }}>משהו השתבש</h1>
          <p role="alert" style={{ margin: 0 }}>האתר נתקל בתקלה. אפשר לנסות שוב, ואם זה חוזר, לפנות למנהל המערכת.</p>
          <p lang="en" dir="ltr" style={{ margin: 0, color: "#55524c" }}>Something went wrong. Please try again.</p>
          <div>
            <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", borderRadius: 8, border: 0, background: "#1c1b19", color: "#fff", fontSize: 16, cursor: "pointer" }}>
              ניסיון נוסף / Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
