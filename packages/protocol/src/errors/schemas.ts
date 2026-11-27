import * as v from "valibot";
import { CountSchema, IdSchema, type Raw } from "../common/schemas.js";
import { sealed } from "../common/seal.js";
import type { Schema } from "../common/validate.js";
import { ERROR_NAMES, ERRORS, type ErrorName } from "./table.js";
import type { ErrorData, Failure } from "./types.js";

type OtherName = Exclude<ErrorName, "RateLimited">;

const detailEntries = {
  requestId: IdSchema,
  message: v.string(),
  retryAfterMs: v.exactOptional(CountSchema),
  opIndex: v.exactOptional(CountSchema),
};

export const ErrorDataSchema: Raw<ErrorData> = v.object({ ...detailEntries, retryable: v.boolean() });

const isOtherName = (name: ErrorName): name is OtherName => name !== "RateLimited";

/** One error under its name, retryable exactly as the spec's table says. */
const named = <N extends OtherName>(error: N) => ({
  ...detailEntries,
  error: v.literal(error),
  retryable: v.literal(ERRORS[error].retryable),
});

export const FailureSchema: Schema<Failure> = sealed(
  v.variant("error", [
    v.object({
      ...detailEntries,
      error: v.literal("RateLimited"),
      retryable: v.literal(ERRORS.RateLimited.retryable),
      retryAfterMs: CountSchema,
    }),
    ...ERROR_NAMES.filter(isOtherName).map((error) => v.object(named(error))),
  ]),
);
