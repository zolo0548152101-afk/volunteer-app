"use client";
import { useTranslations } from "next-intl";
import { isValidIsraeliId } from "@/lib/validation/israel";

/** שדה ת"ז עם בדיקת ספרת ביקורת בצד הלקוח, כדי שטעות לא תאפס את הטופס. השרת בודק שוב. */
export function IdInput({ label, defaultValue }: { label: string; defaultValue?: string | null }) {
  const t = useTranslations("profile.errors");
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        name="nationalId" defaultValue={defaultValue ?? ""} required inputMode="numeric" dir="ltr" autoComplete="off"
        className="rounded-lg border border-border bg-transparent px-3 py-2 text-base"
        onChange={(e) => e.currentTarget.setCustomValidity(isValidIsraeliId(e.currentTarget.value) ? "" : t("bad_id"))}
        ref={(el) => { if (el) el.setCustomValidity(!el.value || isValidIsraeliId(el.value) ? "" : t("bad_id")); }}
      />
    </label>
  );
}
