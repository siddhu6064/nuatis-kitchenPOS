import "./env.js"; // validate env on boot — must be first
import express from "express";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

const app = express();

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
