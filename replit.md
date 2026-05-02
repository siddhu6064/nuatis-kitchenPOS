# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Nuatis POS (`artifacts/nuatis-pos`)
- React + Vite, TypeScript, Tailwind CSS
- Preview path: `/`
- Replit Auth gated (OIDC via `@workspace/replit-auth-web`)
- Cafe POS prototype — menu grid + cart sidebar
- 12 hardcoded menu items in `src/data/menu.ts`
- Cart persisted to localStorage under `nuatis_pos_cart_v1`
- Tax rate: 8.25%

### API Server (`artifacts/api-server`)
- Express 5 + Drizzle ORM
- Auth routes: `/api/login`, `/api/callback`, `/api/logout`, `/api/auth/user`
- Sessions stored in PostgreSQL (`sessions` table via `replit-auth` schema)

### POS API (`apps/pos-api`) — development/test server
- Express ESM TypeScript on port 3002
- 11 Supabase migrations, full route coverage (auth, menu, orders, KDS, cash drawer, receipts)
- **Batch 11**: Receipt pipeline — `POST /v1/orders/:id/receipts`, `GET /r/:token`, BullMQ workers (email via Resend, SMS via Telnyx), 90-day signed receipt token, TCPA opt-in
- All external services (Upstash Redis, Resend, Telnyx) optional — graceful mock mode
- 76 tests passing (35 skip without Supabase, 1 todo)

### pos-shared (`packages/pos-shared`)
- Composite TypeScript library — Zod schemas shared between pos-api and nuatis-pos
- Schemas: auth, cash, common, menu, orders, receipts, staff

## Auth

- Replit Auth (OpenID Connect with PKCE)
- Server: `lib/auth.ts`, `middlewares/authMiddleware.ts`, `routes/auth.ts`
- Client: `@workspace/replit-auth-web` → `useAuth()` hook
- DB session table provisioned via `lib/db/src/schema/auth.ts`
