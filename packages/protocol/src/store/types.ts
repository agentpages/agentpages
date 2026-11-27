import type { Failure } from "../errors/types.js";
import type { METHOD_NOT_FOUND } from "../jsonrpc/constants.js";

/** What a Store made of a request it handled. */
export type Settled = { kind: "result"; result: unknown } | { kind: "failure"; failure: Failure };

/**
 * What a Store answers to a tool call or a host operation. One the Store does not have is the JSON-RPC "method not
 * found".
 */
export type Answer = Settled | { kind: "unknown-method"; code: typeof METHOD_NOT_FOUND };

/** An operation a host runs for a viewer. The Store learns who the viewer is apart from it. */
export interface HostRequest {
  operation: string;
  input: unknown;
  /** The id the host chose for the request, as section 2.1 of the spec defines one. */
  requestId: string;
}

/** A method a view calls on its host. */
export interface ViewRequest {
  method: string;
  params: unknown;
  /** The page link the host holds for the view. It names the page and is the link the viewer presents. */
  url: string;
  /** The id the host chose for the request. */
  requestId: string;
}
