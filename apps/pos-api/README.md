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
- All integration tests activate: `pnpm --filter @nuatis/pos-api test` → 58 pass, 0 skip

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
| DELETE | `/v1/orders/:id/items/:item_id` | Terminal | Void line item |
| POST | `/v1/orders/:id/items/:item_id/bump` | Terminal or Session | Bump (dismiss) item on KDS |
| POST | `/v1/orders/:id/send-to-kitchen` | Terminal | Fire order → kitchen + Realtime broadcast |
| POST | `/v1/orders/:id/checkout` | Terminal | Compute totals (tax 8.25%) |
| POST | `/v1/orders/:id/payments` | Terminal | Record payment; cash requires open shift |
| POST | `/v1/orders/:id/void` | Any + manager PIN | Void order (managers direct; cashiers need PIN) |
| POST | `/v1/orders/:id/receipts` | Terminal or Session | Enqueue email + SMS receipt delivery |
| GET | `/r/:token` | Public (signed token) | Web receipt page (HTML, 90-day signed URL) |
| POST | `/v1/cash/sessions` | Terminal or Session | Open a new cash drawer shift |
| GET | `/v1/cash/sessions/current` | Terminal or Session | Get open session for a location |
| GET | `/v1/cash/sessions/:id` | Terminal or Session | Session detail + all cash events |
| POST | `/v1/cash/sessions/:id/events` | Terminal or Session | Log cash event (pay_out/no_sale need PIN) |
| POST | `/v1/cash/sessions/:id/close` | Terminal or Session | Close shift; calculates expected + variance |
| GET | `/v1/cash/sessions` | Session (owner/manager) | List sessions with optional filters |
| GET | `/v1/reports/end-of-day` | Session (owner/manager) | End-of-day report for a date (`?date=YYYY-MM-DD`) |
| GET | `/v1/reports/end-of-day.csv` | Session (owner/manager) | CSV export of end-of-day report |
| GET | `/v1/reports/daily-history` | Session (owner/manager) | List daily snapshots (`?limit=30`, max 90) |

## Reports Architecture

End-of-day reports use a **snapshot-based** model:

```
Cron (*/5 * * * *)
    ↓ checks all tenant local times
    ↓ enqueues "rollup" job when tenant clock hits 00:01–00:06
    ↓
BullMQ Worker (end-of-day-rollup)
    ↓ fetches orders / items / payments / refunds for the date
    ↓ runs pure aggregateEndOfDay() function
    ↓ UPSERTs into reports_daily (idempotent — SELECT first, then INSERT or UPDATE)
    ↓ optionally emails owner when tenant.email_daily_report=true
```

### Report response shape

`GET /v1/reports/end-of-day?date=YYYY-MM-DD` returns:

| Field | Notes |
|-------|-------|
| `is_snapshot` | `true` = served from `reports_daily`; `false` = live aggregation |
| `gross_sales_cents` | Σ `payment.amount_cents − tip_cents` for `status=succeeded` |
| `tips_cents` | Σ `payment.tip_cents` for succeeded payments |
| `tax_cents` | Σ `order.tax_cents` for paid orders |
| `taxable_cents` | Σ item gross for non-voided items with `menu_item.taxable=true` |
| `voids_cents` | Σ `order.subtotal + tax` for orders voided *on the date* (uses `voided_at`) |
| `refunds_cents` | Σ refund amounts where `refund.created_at` falls on the date |
| `net_cents` | `gross_sales + tips − refunds` |
| `by_method` | Per-payment-method count + gross |
| `by_item` | Per-item qty, gross, % of total |
| `by_staff` | Per-staff ticket count + gross + tips |

Date boundary: a row counts for date X if its timestamp falls within X 00:00:00–23:59:59 **in the tenant's timezone** (default: `America/Chicago`).

### Immutable history / refunds after close

`reports_daily` rows are never deleted. The `refunds_after_close_cents` column tracks refunds processed after the snapshot date without rewriting the historical `refunds_cents` total. This preserves immutable night-of numbers for accounting.

### Mock mode

Same pattern as receipts: when `UPSTASH_REDIS_URL` is absent, the cron scheduler logs `[mock] cron disabled` and no jobs are enqueued. The `/v1/reports/end-of-day` route still works via live aggregation.

## Manager PIN Override Flow

Some actions require a manager to physically approve at the terminal:

| Endpoint | Trigger |
|----------|---------|
| `POST /v1/orders/:id/void` | When caller is a cashier (terminal JWT) |
| `POST /v1/cash/sessions/:id/events` | When `type` is `pay_out` or `no_sale` |

**Protocol:**

1. Client calls the endpoint without `manager_pin` in the body.
2. Server responds `403` with `{ error: { code: "manager_pin_required" } }`.
3. Terminal displays a PIN entry modal — a manager physically enters their PIN.
4. Client retries the **same** request with `{ ..., manager_pin: "XXXX" }` merged into the body.
5. Server bcrypt-compares against all `owner`/`manager` staff for the tenant (constant-ish iteration to resist timing attacks).
6. On match: request proceeds; `req.manager_id` is set; a `manager_pin_override` audit log entry is written.
7. On mismatch: `403` with `{ error: { code: "manager_pin_invalid" } }`.

> Session JWT holders with `owner` or `manager` role bypass the PIN check entirely on `void` — they can void directly.

## Cash Drawer Lifecycle

```
open shift (POST /sessions)
    ↓
take cash sales → auto-logged via POST /orders/:id/payments method=cash
    ↓
pay_in / pay_out (manager PIN) / no_sale (manager PIN)
    ↓
close shift (POST /sessions/:id/close)
    expected = float + Σcash_sale - Σcash_refund + Σpay_in - Σpay_out
    variance = actual_count - expected
```

- One open session per location at a time (enforced by partial unique index).
- All amounts in cents (integers). Variance can be negative (short) or positive (over).

## Receipt Workers

After a payment is recorded, the POS terminal can call `POST /v1/orders/:id/receipts` with the
customer's email, phone, or both. The API signs a 90-day receipt token and enqueues BullMQ jobs
for delivery.

### Mock mode (default — no external accounts needed)

All three external services (Upstash Redis, Resend, Telnyx) are **optional**. When their env vars
are absent, the server boots normally and `POST /v1/orders/:id/receipts` still returns the expected
response — the jobs are logged to stdout instead of being delivered.

```
[mock] would enqueue receipt-email job
[mock email] customer@example.com — Receipt from Nuatis Cafe...
```

### Real delivery setup

| Service | Env var | Purpose |
|---------|---------|---------|
| [Upstash Redis](https://console.upstash.com) | `UPSTASH_REDIS_URL` | BullMQ job queue + retry |
| [Resend](https://resend.com) | `RESEND_API_KEY` | Email delivery |
| [Telnyx](https://telnyx.com) | `TELNYX_API_KEY` + `TELNYX_FROM_NUMBER` | SMS delivery |
| — | `RECEIPT_BASE_URL` | Public base URL for `/r/:token` links |
| — | `RECEIPT_TOKEN_SECRET` | Separate signing key (falls back to `POS_JWT_SECRET`) |

Workers run **in the same process** as the Express server (single-process MVP). In production,
split them to a dedicated worker process by running `src/workers/receipt-email.ts`,
`src/workers/receipt-sms.ts`, and `src/workers/end-of-day-rollup.ts` directly against the same
Redis queue.

### TCPA compliance

When the customer provides a phone number, they must check the TCPA opt-in checkbox on the
receipt prompt screen. The exact consent text and the customer's IP address are stored in the
`contacts` table (`sms_opt_in_text`, `sms_opt_in_ip`). The SMS worker re-fetches the contact and
aborts delivery if `sms_opt_in` has been revoked since the job was enqueued.

### Testing receipt flow locally

```bash
# 1. Boot the API (any terminal JWT works)
pnpm --filter @nuatis/pos-api dev

# 2. Authenticate + complete an order → get a paid order id

# 3. Send a mock receipt (no Redis/Resend/Telnyx needed)
curl -X POST http://localhost:3002/v1/orders/<order_id>/receipts \
  -H "Authorization: Bearer <terminal_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
# → {"jobs_enqueued":["email"],"receipt_token":"eyJ..."}

# 4. View the receipt page
open "http://localhost:3002/r/<receipt_token>"
```

## Tests

```bash
pnpm --filter @nuatis/pos-api test
```

| Condition | Result |
|-----------|--------|
| No Supabase, no Redis (default) | 104+ pass, 42 skip |
| With `supabase start` | ~145+ pass, 0 skip |

## Folder structure

```
apps/pos-api/
├── src/
│   ├── index.ts              # Express app entry + CORS + graceful shutdown
│   ├── env.ts                # Zod-validated env (SUPABASE_URL optional)
│   ├── lib/
│   │   ├── db.ts             # tenantSelect / recalcOrderTotals / calculateExpectedCash / writeAuditLog
│   │   ├── email.ts          # sendReceiptEmail — Resend SDK or mock log
│   │   ├── jwt.ts            # signTerminalJwt / signSessionJwt / verifyJwt
│   │   ├── logger.ts         # Pino (pretty dev, JSON prod)
│   │   ├── passwords.ts      # bcrypt helpers (hashPin / verifyPin / hashPassword / verifyPassword)
│   │   ├── queue.ts          # BullMQ queue singletons + enqueue helpers + EOD cron scheduler
│   │   ├── receipt-token.ts  # signReceiptToken / verifyReceiptToken (90-day HS256 JWT)
│   │   ├── reports.ts        # aggregateEndOfDay() — pure aggregation, no DB, fully unit-tested
│   │   ├── sms.ts            # sendSms — Telnyx HTTP API or mock log
│   │   └── supabase.ts       # Singleton service_role client
│   ├── middleware/
│   │   ├── auth.ts           # requireAuth({ kinds }) JWT guard
│   │   ├── manager-pin.ts    # requireManagerPin() — 403→retry PIN override pattern
│   │   ├── request-id.ts     # X-Request-Id per request
│   │   ├── role-guard.ts     # requireRole([...]) session-role guard
│   │   └── error-handler.ts  # Centralized error shape
│   ├── routes/
│   │   ├── auth.ts           # sign-in + pin endpoints
│   │   ├── health.ts         # /v1/health
│   │   ├── cash/             # cash drawer lifecycle (open/close shift, events, variance)
│   │   ├── menu/             # categories + items + tree
│   │   ├── orders/           # full order state machine + KDS bump + void + receipt send
│   │   ├── receipts/         # send.ts (POST /:id/receipts) + view.ts (GET /r/:token)
│   │   └── reports/          # end-of-day.ts + csv.ts + list.ts (EOD report, CSV export, history)
│   └── workers/
│       ├── end-of-day-rollup.ts  # cron-check (*/5 * * * *) + tenant rollup + optional owner email
│       ├── receipt-email.ts      # BullMQ worker — fetches order, renders HTML, sends via Resend
│       └── receipt-sms.ts        # BullMQ worker — TCPA double-check, sends via Telnyx
├── .env                      # Local secrets — gitignored, never commit
├── .env.example              # Template — committed
└── README.md
```

## Conventions

- All imports use `.js` suffix (NodeNext ESM — source files are `.ts`)
- Never `console.log` — use `req.log` in route handlers, `logger` elsewhere
- Never read `process.env` directly — always go through `src/env.ts`
- All exported `Router` instances annotated `const xRouter: IRouter = Router()` (TS2742 guard)
- `tenant_id` always from `req.auth` — never from the request body
- All money in cents (integers) — no floats
