import * as v from "valibot";
import type { Schema } from "./schemas.js";

export type Issue = v.BaseIssue<unknown>;

export type Issues = [Issue, ...Issue[]];

export type Validation<T> = { ok: true; value: T } | { ok: false; issues: Issues };

/** Checks `input` against `schema`. A valid `input` comes back typed as `value`. */
export const validate = <T>(schema: Schema<T>, input: unknown): Validation<T> => {
  const result = v.safeParse(schema, input);
  return result.success ? { ok: true, value: result.output } : { ok: false, issues: result.issues };
};
