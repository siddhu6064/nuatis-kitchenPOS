import type { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../lib/jwt.js";
import type { JwtPayload } from "@nuatis/pos-shared";

interface RequireAuthOptions {
  kinds?: JwtPayload["kind"][];
}

export function requireAuth(opts: RequireAuthOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        error: { code: "unauthorized", message: "Missing or invalid Authorization header" },
      });
      return;
    }

    const token = authHeader.slice(7);

    let payload: JwtPayload;
    try {
      payload = await verifyJwt(token);
    } catch {
      res.status(401).json({
        error: { code: "unauthorized", message: "Invalid or expired token" },
      });
      return;
    }

    if (opts.kinds && opts.kinds.length > 0 && !opts.kinds.includes(payload.kind)) {
      res.status(401).json({
        error: {
          code: "unauthorized",
          message: `Token kind '${payload.kind}' not accepted by this endpoint`,
        },
      });
      return;
    }

    req.auth = payload;
    next();
  };
}
