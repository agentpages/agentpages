import * as v from "valibot";
import type { Schema } from "../common/schemas.js";
import { ERROR_NAMES, type ErrorName } from "./table.js";
import type { ErrorData, Failure } from "./types.js";

const errorDataEntries = {
  requestId: v.string(),
  message: v.string(),
  retryable: v.boolean(),
  retryAfterMs: v.exactOptional(v.number()),
  opIndex: v.exactOptional(v.number()),
};

export const ErrorDataSchema: Schema<ErrorData> = v.object(errorDataEntries);

const isNotRateLimited = (name: ErrorName): name is Exclude<ErrorName, "RateLimited"> => name !== "RateLimited";

export const FailureSchema: Schema<Failure> = v.variant("error", [
  v.object({ ...errorDataEntries, error: v.literal("RateLimited"), retryAfterMs: v.number() }),
  v.object({ ...errorDataEntries, error: v.picklist(ERROR_NAMES.filter(isNotRateLimited)) }),
]);
