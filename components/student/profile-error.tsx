import { getTranslations } from "next-intl/server";
import { Flash } from "@/components/flash";

const CODES = ["bad_id", "bad_date", "bad_bank", "incomplete", "forbidden", "cf_required", "cf_invalid", "generic"];

export async function ProfileError({ code }: { code?: string }) {
  if (!code || !CODES.includes(code)) return null;
  const t = await getTranslations("profile.errors");
  return <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{t(code)}</Flash>;
}
