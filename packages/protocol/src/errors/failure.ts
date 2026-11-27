import type { Issues } from "../common/validate.js";
import { ERRORS } from "./table.js";
import type { Failure, FailureInput } from "./types.js";

/** Builds a failure whose `retryable` is the spec's value for that error. */
export const failure = (input: FailureInput): Failure => ({ ...input, retryable: ERRORS[input.error].retryable });

const opIndexOf = (keys: unknown[]): { opIndex?: number } =>
  keys[0] === "ops" && typeof keys[1] === "number" ? { opIndex: keys[1] } : {};

/** Turns the issues of a failed validation into `InvalidParams`, naming the field and the failing op. */
export const invalidParams = ({ requestId, issues }: { requestId: string; issues: Issues }): Failure => {
  const [issue] = issues;
  const keys = (issue.path ?? []).map((item) => item.key);
  return failure({
    error: "InvalidParams",
    requestId,
    message: `${["params", ...keys].join(".")}: ${issue.message}`,
    ...opIndexOf(keys),
  });
};
