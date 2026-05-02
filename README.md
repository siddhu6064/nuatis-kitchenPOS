# Nuatis POS — Cafe Prototype

Full-stack cafe POS prototype built as an integration testbed for the Nuatis POS product.

> **Status: Phase 0 Batch 7 complete.**
> Local Supabase + integration test activation is Batch 8 (requires Docker — see below).

## ⚠️ This is a prototype, not production code

- Payments are mocked (auto-approve after 2.5 s, no real card processing)
- Single demo merchant seeded in `supabase/seed.sql`
- Production build will be Next.js 14 + Stripe Terminal; architecture here does not carry forward

## What it demonstrates

- PIN sign-in (cashier) → menu (live from API) → cart → checkout → tip → mock pay → approved → receipt
- Full order state machine: `open → fired → paid` persisted in Postgres
- Realtime kitchen broadcast via Supabase Realtime
- Printable receipt with thermal-printer `@media print` stylesheet

---

## Local Development

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Docker Desktop | ≥ 4.x | [docker.com](https://www.docker.com/products/docker-desktop/) — **required** for local Supabase |
| Supabase CLI | ≥ 2 | `npx supabase` (no global install needed) |

> **Docker is required.** `supabase start` launches a full Supabase stack (Postgres, Auth, Realtime, Studio) inside Docker containers. Without Docker, the API can still boot but will report `supabase: "not_configured"` and all DB operations will fail.

---

### Step 1 — Clone and install

```bash
git clone <repo>
cd nuatis-pos
pnpm install
```

---

### Step 2 — Start local Supabase

```bash
npx supabase start
```

This pulls Docker images on first run (≈ 1–3 min), then prints:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      anon key: eyJ...
  service_role key: eyJ...
```

Copy the **service_role key** — you need it in the next step.

Apply migrations and seed data:

```bash
npx supabase db reset
```

Verify:

```bash
npx supabase db psql --command "select count(*) from menu_items;"
# → count = 12
```

---

### Step 3 — Configure environment files

**API server** — copy template and fill in:

```bash
cp apps/pos-api/.env.example apps/pos-api/.env
```

Edit `apps/pos-api/.env` — paste the `service_role key` from `supabase start`:

```env
PORT=3002
NODE_ENV=development
LOG_LEVEL=debug
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<paste_service_role_key>
POS_JWT_SECRET=<openssl rand -base64 32>
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

**Prototype frontend** — already has the correct demo UUIDs:

```bash
cp artifacts/nuatis-pos/.env.example artifacts/nuatis-pos/.env
# No edits needed — demo UUIDs are pre-filled from seed.sql
```

**Receipt delivery (optional — mock mode works without these):**

| Service | Env var in `apps/pos-api/.env` | Purpose |
|---------|-------------------------------|---------|
| [Upstash Redis](https://console.upstash.com) | `UPSTASH_REDIS_URL` | BullMQ job queue |
| [Resend](https://resend.com) | `RESEND_API_KEY` | Email delivery |
| [Telnyx](https://telnyx.com) | `TELNYX_API_KEY` + `TELNYX_FROM_NUMBER` | SMS delivery |

When absent, receipts are logged to stdout and the API still accepts requests normally.

---

### Step 4 — Boot the API and prototype

**Terminal 1 — API:**

```bash
pnpm --filter @nuatis/pos-api dev
# Listening on :3002 — supabase: "connected"
```

**Terminal 2 — Prototype:**

```bash
pnpm --filter @workspace/nuatis-pos dev
# Vite ready on http://localhost:5173
```

---

### Step 5 — Open the prototype

Open [http://localhost:5173](http://localhost:5173).

- Sign in with PIN `1234` (demo credentials, see seed.sql)
- Menu grid loads 12 items from the real database (6 drinks + 6 food)
- Build an order, tap "Send to Kitchen", complete the mock payment
- Inspect the result in Supabase Studio at [http://localhost:54323](http://localhost:54323)

---

### Demo credentials

| Role | Login | Credential |
|------|-------|------------|
| Owner | owner@democafe.test | password: `demo1234` |
| Cashier (terminal PIN) | — | PIN: `1234` |

These are seeded in `supabase/seed.sql` and intentionally committed — dev only.

---

### Stop the stack

```bash
npx supabase stop          # stops containers, keeps data
npx supabase stop --backup # stops and backs up volumes
```

---

### Run the test suite

With local Supabase running and `apps/pos-api/.env` configured:

```bash
pnpm --filter @nuatis/pos-api test
# Expected: 56 pass, 0 skip
```

Without Supabase (unit tests only):

```bash
pnpm --filter @nuatis/pos-api test
# Expected: 29 pass, 27 skip (integration tests auto-skip when SUPABASE_URL unset)
```

---

### More Supabase commands

See [`supabase/LOCAL_DEV.md`](supabase/LOCAL_DEV.md) for Studio, migrations, diff, and reset workflows.

---

Built by Siddhu · Nuatis LLC
