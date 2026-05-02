import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenant_id: string;
      role: "owner" | "manager";
      posJwt: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    tenant_id: string;
    role: "owner" | "manager";
    posJwt: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    tenant_id?: string;
    role?: "owner" | "manager";
    posJwt?: string;
  }
}
