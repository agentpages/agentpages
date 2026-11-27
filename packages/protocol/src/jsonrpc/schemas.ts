import * as v from "valibot";
import type { Schema } from "../common/schemas.js";
import { ErrorDataSchema } from "../errors/schemas.js";
import type { JsonRpcError } from "./types.js";

export const JsonRpcErrorSchema: Schema<JsonRpcError> = v.object({
  code: v.number(),
  message: v.string(),
  data: ErrorDataSchema,
});
