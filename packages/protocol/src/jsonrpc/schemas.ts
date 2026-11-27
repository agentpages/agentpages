import * as v from "valibot";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import { ErrorDataSchema } from "../errors/schemas.js";
import type { JsonRpcError } from "./types.js";

export const JsonRpcErrorSchema: Schema<JsonRpcError> = sealed(
  v.object({ code: v.number(), message: v.string(), data: ErrorDataSchema }),
);
