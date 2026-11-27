import type { Principal } from "../access/principal.js";

export interface RateRequest {
  principal: Principal;
  method: string;
  /** The page a well-formed request names. */
  pageId: string | undefined;
}

export interface RateLimiter {
  /** How long the caller must wait, or nothing when the request may go on. */
  check(request: RateRequest): { retryAfterMs: number } | undefined;
}

/** Lets every request through. */
export const unlimited: RateLimiter = { check: (): undefined => {} };
