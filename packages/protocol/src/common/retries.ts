/** The upper bound of the random wait before the first retry, in milliseconds. It doubles with every retry. */
export const RETRY_BASE_MS = 250;

/** After this many attempts a view reports the last error to the page. */
export const MAX_ATTEMPTS = 6;
