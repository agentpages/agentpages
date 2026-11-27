import type { Failure } from "../errors/types.js";
import type { METHOD_NOT_FOUND } from "../jsonrpc/constants.js";

/** What a Store made of a request it handled. */
export type Settled = { kind: "result"; result: unknown } | { kind: "failure"; failure: Failure };

/**
 * What a Store answers to a tool call or a host operation. One the Store does not have is the JSON-RPC "method not
 * found".
 */
export type Answer = Settled | { kind: "unknown-method"; code: typeof METHOD_NOT_FOUND };
