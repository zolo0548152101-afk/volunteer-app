import type { Role } from "@/lib/permissions";

/** עמוד הבית לפי התפקיד החזק ביותר של המשתמש */
export function homeFor(roles: Role[]): string {
  if (roles.includes("manager")) return "/manager";
  if (roles.includes("coordinator")) return "/coordinator";
  if (roles.includes("interviewer")) return "/interviewer";
  if (roles.includes("student")) return "/student";
  return "/login";
}
