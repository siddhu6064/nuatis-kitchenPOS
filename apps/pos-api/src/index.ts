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
import { menuRouter } from "./routes/menu/index.js";
import { ordersRouter } from "./routes/orders/index.js";
import { cashRouter } from "./routes/cash/index.js";

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
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/v1", healthRouter);
app.use("/v1/auth", authRouter);
app.use("/v1/menu", menuRouter);
app.use("/v1/orders", ordersRouter);
app.use("/v1/cash", cashRouter);

// Error handler — must be last
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "pos-api ready");
});

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, "shutdown signal received — closing server");
  server.close(() => {
    logger.info("server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
