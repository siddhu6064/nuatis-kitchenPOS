import type { Request, Response, NextFunction } from "express";
import type { StaffRole } from "@nuatis/pos-shared";

/**
 * Requires req.auth.role to be one of the allowed roles.
 * Must be used AFTER requireAuth middleware.
 * Returns 403 if the role is not permitted.
 */
export function requireRole(allowed: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        error: { code: "unauthorized", message: "Not authenticated" },
      });
      return;
    }

    if (!allowed.includes(req.auth.role as StaffRole)) {
      res.status(403).json({
        error: {
          code: "forbidden",
          message: `Role '${req.auth.role}' is not permitted to perform this action`,
        },
      });
      return;
    }

    next();
  };
}
