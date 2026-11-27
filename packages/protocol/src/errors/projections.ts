import { validate } from "../common/validate.js";
import { JsonRpcErrorSchema } from "../jsonrpc/schemas.js";
import type { JsonRpcError } from "../jsonrpc/types.js";
import { FailureSchema } from "./schemas.js";
import { ERROR_NAMES, ERRORS, type ErrorName } from "./table.js";
import type { Failure, ToolError } from "./types.js";

export const toJsonRpcError = ({ error, ...data }: Failure): JsonRpcError => ({
  code: ERRORS[error].code,
  message: data.message,
  data,
});

export const toToolError = (failed: Failure): ToolError => ({
  isError: true,
  structuredContent: failed,
  content: [{ type: "text", text: JSON.stringify(failed) }],
});

const nameOf = (code: number): ErrorName | undefined => ERROR_NAMES.find((name) => ERRORS[name].code === code);

/** Reads a JSON-RPC error of this protocol. Any other error, such as `-32601`, is `undefined`. */
export const fromJsonRpcError = (input: unknown): Failure | undefined => {
  const envelope = validate(JsonRpcErrorSchema, input);
  if (!envelope.ok) return undefined;
  const failed = validate(FailureSchema, { ...envelope.value.data, error: nameOf(envelope.value.code) });
  return failed.ok ? failed.value : undefined;
};
