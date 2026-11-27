import {
  ERROR_NAMES,
  type ErrorName,
  failure,
  type FailureInput,
  FailureSchema,
  fromJsonRpcError,
  ID_PATTERN,
  invalidParams,
  METHOD_NOT_FOUND,
  LogRecordSchema,
  METHOD_SCHEMAS,
  type Schema,
  toJsonRpcError,
  TOOL_SCHEMAS,
  toToolError,
  TREE_INDEX_PATTERN,
  TreeNodeSchema,
  validate,
} from "@agentpages/protocol";
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { RESERVED_FORMAT, RULES } from "./support/rules.ts";
import { shapeOfType } from "./support/shapes.ts";
import { errorRows } from "./support/spec.ts";
import { subject, SUBJECTS, verdict } from "./support/subjects.ts";
import { withChange, withReplacement } from "./support/values.ts";

const REQUEST = { requestId: "request-1", message: "What was wrong." };

const OP_ID = "0b1f4c7e-52a9-4d38-8e6f-a1c2d3e4f5a6";

const COMMIT = subject("agentpages/state/commit params").schema;

const inputOf = (error: ErrorName): FailureInput =>
  error === "RateLimited" ? { ...REQUEST, error, retryAfterMs: 1500 } : { ...REQUEST, error };

interface Detail {
  requestId: string;
  message: string;
  retryAfterMs: number;
  opIndex?: number;
}

const details: fc.Arbitrary<Detail> = fc.record(
  { requestId: RULES.id.valid.map(String), message: fc.string(), opIndex: fc.nat(), retryAfterMs: fc.nat() },
  { requiredKeys: ["requestId", "message", "retryAfterMs"] },
);

const detailed = ([error, detail]: [ErrorName, Detail]): FailureInput =>
  error === "RateLimited" ? { ...detail, error } : { ...detail, error };

const inputs: fc.Arbitrary<FailureInput> = fc.tuple(fc.constantFrom(...ERROR_NAMES), details).map(detailed);

const rowOf = (error: string): (typeof errorRows)[number] => {
  const row = errorRows.find((candidate) => candidate.name === error);
  if (row === undefined) throw new Error(`The spec's table has no ${error}.`);
  return row;
};

const rejected = (schema: Schema<unknown>, params: unknown): ReturnType<typeof invalidParams> => {
  const result = validate(schema, params);
  if (result.ok) throw new Error("These params are valid.");
  return invalidParams({ requestId: REQUEST.requestId, issues: result.issues });
};

/** The JSON-RPC error of a failure, with its `data` changed. */
const wireError = (error: ErrorName, change: object): unknown => {
  const sent = toJsonRpcError(failure(inputOf(error)));
  return { ...sent, data: { ...sent.data, ...change } };
};

test.each(ERROR_NAMES)("[ERR-2] a %s failure is retryable exactly when the table says so", (error) => {
  const { retryable } = rowOf(error);

  expect(failure(inputOf(error)).retryable).toBe(retryable);
  expect(toJsonRpcError(failure(inputOf(error))).data.retryable).toBe(retryable);
  expect(toToolError(failure(inputOf(error))).structuredContent.retryable).toBe(retryable);
});

test.each(ERROR_NAMES)("[ERR-2] a %s failure whose retryable contradicts the table is not one", (error) => {
  const { retryable } = rowOf(error);

  expect(verdict(FailureSchema, { ...failure(inputOf(error)), retryable })).toBe(true);
  expect(verdict(FailureSchema, { ...failure(inputOf(error)), retryable: !retryable })).toBe(false);
  expect(fromJsonRpcError(wireError(error, { retryable }))).toStrictEqual(failure(inputOf(error)));
  expect(fromJsonRpcError(wireError(error, { retryable: !retryable }))).toBeUndefined();
});

test("[ERR-3] the message of invalid params names the field that is wrong", () => {
  expect(rejected(COMMIT, { scope: "nobody", opId: "", ops: [] })).toStrictEqual({
    error: "InvalidParams",
    requestId: REQUEST.requestId,
    message: 'params.scope: Expected ("page" | "viewer")',
    retryable: false,
  });
  expect(rejected(COMMIT, null).message).toBe("params: Expected Object");
  expect(rejected(COMMIT, { scope: "page", opId: OP_ID, ops: [{ op: "put" }] }).message).toMatch(/^params\.ops\.0\.\w+: Expected \S/u);
});

test("[ERR-3] the message says what was expected of a number, a map and a JSON object", () => {
  const { schema, shape } = subject("types_publish params");
  const type = fc.sample(shape.valid, 1)[0];
  const changed = (path: string[], replacement: unknown): unknown => withChange(type, { path, replacement, remove: false });

  expect(rejected(schema, changed(["baseVersion"], 0.5)).message).toBe("params.baseVersion: Expected integer");
  expect(rejected(schema, changed(["baseVersion"], -1)).message).toBe("params.baseVersion: Expected >=0");
  expect(rejected(schema, changed(["exports"], { [RESERVED_FORMAT]: {} })).message).toBe(
    `params.exports.${RESERVED_FORMAT}: Expected key !"${RESERVED_FORMAT}"`,
  );
  expect(rejected(schema, changed(["collections"], { tasks: { schema: [] } })).message).toBe(
    "params.collections.tasks.schema: Expected a JSON object",
  );
  expect(rejected(schema, changed(["collections"], [])).message).toBe("params.collections: Expected a JSON object");
});

test("[ERR-3] the message names the field of a tree node and the day of a timestamp that is wrong", () => {
  const record = fc.sample(subject("LogRecord").shape.valid, 1)[0];
  const dated = withChange(record, { path: ["at"], replacement: "2023-02-29T00:00:00.000Z", remove: false });

  expect(rejected(TreeNodeSchema, { parent: 1, index: "a" }).message).toBe("params.parent: Expected string");
  expect(rejected(TreeNodeSchema, { parent: null, index: "a0" }).message).toBe(
    `params.index: Expected ${String(TREE_INDEX_PATTERN)}`,
  );
  expect(rejected(LogRecordSchema, dated).message).toBe("params.at: Expected a day that exists");
});

test("[ERR-3] an issue without a path is about the params as a whole", () => {
  expect(invalidParams({ requestId: REQUEST.requestId, issues: [{ message: "Expected a request" }] })).toStrictEqual({
    error: "InvalidParams",
    requestId: REQUEST.requestId,
    message: "params: Expected a request",
    retryable: false,
  });
});

test("a schema is a Standard Schema that says where each issue is", () => {
  const standard = METHOD_SCHEMAS["agentpages/state/commit"].params["~standard"];
  const params = { scope: "page", opId: OP_ID, ops: [{ op: "delete", collection: "tasks", id: "" }] };
  const issues = [{ message: `Expected ${String(ID_PATTERN)}`, path: ["ops", 0, "id"] }];

  expect(standard).toStrictEqual({ version: 1, vendor: "agentpages", validate: expect.any(Function) as unknown });
  expect(standard.validate({ ...params, ops: [] })).toStrictEqual({ value: { ...params, ops: [] } });
  expect(standard.validate(params)).toStrictEqual({ issues });
  expect(validate(COMMIT, params)).toStrictEqual({ ok: false, issues });
});

test("[ERR-3] the message never repeats a value that was sent, and stays short", () => {
  const sent = `secret-${"s".repeat(100_000)}`;
  const requests = fc.constantFrom(...SUBJECTS).chain(({ schema, shape }) =>
    fc.tuple(fc.constant(schema), withReplacement(shape, sent), withReplacement(shape, { ["k".repeat(1000)]: sent })),
  );

  fc.assert(
    fc.property(requests, ([schema, ...changed]) => {
      const messages = changed.filter((value) => !verdict(schema, value)).map((value) => rejected(schema, value).message);

      expect(messages.filter(leaks)).toStrictEqual([]);
    }),
  );
  expect(rejected(TOOL_SCHEMAS.files_put.params, { blob: sent }).message.length).toBeLessThan(300);
  expect(rejected(subject("TypeInfo").schema, withChange(fc.sample(subject("TypeInfo").shape.valid, 1)[0], { path: ["exports"], replacement: { [`${sent} `]: 1 }, remove: false })).message).toHaveLength(300);
});

test("[ERR-3] opIndex is the position of the failing op in a commit", () => {
  const commits = fc.record({ ops: fc.array(shapeOfType("Op").valid), opId: RULES.uuid.valid, at: fc.nat(), bad: RULES.id.near });

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
    message: "params.ops: Expected Array",
    retryable: false,
  });
  expect(rejected(list, { documents: [null], seq: 1 })).not.toHaveProperty("opIndex");
});

const leaks = (message: string): boolean => message.includes("secret") || message.length > 300;

const parsedText = (block: { text: string }): unknown => JSON.parse(block.text);

test.each(ERROR_NAMES)("[STORE-3] a failed tool call returns isError with { error: %s } & ErrorData, also as text", (error) => {
  const failed = { ...inputOf(error), retryable: rowOf(error).retryable };
  const result = toToolError(failure(inputOf(error)));

  expect(result).toStrictEqual({ isError: true, structuredContent: failed, content: [expect.anything()] });
  expect(result.content).toStrictEqual([{ type: "text", text: expect.any(String) as unknown }]);
  expect(result.content.map(parsedText)).toStrictEqual([failed]);
  expect(verdict(FailureSchema, result.structuredContent)).toBe(true);
});

test("a JSON-RPC error carries the code of its name and reads back as the same failure", () => {
  fc.assert(
    fc.property(inputs, (input) => {
      const error = toJsonRpcError(failure(input));
      const { error: _name, ...data } = failure(input);

      expect(error).toStrictEqual({ code: rowOf(input.error).code, message: input.message, data });
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

test.each(ERROR_NAMES)("a %s failure must carry retryAfterMs exactly when the table says it carries it", (error) => {
  const { retryAfterMs: _carried, ...bare } = { retryAfterMs: 0, ...failure(inputOf(error)) };

  expect(verdict(FailureSchema, { ...bare, retryAfterMs: 1500 })).toBe(true);
  expect(verdict(FailureSchema, bare)).toBe(!rowOf(error).meaning.includes("Carries retryAfterMs"));
  expect(verdict(FailureSchema, { ...bare, error: "Unknown" })).toBe(false);
});

test("a failure reads back without the fields the spec does not know", () => {
  fc.assert(
    fc.property(inputs, (input) => {
      const result = validate(FailureSchema, { ...failure(input), extra: 1 });

      expect(result).toStrictEqual({ ok: true, value: failure(input) });
    }),
  );
});
