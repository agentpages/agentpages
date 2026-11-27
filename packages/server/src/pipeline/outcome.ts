import type { ErrorName } from "@agentpages/protocol";

/** Why the Store refuses a request. */
export interface Refusal {
  error: Exclude<ErrorName, "RateLimited">;
  message: string;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const refuse = (refusal: Refusal): Outcome<never> => ({ ok: false, refusal });
