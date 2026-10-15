import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homeFor } from "@/lib/home";

export default async function Home() {
  const session = await auth();
  redirect(session ? homeFor(session.user.roles) : "/login");
}
