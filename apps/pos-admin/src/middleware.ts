export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /sign-in, /sign-up  (public auth pages)
     * - /api/auth/*         (NextAuth route handlers)
     * - /_next/*            (Next.js internals)
     * - /favicon.ico, /robots.txt, etc.
     */
    "/((?!sign-in|sign-up|api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
