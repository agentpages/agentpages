import type { ErrorName } from "./table.js";

export interface ErrorData {
  requestId: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  opIndex?: number;
}

/** `Data` under one of the spec's error names. `RateLimited` always carries `retryAfterMs`. */
export type Named<Data> =
  | (Data & { error: "RateLimited"; retryAfterMs: number })
  | (Data & { error: Exclude<ErrorName, "RateLimited"> });

/** A failed request: the `structuredContent` of a failed tool call, and the source of a JSON-RPC error. */
export type Failure = Named<ErrorData>;

/** A failure before the spec's `retryable` for its error is filled in. */
export type FailureInput = Named<Omit<ErrorData, "retryable">>;

/** A request that breaks a rule which depends on the Store's limits. */
export interface Problem {
  error: "InvalidParams" | "LimitExceeded";
  message: string;
  opIndex?: number;
}

export interface ToolError {
  isError: true;
  structuredContent: Failure;
  content: [{ type: "text"; text: string }];
}
