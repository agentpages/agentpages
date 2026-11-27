import type { Failure, METHOD_NOT_FOUND } from "@agentpages/protocol";

/** What the Store made of a request it handled. */
export type Settled = { kind: "result"; result: unknown } | { kind: "failure"; failure: Failure };

/** The answer to a request. A tool or operation the Store does not have is the JSON-RPC "method not found". */
export type Answer = Settled | { kind: "unknown-method"; code: typeof METHOD_NOT_FOUND };
