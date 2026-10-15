import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { homeFor } from "@/lib/home";

export default async function Home() {
  const actor = await getActor();
  redirect(actor ? homeFor(actor.roles) : "/login");
}
