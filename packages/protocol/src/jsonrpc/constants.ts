import type { JsonRpcFailed, JsonRpcMessage } from "./types.js";

export const JSONRPC_VERSION: JsonRpcMessage["jsonrpc"] = "2.0";

/** JSON-RPC "method not found": the answer to a method of an absent feature. */
export const METHOD_NOT_FOUND = -32_601;

/** The error of a request for a method its receiver does not have. */
export const methodNotFound = (): JsonRpcFailed["error"] => ({ code: METHOD_NOT_FOUND, message: "Method not found." });
