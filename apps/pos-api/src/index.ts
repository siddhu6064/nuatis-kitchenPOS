import "./env.js"; // validate env on boot — must be first
import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { onboardingRouter } from "./routes/onboarding/sign-up.js";
import { menuRouter } from "./routes/menu/index.js";
import { ordersRouter } from "./routes/orders/index.js";
import { cashRouter } from "./routes/cash/index.js";
import { reportsRouter } from "./routes/reports/index.js";
import { receiptViewRouter } from "./routes/receipts/index.js";
import { receiptHistoryRouter } from "./routes/receipts/history.js";
import { locationsRouter } from "./routes/locations/index.js";
import { staffRouter } from "./routes/staff/staff.js";
import { settingsRouter } from "./routes/settings/index.js";
import { webhookRouter } from "./routes/stripe/webhook.js";
import { onboardingRouter as stripeOnboardingRouter } from "./routes/stripe/onboarding.js";
import { terminalRouter } from "./routes/stripe/terminal.js";
import { refundsRouter } from "./routes/orders/refunds.js";
import { startReceiptEmailWorker } from "./workers/receipt-email.js";
import { startReceiptSmsWorker } from "./workers/receipt-sms.js";
import { startEodRollupWorker } from "./workers/end-of-day-rollup.js";
import { closeQueues, scheduleEodCron } from "./lib/queue.js";

const app = express();

// CORS — only applied when CORS_ALLOWED_ORIGINS is configured (needed for
// local dev where the Vite dev server runs on a different port from the API).
if (env.CORS_ALLOWED_ORIGINS) {
  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin not allowed — ${origin}`));
        }
      },
      credentials: true,
    })
  );
  logger.info({ allowedOrigins }, "CORS enabled");
}

// Middleware — order matters
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as express.Request).reqId ?? "",
  })
);

// ---------------------------------------------------------------------------
// IMPORTANT: Stripe webhook MUST be mounted BEFORE express.json().
// The webhook handler uses express.raw() internally so it can access the raw
// request body for Stripe signature verification. Once express.json() runs,
// the raw buffer is discarded and signature verification fails.
// ---------------------------------------------------------------------------
app.use("/v1/webhooks/stripe", webhookRouter);

app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/v1", healthRouter);
app.use("/v1/auth", authRouter);
app.use("/v1/onboarding", onboardingRouter);
app.use("/v1/menu", menuRouter);
app.use("/v1/orders", ordersRouter);
app.use("/v1/cash", cashRouter);
app.use("/v1/reports", reportsRouter);
app.use("/v1/locations", locationsRouter);
app.use("/v1/staff", staffRouter);
app.use("/v1/receipts", receiptHistoryRouter);
app.use("/v1/settings", settingsRouter);
app.use("/v1/payments", refundsRouter);
// Public receipt view — no auth, signed token required
app.use("/r", receiptViewRouter);

// Stripe — Connect onboarding + Terminal + webhooks
app.use("/v1/stripe/onboarding", stripeOnboardingRouter);
app.use("/v1/stripe/terminal", terminalRouter);

// Error handler — must be last
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "pos-api ready");
});

// BullMQ workers — start in same process when Redis is configured
const emailWorker = startReceiptEmailWorker();
const smsWorker = startReceiptSmsWorker();
const eodWorker = startEodRollupWorker();

if (emailWorker) {
  logger.info("receipt workers running (Redis connected)");
} else {
  logger.info("receipt workers in mock mode (UPSTASH_REDIS_URL not set)");
}

if (eodWorker) {
  logger.info("end-of-day rollup worker running (Redis connected)");
  // Register the repeatable cron job asynchronously — non-fatal if it fails
  scheduleEodCron().catch((err: Error) => {
    logger.error({ err }, "failed to schedule end-of-day cron");
  });
} else {
  logger.info("end-of-day rollup worker in mock mode (UPSTASH_REDIS_URL not set)");
}

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, "shutdown signal received — closing server");
  void Promise.all([
    emailWorker?.close(),
    smsWorker?.close(),
    eodWorker?.close(),
    closeQueues(),
  ]).then(() => {
    server.close(() => {
      logger.info("server closed");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
