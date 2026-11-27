import * as v from "valibot";
import { expectationOf, type Raw } from "./schemas.js";
import type { Issue, Schema } from "./validate.js";

const KeySchema = v.union([v.string(), v.number()]);

const keyOf = (item: v.IssuePathItem): PropertyKey => v.parse(KeySchema, item.key);

/** An issue says what was expected and where, never what it received: that may be a document or a file. */
const issueOf = (issue: v.BaseIssue<unknown>): Issue => ({
  message: `Expected ${expectationOf(issue)}`,
  path: (issue.path ?? []).map(keyOf),
});

/** The public form of a schema, which shows nothing of the library behind it. */
export const sealed = <T>(raw: Raw<T>): Schema<T> => ({
  "~standard": {
    version: 1,
    vendor: "agentpages",
    validate: (input) => {
      const result = v.safeParse(raw, input);
      if (result.success) return { value: result.output };
      const [first, ...rest] = result.issues;
      return { issues: [issueOf(first), ...rest.map(issueOf)] };
    },
  },
});

interface Sealed<Params, Result> {
  readonly params: Schema<Params>;
  readonly result: Schema<Result>;
}

export const exchange = <Params, Result>(params: Raw<Params>, result: Raw<Result>): Sealed<Params, Result> => ({
  params: sealed(params),
  result: sealed(result),
});
