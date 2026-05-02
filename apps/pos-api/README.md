# Nuatis POS API

Express ESM TypeScript API for Nuatis POS. Runs on port 3002.

> **Full local dev setup** (including Supabase, migrations, and the prototype frontend)
> is documented in the [root README](../../README.md#local-development).

## Quick Start (API only, no database)

```bash
# 1. From repo root
pnpm install

# 2. Copy env template — Supabase lines are commented out by default
cp apps/pos-api/.env.example apps/pos-api/.env

# 3. Start dev server (hot-reloads via tsx)
pnpm --filter @nuatis/pos-api dev
# → Listening on :3002  supabase: "not_configured"
```

## With local Supabase

See [root README → Local Development](../../README.md#local-development) for the full
`supabase start` → apply migrations → configure .env → boot → run tests flow.

Once `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set:
- `GET /v1/health` → `supabase:"connected"`
- All 27 integration tests activate: `pnpm --filter @nuatis/pos-api test` → 56 pass, 0 skip

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/health` | None | Liveness check + supabase status |
| POST | `/v1/auth/sign-in` | None | Email + password → session JWT (owner/manager) |
| POST | `/v1/auth/pin` | None | 4-digit PIN → terminal JWT (cashier) |
| GET | `/v1/menu/tree` | Terminal or Session | Full menu tree with modifiers |
| POST | `/v1/menu/categories` | Session (owner) | Create category |
| POST | `/v1/menu/items` | Session (owner) | Create menu item |
| PATCH | `/v1/menu/items/:id` | Session (owner) | Update name/price |
| DELETE | `/v1/menu/items/:id` | Session (owner) | Soft-delete item |
| POST | `/v1/orders` | Terminal | Create order |
| POST | `/v1/orders/:id/items` | Terminal | Add line item |
| DELETE | `/v1/orders/:id/items/:itemId` | Terminal | Void line item |
| POST | `/v1/orders/:id/send-to-kitchen` | Terminal | Fire order → kitchen |
| POST | `/v1/orders/:id/checkout` | Terminal | Compute totals (tax 8.25%) |
| POST | `/v1/orders/:id/payments` | Terminal | Record payment (card_mock in prototype) |

## Tests

```bash
pnpm --filter @nuatis/pos-api test
```

| Condition | Result |
|-----------|--------|
| No Supabase (default) | 25 pass, 25 skip |
| With `supabase start` | 56 pass, 0 skip |

## Folder structure

```
apps/pos-api/
├── src/
│   ├── index.ts              # Express app entry + CORS + graceful shutdown
│   ├── env.ts                # Zod-validated env (SUPABASE_URL optional)
│   ├── lib/
│   │   ├── jwt.ts            # signTerminalJwt / signSessionJwt / verifyJwt
│   │   ├── logger.ts         # Pino (pretty dev, JSON prod)
│   │   ├── passwords.ts      # bcrypt helpers
│   │   └── supabase.ts       # Singleton service_role client
│   ├── middleware/
│   │   ├── auth.ts           # requireAuth({ kinds }) JWT guard
│   │   ├── request-id.ts     # X-Request-Id per request
│   │   └── error-handler.ts  # Centralized error shape
│   └── routes/
│       ├── auth.ts           # sign-in + pin endpoints
│       ├── health.ts         # /v1/health
│       ├── menu/             # categories + items + tree
│       └── orders/           # full order state machine
├── .env                      # Local secrets — gitignored, never commit
├── .env.example              # Template — committed
└── README.md
```

## Conventions

- All imports use `.js` suffix (NodeNext ESM — source files are `.ts`)
- Never `console.log` — use `req.log` in route handlers, `logger` elsewhere
- Never read `process.env` directly — always go through `src/env.ts`
- All exported `Router` instances annotated `const xRouter: IRouter = Router()` (TS2742 guard)
