import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { SignInResponse } from "@nuatis/pos-shared";

const POS_API_URL = process.env["POS_API_URL"] ?? "http://localhost:3002";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${POS_API_URL}/v1/auth/sign-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const data = (await res.json()) as SignInResponse;

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email,
            tenant_id: data.user.tenant_id,
            role: data.user.role,
            posJwt: data.token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token["id"] = user.id;
        token["tenant_id"] = (user as { tenant_id: string }).tenant_id;
        token["role"] = (user as { role: "owner" | "manager" }).role;
        token["posJwt"] = (user as { posJwt: string }).posJwt;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token["id"] as string;
      session.user.tenant_id = token["tenant_id"] as string;
      session.user.role = token["role"] as "owner" | "manager";
      session.user.posJwt = token["posJwt"] as string;
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
});
