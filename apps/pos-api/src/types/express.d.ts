import type { JwtPayload } from "@nuatis/pos-shared";

declare global {
  namespace Express {
    interface Request {
      reqId: string;
      auth?: JwtPayload;
      /**
       * Set by requireManagerPin middleware when a manager PIN override
       * is validated. Contains the staff_id of the manager who approved.
       */
      manager_id?: string;
    }
  }
}
