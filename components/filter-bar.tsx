import Link from "next/link";
import { EditDialog } from "@/components/edit-dialog";
import { SubmitButton } from "@/components/submit-button";

export type FilterField = { name: string; label: string; value: string | undefined; options: { value: string; label: string }[] };

/**
 * כפתור "סינון (n)" שפותח חלון עם כל המסננים, ותגיות למסננים הפעילים (כל תגית מסירה מסנן אחד).
 * נכנס לסרגל של ListView (פרמטר toolbar), ליד החיפוש החי. הסינון עצמו הוא GET רגיל לשרת.
 */
export function FilterBar({ action, keep, fields, labels }: {
  action: string;
  keep: Record<string, string>; // פרמטרים שנשארים תמיד (למשל status)
  fields: FilterField[];
  labels: { filter: string; title: string; all: string; apply: string; clear: string; remove: string };
}) {
  const active = fields.filter((f) => f.value);
  const href = (omit?: string) => {
    const p = new URLSearchParams(keep);
    for (const f of active) if (omit !== "*" && f.name !== omit) p.set(f.name, f.value!);
    return `${action}?${p.toString()}`;
  };
  const text = (f: FilterField) => f.options.find((o) => o.value === f.value)?.label ?? f.value;
  return (
    <>
      <EditDialog label={active.length ? `${labels.filter} (${active.length})` : labels.filter} title={labels.title} closeOnSubmit={false}
        className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm hover:bg-paper md:min-h-10">
        <form method="get" action={action} className="flex flex-col gap-3">
          {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1">{f.label}
              <select name={f.name} aria-label={f.label} defaultValue={f.value ?? ""} className="min-h-11 rounded-lg border border-border bg-background px-3">
                <option value="">{labels.all}</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          <div className="flex items-center gap-3">
            <SubmitButton className="min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">{labels.apply}</SubmitButton>
            {active.length > 0 && <Link href={href("*")} className="inline-flex min-h-11 items-center text-sm underline">{labels.clear}</Link>}
          </div>
        </form>
      </EditDialog>
      {active.map((f) => (
        <Link key={f.name} href={href(f.name)} aria-label={`${labels.remove}: ${f.label} ${text(f)}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs hover:bg-paper">
          <span className="text-ink-3">{f.label}:</span> {text(f)} <span aria-hidden="true">×</span>
        </Link>
      ))}
    </>
  );
}
