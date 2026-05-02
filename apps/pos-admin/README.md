# Nuatis POS Admin

Back-office admin portal for Nuatis POS — built with Next.js 14 App Router, Auth.js v5, Tailwind v3, and React Query v5.

## Quick start

```bash
cd apps/pos-admin
cp .env.example .env.local
# fill in NEXTAUTH_SECRET, AUTH_SECRET, POS_API_URL
pnpm dev
```

Visit http://localhost:3001

## Routes

| Path | Status | Description |
|------|--------|-------------|
| `/sign-in` | Live | Email + password sign-in |
| `/sign-up` | Live | Owner self-registration (creates tenant + location) |
| `/` | Live | Dashboard home with summary cards |
| `/menu` | Live | Full menu CRUD (categories, items, modifier groups) |
| `/orders` | Placeholder | Coming in Batch 14 |
| `/cash` | Placeholder | Coming in Batch 14 |
| `/reports` | Placeholder | Coming in Batch 14 |
| `/staff` | Placeholder | Coming in Batch 14 |
| `/receipts` | Placeholder | Coming in Batch 14 |
| `/settings` | Placeholder | Coming soon |

## Auth.js v5 setup

- `src/auth.ts` — NextAuth config with Credentials provider; calls `POST /v1/auth/sign-in` on pos-api
- `src/middleware.ts` — protects all routes except `/sign-in`, `/sign-up`, `/api/auth/*`
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handlers
- `src/types/next-auth.d.ts` — module augmentation for `tenant_id`, `role`, `posJwt`

## Sign-up flow

`POST /v1/onboarding/sign-up` (pos-api, no auth) creates:
1. `tenants` row (name, vertical, timezone)
2. `locations` row (auto-default, same name, 8.25% tax)
3. `staff_members` row (role = owner, bcrypt password hash cost 12)

On success, the sign-up page auto-signs-in via `signIn('credentials', ...)`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` | Secret for Auth.js JWT signing (openssl rand -base64 32) |
| `AUTH_SECRET` | Same as NEXTAUTH_SECRET (Auth.js v5 alias) |
| `POS_API_URL` | pos-api base URL, server-to-server (default: http://localhost:3002) |
| `NEXT_PUBLIC_POS_API_URL` | pos-api base URL for client-side fetches |
