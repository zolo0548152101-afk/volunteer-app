import { redirect } from "next/navigation";

// בשלב 0 הכל מפנה לכניסה. בשלב 2 תתווסף הפניה לפי תפקיד.
export default function Home() {
  redirect("/login");
}
