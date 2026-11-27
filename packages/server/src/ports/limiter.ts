import type { Principal } from "../access/principal.js";

export interface RateRequest {
  principal: Principal;
  method: string;
  /** The page a well-formed request names. */
  pageId: string | undefined;
}

export interface RateLimiter {
  /** How long the caller must wait, or nothing when the request may go on. A rejection means it cannot tell. */
  check(request: RateRequest): Promise<{ retryAfterMs: number } | undefined>;
}

/** Lets every request through. */
export const unlimited: RateLimiter = { check: async (): Promise<undefined> => {} };
