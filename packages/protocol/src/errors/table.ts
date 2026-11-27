export const ERROR_NAMES = [
  "NotFound",
  "Conflict",
  "Unauthenticated",
  "Forbidden",
  "LimitExceeded",
  "Unavailable",
  "RateLimited",
  "ResyncRequired",
  "InvalidParams",
  "Internal",
] as const;

export type ErrorName = (typeof ERROR_NAMES)[number];

export const ERRORS = {
  NotFound: { code: -32_050, retryable: false },
  Conflict: { code: -32_051, retryable: false },
  Unauthenticated: { code: -32_052, retryable: false },
  Forbidden: { code: -32_053, retryable: false },
  LimitExceeded: { code: -32_054, retryable: false },
  Unavailable: { code: -32_055, retryable: true },
  RateLimited: { code: -32_056, retryable: true },
  ResyncRequired: { code: -32_057, retryable: false },
  InvalidParams: { code: -32_602, retryable: false },
  Internal: { code: -32_603, retryable: false },
} as const;
