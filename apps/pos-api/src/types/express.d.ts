import type { JwtPayload } from "@nuatis/pos-shared";

declare global {
  namespace Express {
    interface Request {
      reqId: string;
      auth?: JwtPayload;
    }
  }
}
