import {
  ERROR_NAMES,
  type ErrorName,
  failure,
  type FailureInput,
  FailureSchema,
  fromJsonRpcError,
  invalidParams,
  METHOD_NOT_FOUND,
  METHOD_SCHEMAS,
  type Schema,
  toJsonRpcError,
  toToolError,
  validate,
} from "@agentpages/protocol";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { RULES } from "./support/rules.ts";
import { errorRows } from "./support/spec.ts";
import { subject, verdict } from "./support/subjects.ts";

const REQUEST = { requestId: "request-1", message: "What was wrong." };

const inputOf = (error: ErrorName): FailureInput =>
  error === "RateLimited" ? { ...REQUEST, error, retryAfterMs: 1500 } : { ...REQUEST, error };

interface Detail {
  requestId: string;
  message: string;
  retryAfterMs: number;
  opIndex?: number;
}

const details: fc.Arbitrary<Detail> = fc.record(
  { requestId: fc.string(), message: fc.string(), opIndex: fc.nat(), retryAfterMs: fc.nat() },
  { requiredKeys: ["requestId", "message", "retryAfterMs"] },
);

const detailed = ([error, detail]: [ErrorName, Detail]): FailureInput =>
  error === "RateLimited" ? { ...detail, error } : { ...detail, error };

const inputs: fc.Arbitrary<FailureInput> = fc.tuple(fc.constantFrom(...ERROR_NAMES), details).map(detailed);

const rejected = (schema: Schema<unknown>, params: unknown): ReturnType<typeof invalidParams> => {
  const result = validate(schema, params);
  if (result.ok) throw new Error("These params are valid.");
  return invalidParams({ requestId: REQUEST.requestId, issues: result.issues });
};

const OP_ID = "0b1f4c7e-52a9-4d38-8e6f-a1c2d3e4f5a6";

const COMMIT = METHOD_SCHEMAS["agentpages/state/commit"].params;

test.each(ERROR_NAMES)("[ERR-2] a %s failure is retryable exactly when the table says so", (error) => {
  const expected = errorRows.find((row) => row.name === error)?.retryable;

  expect(failure(inputOf(error)).retryable).toBe(expected);
  expect(toJsonRpcError(failure(inputOf(error))).data.retryable).toBe(expected);
  expect(toToolError(failure(inputOf(error))).structuredContent.retryable).toBe(expected);
});

test("[ERR-3] the message of invalid params names the field that is wrong", () => {
  expect(rejected(COMMIT, { scope: "nobody", opId: "", ops: [] })).toStrictEqual({
    error: "InvalidParams",
    requestId: REQUEST.requestId,
    message: expect.stringMatching(/^params\.scope: \S/u) as unknown,
    retryable: false,
  });
  expect(rejected(COMMIT, null).message).toMatch(/^params: \S/u);
});

test("[ERR-3] opIndex is the position of the failing op in a commit", () => {
  const { shape } = subject("Op");
  const commits = fc.record({ ops: fc.array(shape.valid), opId: RULES.uuid.valid, at: fc.nat(), bad: RULES.id.near });

  fc.assert(
    fc.property(commits, ({ ops, opId, at, bad }) => {
      fc.pre(!RULES.id.accepts(bad));
      const opIndex = at % (ops.length + 1);
      const failing = { op: "delete", collection: "tasks", id: bad };
      const params = { scope: "page", opId, ops: [...ops.slice(0, opIndex), failing, ...ops.slice(opIndex)] };

      expect(rejected(COMMIT, params)).toMatchObject({ opIndex, message: expect.stringContaining(`params.ops.${opIndex}.id: `) as unknown });
    }),
  );
});

test("[ERR-3] opIndex is absent when no op is at fault", () => {
  const list = METHOD_SCHEMAS["agentpages/state/list"].result;

  expect(rejected(COMMIT, { scope: "page", opId: "", ops: [] })).not.toHaveProperty("opIndex");
  expect(rejected(COMMIT, { scope: "page", opId: OP_ID, ops: "none" })).toStrictEqual({
    error: "InvalidParams",
    requestId: REQUEST.requestId,
    message: expect.stringMatching(/^params\.ops: \S/u) as unknown,
    retryable: false,
  });
  expect(rejected(list, { documents: [null], seq: 1 })).not.toHaveProperty("opIndex");
});

const parsed = (block: { text: string }): unknown => JSON.parse(block.text);

test.each(ERROR_NAMES)("[STORE-3] a failed tool call returns isError with { error: %s } & ErrorData", (error) => {
  const failed = { ...inputOf(error), retryable: failure(inputOf(error)).retryable };
  const result = toToolError(failure(inputOf(error)));

  expect(result).toStrictEqual({ isError: true, structuredContent: failed, content: [expect.anything()] });
  expect(result.content).toStrictEqual([{ type: "text", text: expect.any(String) as unknown }]);
  expect(result.content.map(parsed)).toStrictEqual([failed]);
  expect(verdict(subject("ErrorData").schema, result.structuredContent)).toBe(true);
});

test("a JSON-RPC error carries the code of its name and reads back as the same failure", () => {
  fc.assert(
    fc.property(inputs, (input) => {
      const error = toJsonRpcError(failure(input));
      const { error: _name, ...data } = failure(input);

      expect(error).toStrictEqual({
        code: errorRows.find((row) => row.name === input.error)?.code,
        message: input.message,
        data,
      });
      expect(fromJsonRpcError(structuredClone(error))).toStrictEqual(failure(input));
    }),
  );
});

test("an error that is not one of this protocol's is not a failure", () => {
  const data = { ...REQUEST, retryable: false };

  expect(fromJsonRpcError({ code: METHOD_NOT_FOUND, message: "Method not found" })).toBeUndefined();
  expect(fromJsonRpcError({ code: METHOD_NOT_FOUND, message: "Method not found", data })).toBeUndefined();
  expect(fromJsonRpcError({ code: -32_050, message: "Not found", data: { message: 1 } })).toBeUndefined();
  expect(fromJsonRpcError("Not found")).toBeUndefined();
});

test("a RateLimited failure always carries retryAfterMs", () => {
  const limited = { ...REQUEST, retryable: true, error: "RateLimited" };

  expect(fromJsonRpcError({ code: -32_056, message: REQUEST.message, data: { ...REQUEST, retryable: true } })).toBeUndefined();
  expect(verdict(FailureSchema, limited)).toBe(false);
  expect(verdict(FailureSchema, { ...limited, retryAfterMs: 1500 })).toBe(true);
  expect(verdict(FailureSchema, { ...limited, error: "Unavailable" })).toBe(true);
  expect(verdict(FailureSchema, { ...limited, error: "Unknown" })).toBe(false);
});
