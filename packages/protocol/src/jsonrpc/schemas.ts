import * as v from "valibot";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import { ErrorDataSchema } from "../errors/schemas.js";
import { JSONRPC_VERSION } from "./constants.js";
import type { JsonRpcError, JsonRpcMessage } from "./types.js";

export const JsonRpcErrorSchema: Schema<JsonRpcError> = sealed(
  v.object({ code: v.number(), message: v.string(), data: ErrorDataSchema }),
);

const envelope = { jsonrpc: v.literal(JSONRPC_VERSION) };

const answered = { ...envelope, id: v.union([v.string(), v.number()]) };

const called = { method: v.string(), params: v.exactOptional(v.unknown()) };

/** One message of JSON-RPC 2.0. A request is told from a notification by its `id`, which a notification must not have. */
export const JsonRpcMessageSchema: Schema<JsonRpcMessage> = sealed(
  v.union([
    v.object({ ...answered, ...called }),
    v.object({ ...envelope, ...called, id: v.exactOptional(v.never()) }),
    v.object({ ...answered, result: v.unknown() }),
    v.object({
      ...answered,
      error: v.object({ code: v.number(), message: v.string(), data: v.exactOptional(v.unknown()) }),
    }),
  ]),
);
