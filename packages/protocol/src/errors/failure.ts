import type { Issues } from "../common/validate.js";
import { ERRORS } from "./table.js";
import type { Failure, FailureInput } from "./types.js";

/** Long enough to name any field of the spec, short enough that no document or file fits in it. */
const MESSAGE_LENGTH = 300;

/** Builds a failure whose `retryable` is the spec's value for that error. */
export const failure = (input: FailureInput): Failure => ({ ...input, retryable: ERRORS[input.error].retryable });

const opIndexOf = (keys: readonly PropertyKey[]): { opIndex?: number } =>
  keys[0] === "ops" && typeof keys[1] === "number" ? { opIndex: keys[1] } : {};

/** Turns the issues of a failed validation into `InvalidParams`, naming the field and the failing op. */
export const invalidParams = ({ requestId, issues }: { requestId: string; issues: Issues }): Failure => {
  const [{ message, path = [] }] = issues;
  return failure({
    error: "InvalidParams",
    requestId,
    message: `${["params", ...path].join(".")}: ${message}`.slice(0, MESSAGE_LENGTH),
    ...opIndexOf(path),
  });
};
