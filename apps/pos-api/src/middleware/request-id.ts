import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// Extend Express Request with our request id field.
// We use `reqId` to avoid colliding with IncomingMessage.id (string vs number).
declare global {
  namespace Express {
    interface Request {
      reqId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.reqId = randomUUID();
  res.setHeader("X-Request-Id", req.reqId);
  next();
}
