import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

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
