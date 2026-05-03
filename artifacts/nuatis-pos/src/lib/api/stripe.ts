import { post } from "./client";

export interface ConnectionTokenResponse {
  secret: string;
}

/**
 * Fetch a Stripe Terminal connection token from the POS API.
 * Used by StripeTerminalProvider's onFetchConnectionToken callback.
 */
export async function getConnectionToken(): Promise<ConnectionTokenResponse> {
  return post<ConnectionTokenResponse, Record<string, never>>(
    "/v1/stripe/terminal/connection-token",
    {}
  );
}
