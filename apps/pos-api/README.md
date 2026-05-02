# Nuatis POS API

Express ESM TypeScript API for Nuatis POS. Runs on port 3002.

## Quick Start

```bash
# 1. Copy env template and fill in Supabase credentials (or leave blank to start without DB)
cp .env.example .env

# 2. Install dependencies from repo root
pnpm install

# 3. Start dev server (hot-reloads via tsx)
pnpm api:dev
```

The server starts at `http://localhost:3002`. Supabase credentials are optional —
the health endpoint reports `supabase: "not_configured"` if they're missing.

## Folder Structure

```
apps/pos-api/
├── src/
│   ├── index.ts             # Entry point — Express app + graceful shutdown
│   ├── env.ts               # Zod-validated environment config
│   ├── lib/
│   │   ├── logger.ts        # Pino logger (pretty in dev, JSON in prod)
│   │   └── supabase.ts      # Singleton Supabase service_role client
│   ├── middleware/
│   │   ├── request-id.ts    # UUID per request, X-Request-Id header
│   │   └── error-handler.ts # Centralized error responses
│   └── routes/
│       └── health.ts        # GET /v1/health
├── .env.example             # Env template (commit this, never .env)
├── package.json
├── tsconfig.json
└── README.md
```

## Adding a New Route

1. Create `src/routes/<name>.ts` exporting a `Router`
2. Add route handlers — use `.js` import suffixes (NodeNext convention)
3. Mount in `src/index.ts`: `app.use('/v1', yourRouter)`

## Test the Health Endpoint

```bash
curl http://localhost:3002/v1/health
```

Expected response (no Supabase configured):
```json
{
  "status": "ok",
  "supabase": "not_configured",
  "uptime_ms": 42,
  "version": "0.1.0",
  "timestamp": "2026-05-02T12:00:00.000Z"
}
```

## Notes

- **Auth middleware**: not wired yet — coming in Batch 4
- **CORS**: not configured yet — added once admin/terminal hostnames are known (Batch 5+)
- **Module convention**: all imports use `.js` suffix per NodeNext ESM rules (even though source files are `.ts`)
- **Logging**: never use `console.log` — use the exported `logger` from `src/lib/logger.ts`
- **Env access**: always go through `src/env.ts` — never read `process.env` directly elsewhere
