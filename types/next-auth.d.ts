import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: { id: string; organizationId: string; roles: Role[]; name?: string | null; email?: string | null };
  }
  interface User {
    organizationId: string;
    roles: Role[];
  }
}

