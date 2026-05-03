import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";

interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.statusCode ?? 500;

  logger.error(
    { err, requestId: req.reqId, method: req.method, url: req.url },
    "unhandled error"
  );

  // Report to Sentry with tenant + user context when available
  if (sentryEnabled && status >= 500) {
    Sentry.withScope((scope) => {
      if (req.auth) {
        scope.setUser({ id: req.auth.tenant_id });
        if (req.auth.kind === "session") {
          scope.setTag("user_id", req.auth.user_id);
        } else {
          scope.setTag("staff_id", req.auth.staff_id);
        }
      }
      scope.setTag("request_id", req.reqId ?? "unknown");
      Sentry.captureException(err);
    });
  }

  res.status(status).json({
    error: {
      code: status === 500 ? "INTERNAL_ERROR" : String(status),
      message:
        process.env["NODE_ENV"] === "production" && status === 500
          ? "An unexpected error occurred"
          : err.message,
    },
  });
}
