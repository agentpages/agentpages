/** The upper bound of the random wait before the first retry, in milliseconds. It doubles with every retry. */
export const RETRY_BASE_MS = 250;

/** After this many attempts a view reports the last error to the page. */
export const MAX_ATTEMPTS = 6;

/** The wait before retry `attempt`, from 0 (REL-12). `random` returns a number from 0 to 1, 1 excluded. */
export const retryWaitMs = (retry: { attempt: number; retryAfterMs?: number }, random: () => number): number =>
  (retry.retryAfterMs ?? 0) + random() * RETRY_BASE_MS * 2 ** retry.attempt;
