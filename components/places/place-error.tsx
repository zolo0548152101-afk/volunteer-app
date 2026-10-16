import { getTranslations } from "next-intl/server";
import { Flash } from "@/components/flash";

const CODES = ["forbidden", "not_found", "name_required", "bad_numbers", "below_allocated", "has_active_placements", "generic"];

export async function PlaceError({ code }: { code?: string }) {
  if (!code || !CODES.includes(code)) return null;
  const t = await getTranslations("places.errors");
  return <Flash tone="error" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-700">{t(code)}</Flash>;
}
