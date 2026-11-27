import type { Exchange } from "./types.js";

export interface Issue {
  readonly message: string;
  readonly path?: readonly PropertyKey[];
}

export type Issues = readonly [Issue, ...Issue[]];

export type Validation<T> = { ok: true; value: T } | { ok: false; issues: Issues };

/**
 * A validator of `T`, in the shape of a Standard Schema.
 *
 * https://standardschema.dev
 */
export interface Schema<T> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "agentpages";
    readonly validate: (input: unknown) => { readonly value: T } | { readonly issues: Issues };
    readonly types?: { readonly input: unknown; readonly output: T };
  };
}

export type ExchangeSchemas<M> = {
  readonly [K in keyof M]: M[K] extends Exchange
    ? { readonly params: Schema<M[K]["params"]>; readonly result: Schema<M[K]["result"]> }
    : never;
};

/** Checks `input` against `schema`. `value` is `input` without the fields the spec does not know. */
export const validate = <T>(schema: Schema<T>, input: unknown): Validation<T> => {
  const result = schema["~standard"].validate(input);
  return "issues" in result ? { ok: false, issues: result.issues } : { ok: true, value: result.value };
};
