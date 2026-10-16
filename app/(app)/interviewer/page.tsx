import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatInstant } from "@/lib/date-format";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listAwaitingInterview } from "@/lib/services/students";

export default async function InterviewerHome() {
  const [t, actor, format] = await Promise.all([getTranslations("queue"), requireRole("interviewer"), getFormatter()]);
  const queue = await listAwaitingInterview(db(), actor);
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("count", { n: queue.length })}</p>
      {queue.length === 0 && <p className="mt-3 text-muted">{t("empty")}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {queue.map((q) => (
          <li key={q.id} className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <Link href={`/students/${q.id}`} className="font-medium underline">{q.firstName} {q.lastName}</Link>
              <p className="text-sm text-muted">{[q.city, t("registered", { date: formatInstant(format, q.registeredAt) })].filter(Boolean).join(" · ")}</p>
            </div>
          </li>
        ))}
      </ul>
      <Link href="/students" className="mt-6 inline-block underline">{t("allStudents")}</Link>
      <Link href="/places" className="ms-4 mt-6 inline-block underline">{t("places")}</Link>
    </main>
  );
}
